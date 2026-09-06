import {mkdir,copyFile,readFile,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {createHash} from 'node:crypto';
const label=process.argv[2];
if(!/^(input|candidate[1-3]|final)$/.test(label))throw new Error('Expected input, candidate1..3 or final');
const root=`test-results/shoulder-flap/snapshots/${label}`;
await mkdir(dirname(root),{recursive:true});await mkdir(root);
const files={};
for(const file of ['src/rig.js','src/retarget.js','scripts/build-rig.js','public/models/psyduck_rigged.glb',...(label==='input'?['tests/flap-motion.test.mjs','tests/rig-structure.test.mjs','tests/retarget.test.mjs']:[])]){
  await mkdir(dirname(`${root}/${file}`),{recursive:true});await copyFile(file,`${root}/${file}`);
  const bytes=await readFile(file);files[file]={sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};
}
await writeFile(`${root}/snapshot.json`,JSON.stringify({label,files},null,2));console.log(root);
