import {mkdir,copyFile,readFile,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {motionModel} from '../src/rig.js';
if(motionModel==='shoulder_flap')throw new Error('R2/R3 snapshots are historical. Use tests/flap-snapshot.mjs for shoulder_flap.');
const label=process.argv[2];
const round=process.argv[3]||'round2';
if(!['round2','round3'].includes(round))throw new Error('Expected round2 or round3');
if(!/^(input|candidate[1-3]|final)$/.test(label))throw new Error('Expected round2 input, candidate1..3, or final');
const root=`test-results/pose-reference-${round}/snapshots/${label}`;
await mkdir(dirname(root),{recursive:true});await mkdir(root);
const files={};
for(const file of ['src/rig.js','scripts/build-rig.js','public/models/psyduck_rigged.glb',...(round==='round3'?['src/retarget.js']:[])]){
  await mkdir(dirname(`${root}/${file}`),{recursive:true});await copyFile(file,`${root}/${file}`);
  files[file]={sha256:createHash('sha256').update(await readFile(file)).digest('hex'),bytes:(await readFile(file)).length};
}
await writeFile(`${root}/snapshot.json`,JSON.stringify({round:Number(round.slice(-1)),label,files},null,2));console.log(root);
