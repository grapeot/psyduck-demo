import {chromium} from 'playwright';
import {mkdir,readFile,copyFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {motionModel} from '../src/rig.js';
if(motionModel==='shoulder_flap')throw new Error('R3 artifact collector is historical. Use tests/flap-study.mjs final for current evidence.');
const output='test-results/pose-reference-round3';
await mkdir(output,{recursive:true});
const run=JSON.parse(await readFile('test-results/browser-report.json','utf8'));
assert.match(run.output,/^test-results\/browser-run-[a-zA-Z0-9]+$/);
const app=[];
for(const file of ['idle.png','raiseOneArm.png','holdHead.png','holdHead-quarter.png','mobile.png']){
  const path=`${output}/app-${file}`;await copyFile(`${run.output}/${file}`,path);app.push(path);
}
for(const [source,name]of [['test-results/browser-report.json','browser-report.json'],['test-results/clean-build-report.json','clean-build-report.json'],['test-results/palm-shape.json','palm-shape.json']])await copyFile(source,`${output}/${name}`);
const browser=await chromium.launch({channel:'chrome',headless:true});
const sheets=[];
try{
  const page=await browser.newPage();
  const renderSheet=async(name,paths,labels,appCrop=false)=>{
    const images=await Promise.all(paths.map(async path=>(await readFile(path)).toString('base64')));
    const size=await page.evaluate(async({images,labels,appCrop})=>{
      const canvas=document.createElement('canvas');canvas.width=1800;canvas.height=appCrop?600:Math.ceil(images.length/3)*620;
      const ctx=canvas.getContext('2d');ctx.fillStyle=appCrop?'#dfe6ce':'#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
      for(let i=0;i<images.length;i++){
        const image=new Image();image.src='data:image/png;base64,'+images[i];await image.decode();
        const x=i%3*600,y=Math.floor(i/3)*620;
        const sourceWidth=appCrop?image.naturalWidth-330:image.naturalWidth,scale=600/sourceWidth;
        ctx.drawImage(image,0,0,sourceWidth,image.naturalHeight,x,y+20,600,image.naturalHeight*scale);
        ctx.fillStyle='#334a3e';ctx.font='16px monospace';ctx.textAlign='center';ctx.fillText(labels[i],x+300,y+16);
      }
      document.body.style.margin='0';document.body.replaceChildren(canvas);return{width:canvas.width,height:canvas.height};
    },{images,labels,appCrop});
    await page.setViewportSize(size);const path=`${output}/${name}.png`;await page.screenshot({path});sheets.push(path);
  };
  await renderSheet('app-actions',['holdHead.png','holdHead-quarter.png','raiseOneArm.png'].map(f=>`${output}/app-${f}`),['APP / hold','APP / quarter','APP / wave'],true);
  for(const pose of ['holdHead','idle','armsSpread','holdTilt']){
    const views=['front','rightQuarter','leftQuarter','rightSide','leftSide','back'];
    await renderSheet(`${pose}-views`,views.map(v=>`${output}/${pose}-${v}.png`),views.map(v=>`${pose} / ${v}`));
  }
  await renderSheet('wave-views',['front','leftQuarter','leftSide'].map(v=>`${output}/waveLeft-${v}.png`),['wave / front','wave / quarter','wave / side']);
}finally{await browser.close();}
await writeFile(`${output}/delivery.json`,JSON.stringify({browserRun:run.output,appScreenshots:app,sheets,composition:'uniform scale; app contact sheet crops the control panel only, individual full app screenshots retained'},null,2));
console.log({app,sheets});
