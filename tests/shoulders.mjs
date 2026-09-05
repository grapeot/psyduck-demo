import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
const label=process.argv[2]||'after';
if(!/^(before|after|iteration[0-9]+)$/.test(label)) throw new Error('Expected before, after or iterationN');
const output=`test-results/shoulder-${label}`;
await mkdir(output, {recursive:label!=='before'});
if(label==='before'||label==='after'){
  const latest=JSON.parse(await readFile('test-results/browser-report.json','utf8'));
  const appOutput=latest.output||'test-results';
  for(const file of ['armsSpread.png','raiseOneArm.png','holdHead-quarter.png','holdHead-side.png','idle.png','headTilt-back.png','headTilt-side.png']) await copyFile(`${appOutput}/${file}`,`${output}/${label==='before'?'original':'app'}-${file}`);
}
const server=await createServer({server:{host:'127.0.0.1',port:0}});await server.listen();
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
  const page=await browser.newPage({viewport:{width:700,height:700}});
  await page.addInitScript(()=>{navigator.mediaDevices.getUserMedia=()=>{throw new Error('Camera forbidden in shoulder inspection');};});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${server.resolvedUrls.local[0]}tests/shoulder-view.html`);await page.waitForFunction(()=>window.renderReady);
  const matrix=await page.evaluate(()=>window.shoulderMatrix),shots=[];
  for(const pose of Object.keys(matrix.poses)) for(const view of Object.keys(matrix.views)) {
    await page.evaluate(([pose,view])=>window.inspectShoulder(pose,view),[pose,view]);
    const file=`${output}/${pose}-${view}.png`;await page.screenshot({path:file});shots.push(file);
  }
  const sheet=await browser.newPage({viewport:{width:1800,height:1240}});
  for(const pose of Object.keys(matrix.poses)) {
    await sheet.setContent(`<style>body{margin:0;display:grid;grid-template-columns:repeat(3,600px);background:#edf0e2;font:16px monospace}figure{margin:0}img{width:600px;height:600px}figcaption{text-align:center;height:20px}</style>${Object.keys(matrix.views).map(view=>`<figure><img src="${server.resolvedUrls.local[0]}${output}/${pose}-${view}.png"><figcaption>${pose} / ${view}</figcaption></figure>`).join('')}`);
    await sheet.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth));
    await sheet.screenshot({path:`${output}/${pose}-views.png`});
  }
  await writeFile(`${output}/matrix.json`,JSON.stringify({matrix,shots,errors},null,2));
  if(errors.length) throw new Error(errors.join('\n'));
  console.log(output,shots.length,'views rendered');
} finally {await browser.close();await server.close();}
