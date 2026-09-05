import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdir,copyFile,readFile,writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const stage=process.argv[2];
if(!['baseline','round1','round2','round3'].includes(stage))throw new Error('Expected baseline or round1..3; no round4');
const candidate=process.argv[3];
if(candidate&&!/^candidate[1-3]$/.test(candidate))throw new Error('Expected candidate1..3');
const base='test-results/pose-reference-baseline',output=stage==='baseline'?base:`test-results/pose-reference-${stage}${candidate?'/'+candidate:''}`;
const protectedFiles=['public/models/psyduck_rigged.glb','src/rig.js','scripts/build-rig.js'];
const digest=b=>createHash('sha256').update(b).digest('hex');
if(stage==='baseline'){
  await mkdir(base);
  const manifest={files:{}};
  for(const file of protectedFiles){await mkdir(dirname(`${base}/${file}`),{recursive:true});await copyFile(file,`${base}/${file}`);manifest.files[file]=digest(await readFile(file));}
  await writeFile(`${base}/snapshot.json`,JSON.stringify(manifest,null,2));
}else{
  await mkdir(output,{recursive:true});
  const manifest=JSON.parse(await readFile(`${base}/snapshot.json`,'utf8'));
  for(const file of protectedFiles){assert.equal(digest(await readFile(`${base}/${file}`)),manifest.files[file],`Baseline overwritten: ${file}`);if(stage==='round1'&&file!=='src/rig.js')assert.equal(digest(await readFile(file)),manifest.files[file],`Round 1 may not change geometry/weights: ${file}`);}
}
const sources=[
  {id:'sugimori',file:'references/psyduck_sugimori.jpg',pose:'holdHead',view:'rightQuarter',center:[209/418,170/541],width:258/418,source:'用户指定的官方 Sugimori 抱头主参考；本地既有文件，未补造下载 URL。'},
  {id:'gen1',file:'references/psyduck_gen1_jp.jpg',pose:'holdHead',view:'shallowRight',center:[171.5/356,127/400],width:217/356,source:'用户指定的另一官方初代日版抱头画法；只作共享动作轮廓约束，不假定与主参考是完全相同的三维模型。'},
  {id:'rescue-team-dx',file:'references/psyduck_mystery_dungeon.jpg',pose:'waveLeft',view:'leftQuarter',center:[.525,.31],width:.445,source:'用户提供的第三方转载页面标注 Source Pokemon PR；本轮已实际读图，未独立重新核实网页。',url:'https://nintendoeverything.com/pokemon-mystery-dungeon-rescue-team-dx-official-announcement-screenshots-art'}
];
// Optional visual study only: these local copyrighted references are not
// distributed and are never required by npm test, build, or test:browser.
for(const s of sources)s.sha256=digest(await readFile(s.file));
const cases={holdHead:['front','rightQuarter','rightSide','leftQuarter','leftSide','back','shallowRight'],raiseOneArm:['front','rightQuarter','rightSide'],waveLeft:['front','leftQuarter','leftSide']};
if(stage==='round3')for(const pose of ['idle','armsSpread','holdTilt'])cases[pose]=['front','rightQuarter','leftQuarter','rightSide','leftSide','back'];
const server=await createServer({server:{host:'127.0.0.1',port:0}});await server.listen();
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
  const page=await browser.newPage({viewport:{width:1000,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{navigator.mediaDevices.getUserMedia=()=>{throw new Error('No camera in pose reference study');};});
  await page.goto(`${server.resolvedUrls.local[0]}tests/pose-reference-view.html${stage==='baseline'?'?baseline':''}`);await page.waitForFunction(()=>window.renderReady);
  const setup=await page.evaluate(()=>window.referenceSetup),renders={};
  for(const [pose,views] of Object.entries(cases))for(const view of views){
    const key=`${pose}-${view}`,data=await page.evaluate(([p,v])=>window.renderReference(p,v),[pose,view]);
    const path=`${output}/${key}.png`;await page.screenshot({path});renders[key]={...data,path,sha256:digest(await readFile(path))};
  }
  const data={stage,setup,renders,sources,alignment:{targetHeadCenter:[280,250],targetHeadWidth:300,panel:[560,820],referenceAnchors:'手动估计头中心/头宽，头轮廓被前肢遮挡时是近似锚点；不按整身/抬脚包围框缩放。',transform:'uniform scale + translation only, no anisotropic scaling or reference rotation'}};
  await writeFile(`${output}/measurements.json`,JSON.stringify(data,null,2));
  const previousPath=stage==='round3'?'test-results/pose-reference-round2':stage==='round2'?'test-results/pose-reference-round1':base;
  const previous=stage==='baseline'?null:JSON.parse(await readFile(`${previousPath}/measurements.json`,'utf8'));
  if(previous){assert.deepEqual(setup.views,previous.setup.views);assert.deepEqual(setup.camera,previous.setup.camera);assert.deepEqual(setup.lighting,previous.setup.lighting);}
  if(stage==='round3'){assert.deepEqual(setup.armBind,previous.setup.armBind);for(const name of Object.keys(previous.setup.poses))assert.deepEqual(setup.poses[name],previous.setup.poses[name]);}
  const sheets=await browser.newPage({viewport:{width:previous?1680:1120,height:860}});
  await sheets.goto(server.resolvedUrls.local[0]+'tests/pose-reference-view.html');
  const comparisons=[];
  const groups=[{prefix:'',previous,previousLabel:stage==='round3'?'ROUND2':stage==='round2'?'ROUND1':'BASELINE',currentLabel:stage.toUpperCase()}];
  if(stage==='round3')groups.push({prefix:'final-',previous:JSON.parse(await readFile(`${base}/measurements.json`,'utf8')),previousLabel:'ORIGINAL_BASELINE',currentLabel:'FINAL'});
  for(const group of groups){
  for(const ref of sources){
    const key=`${ref.pose}-${ref.view}`;
    const result=await sheets.evaluate(async({ref,entry,previousEntry,previousLabel,currentLabel})=>{
      const load=async(path)=>{const image=new Image();image.src='/'+path;await image.decode();return image;};
      const image=await load(ref.file),panels=[{image,center:[ref.center[0]*image.naturalWidth,ref.center[1]*image.naturalHeight],width:ref.width*image.naturalWidth,label:`REFERENCE / ${ref.id}`}];
      if(previousEntry)panels.push({image:await load(previousEntry.path),...previousEntry.headAlignment,label:previousLabel});
      panels.push({image:await load(entry.path),...entry.headAlignment,label:currentLabel});
      const canvas=document.createElement('canvas');canvas.width=panels.length*560;canvas.height=860;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);
      const transforms=[];
      panels.forEach((p,i)=>{
        const scale=300/p.width,tx=i*560+280-p.center[0]*scale,ty=40+250-p.center[1]*scale;
        ctx.save();ctx.beginPath();ctx.rect(i*560,40,560,820);ctx.clip();ctx.drawImage(p.image,tx,ty,p.image.naturalWidth*scale,p.image.naturalHeight*scale);ctx.restore();
        ctx.strokeStyle='#87968266';ctx.setLineDash([5,7]);ctx.beginPath();ctx.moveTo(i*560+130,290);ctx.lineTo(i*560+430,290);ctx.stroke();ctx.setLineDash([]);
        ctx.fillStyle='#334a3e';ctx.font='16px monospace';ctx.textAlign='center';ctx.fillText(p.label,i*560+280,25);
        transforms.push({label:p.label,sourceSize:[p.image.naturalWidth,p.image.naturalHeight],sourceHeadCenter:p.center,sourceHeadWidth:p.width,uniformScale:scale,translation:[tx-i*560,ty]});
      });
      document.body.replaceChildren(canvas);return{transforms};
    },{ref,entry:renders[key],previousEntry:group.previous?.renders[key],previousLabel:group.previousLabel,currentLabel:group.currentLabel});
    const path=`${output}/${group.prefix}compare-${ref.id}.png`;await sheets.screenshot({path});comparisons.push({reference:ref.id,path,...result});
  }
  }
  await writeFile(`${output}/alignment.json`,JSON.stringify({alignment:data.alignment,comparisons},null,2));
  if(previous){
    const regression={};for(const [key,render]of Object.entries(renders))if(!key.startsWith('holdHead-')&&previous.renders[key])regression[key]={samePose:JSON.stringify(render.pose)===JSON.stringify(previous.renders[key].pose),samePixels:render.sha256===previous.renders[key].sha256};
    await writeFile(`${output}/wave-regression.json`,JSON.stringify(regression,null,2));
    if(stage==='round1')assert.ok(Object.values(regression).every(r=>r.samePose),'Round1 wave pose must remain the regression control');
    if(stage==='round2')assert.ok(Object.values(regression).every(r=>!r.samePose),'Round2 must exercise the revised wave');
    if(stage==='round3')assert.ok(Object.values(regression).every(r=>r.samePose),'Round3 must preserve R2 wave angles');
    if(['round2','round3'].includes(stage))assert.equal(JSON.parse(await readFile('test-results/shoulder-structure.json','utf8')).assetSha256,digest(await readFile('public/models/psyduck_rigged.glb')),'Run structure test for this exact GLB before capturing');
    await copyFile('test-results/shoulder-structure.json',`${output}/structure.json`);
  }
  assert.equal(errors.length,0,errors.join('\n'));console.log(output,Object.keys(renders).length,'views; reference comparisons captured');
}finally{await browser.close();await server.close();}
