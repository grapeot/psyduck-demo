import {readFile,writeFile} from 'node:fs/promises';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {armBind,applyPose,preset} from '../src/rig.js';
const input='test-results/pose-reference-round2/snapshots/input';
const oldBind=(await import(`../${input}/src/rig.js`)).armBind;
const load=async path=>{const b=await readFile(path);return(await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')).scene;};
const before=await load(`${input}/public/models/psyduck_rigged.glb`),after=await load('public/models/psyduck_rigged.glb');
const results={method:'相同R2角度分别驱动R1和R2的真实重载骨架；poseOnly是反事实诊断，不是安全交付候选。',poses:{},geometryPreservation:{}};
for(const name of ['holdHead','raiseOneArm']){
  const pose=preset(name);results.poses[name]={pose};
  for(const [label,root,bind]of [['poseOnlyOnRound1',before,oldBind],['round2AssetAndPose',after,armBind]]){
    applyPose(root,pose);const sideData={};
    for(const side of ['left','right']){const elbow=root.getObjectByName(`${side}Elbow`);sideData[side]={elbow:elbow.getWorldPosition(elbow.position.clone()).toArray(),endpoint:elbow.localToWorld(elbow.position.clone().set(0,-bind.lower,0)).toArray()};}
    results.poses[name][label]=sideData;
  }
}
const coordinates=(root,filter)=>{
  const p=root.getObjectByName('PsyduckSurface').geometry.attributes.position,points=[];
  for(let i=0;i<p.count;i++)if(filter(p.getY(i)))points.push([p.getX(i),p.getY(i),p.getZ(i)].map(v=>v.toFixed(6)).join(','));
  return points.sort();
};
for(const [name,filter]of [['upperHead',y=>y>2.3],['lowerBody',y=>y<.7]]){
  const a=coordinates(before,filter),b=coordinates(after,filter);assert.deepEqual(a,b,`${name} shape changed`);
  results.geometryPreservation[name]={identicalRestPositionSet:true,vertices:a.length};
}
let accessories=0;
before.traverse(mesh=>{
  if(!mesh.isSkinnedMesh||mesh.name==='PsyduckSurface')return;
  const other=after.getObjectByName(mesh.name);assert.ok(other);
  for(const key of ['position','normal'])assert.deepEqual(mesh.geometry.attributes[key].array,other.geometry.attributes[key].array,`${mesh.name}/${key} changed`);
  accessories++;
});
results.geometryPreservation.accessories={identicalPositionsAndNormals:true,meshes:accessories};
results.assetSha256=createHash('sha256').update(await readFile('public/models/psyduck_rigged.glb')).digest('hex');
await writeFile('test-results/pose-reference-round2/parameter-vs-asset.json',JSON.stringify(results,null,2));
console.log(results.geometryPreservation,results.poses);
