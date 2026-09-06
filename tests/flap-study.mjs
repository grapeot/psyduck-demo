import {chromium} from 'playwright';
import {createServer} from 'vite';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const label=process.argv[2];if(!/^(candidate[1-3]|final)$/.test(label))throw new Error('Expected candidate1..3 or final');
const output=`test-results/shoulder-flap/${label}`;await mkdir(output,{recursive:true});
const early=JSON.parse(await readFile('test-results/pose-reference-baseline/measurements.json','utf8'));
const rejected=JSON.parse(await readFile('test-results/pose-reference-round3/measurements.json','utf8'));
const server=await createServer({server:{host:'127.0.0.1',port:0}});await server.listen();
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
  const page=await browser.newPage({viewport:{width:1000,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>{navigator.mediaDevices.getUserMedia=()=>{throw new Error('Camera forbidden in flap study');};});
  await page.goto(server.resolvedUrls.local[0]+'tests/flap-view.html');await page.waitForFunction(()=>window.renderReady);
  const setup=await page.evaluate(()=>window.flapSetup),renders={},transition=[];
  for(const pose of Object.keys(setup.poses))for(const view of Object.keys(setup.views)){
    const data=await page.evaluate(([p,v])=>window.flapRender(p,v),[pose,view]),path=`${output}/${pose}-${view}.png`;await page.screenshot({path});renders[`${pose}-${view}`]={...data,path};
  }
  for(let i=0;i<=8;i++){
    const t=i/8,pose=Object.fromEntries(Object.keys(setup.poses.idle).map(k=>[k,setup.poses.idle[k]+(setup.poses.holdHead[k]-setup.poses.idle[k])*t]));
    const data=await page.evaluate(p=>window.flapRender(p,'rightQuarter'),pose),path=`${output}/transition-${i}.png`;await page.screenshot({path});transition.push({t,...data,path});
  }
  const sheet=await browser.newPage();
  const composites=[];
  for(const pose of ['holdHead','raiseOneArm','referenceHold']){
    const key=`${pose==='referenceHold'?'holdHead':pose}-rightQuarter`,entries=pose==='referenceHold'
      ?[{label:'OFFICIAL / Sugimori (different artwork pose)',path:'references/psyduck_sugimori.jpg',headAlignment:{center:[209,170],width:258},pose:'official artwork with lifted foot'},{label:'EARLY_CONNECTED / historical articulated',...early.renders[key]},{label:'CURRENT / shoulder_flap',...renders[key]}]
      :[{label:'EARLY_CONNECTED / historical articulated',...early.renders[key]},{label:'R3 / rejected articulated',...rejected.renders[key]},{label:'CURRENT / shoulder_flap',...renders[key]}];
    await sheet.setViewportSize({width:1680,height:860});
    const transforms=await sheet.evaluate(async({entries,url})=>{
      const canvas=document.createElement('canvas');canvas.width=1680;canvas.height=860;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1680,860);const transforms=[];
      for(let i=0;i<entries.length;i++){const e=entries[i],image=new Image();image.src=url+e.path;await image.decode();const scale=300/e.headAlignment.width,x=i*560+280-e.headAlignment.center[0]*scale,y=290-e.headAlignment.center[1]*scale;ctx.save();ctx.beginPath();ctx.rect(i*560,40,560,820);ctx.clip();ctx.drawImage(image,x,y,image.naturalWidth*scale,image.naturalHeight*scale);ctx.restore();ctx.fillStyle='#334a3e';ctx.font='14px monospace';ctx.textAlign='center';ctx.fillText(e.label,i*560+280,25);transforms.push({label:e.label,pose:e.pose,scale,translation:[x-i*560,y]});}
      document.body.style.margin='0';document.body.replaceChildren(canvas);return transforms;
    },{entries,url:server.resolvedUrls.local[0]});
    const path=`${output}/compare-${pose}.png`;await sheet.screenshot({path});composites.push({path,transforms});
  }
  for(const pose of [...Object.keys(setup.poses),'transition']){
    const entries=pose==='transition'?transition.map((r,i)=>({path:r.path,label:`t=${i}/8`})) : Object.keys(setup.views).map(v=>({path:renders[`${pose}-${v}`].path,label:`${pose}/${v}`}));
    const height=Math.ceil(entries.length/3)*520;await sheet.setViewportSize({width:1500,height});
    await sheet.setContent(`<style>body{margin:0;display:grid;grid-template-columns:repeat(3,500px);font:14px monospace}figure{margin:0}img{width:500px;height:500px}figcaption{text-align:center;height:20px}</style>${entries.map(e=>`<figure><img src="${server.resolvedUrls.local[0]}${e.path}"><figcaption>${e.label}</figcaption></figure>`).join('')}`);
    await sheet.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth));await sheet.screenshot({path:`${output}/${pose}-sheet.png`});
  }
  const assetSha256=createHash('sha256').update(await readFile('public/models/psyduck_rigged.glb')).digest('hex');
  await writeFile(`${output}/measurements.json`,JSON.stringify({assetSha256,setup,renders,transition,composites,errors,reference:{file:'references/psyduck_sugimori.jpg',sha256:createHash('sha256').update(await readFile('references/psyduck_sugimori.jpg')).digest('hex'),source:'Existing official-art local reference selected by the user; no redistribution license implied.'},alignment:'same fixed cameras, 300px skull width; uniform scale and translation only. Historical poses/models are explicitly different. The early connected snapshot had seven bones; it is a static appearance comparison, not evidence of shoulder-only motion.'},null,2));
  for(const name of ['shoulder-structure','flap-motion','flap-head-safety'])try{await copyFile(`test-results/${name}.json`,`${output}/${name}.json`);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(label==='final'){
    const run=JSON.parse(await readFile('test-results/browser-report.json','utf8'));
    assert.equal(run.checks.connectedSkin.motionModel,'shoulder_flap','Run the current production browser test before final delivery');
    assert.match(run.output,/^test-results\/browser-run-[a-zA-Z0-9]+$/);
    for(const file of ['idle.png','holdHead.png','holdHead-quarter.png','raiseOneArm.png','mobile.png'])await copyFile(`${run.output}/${file}`,`${output}/app-${file}`);
    for(const file of ['browser-report.json','clean-build-report.json'])await copyFile(`test-results/${file}`,`${output}/${file}`);
  }
  assert.equal(errors.length,0,errors.join('\n'));console.log(output,Object.keys(renders).length,'views and',transition.length,'synthetic time samples');
}finally{await browser.close();await server.close();}
