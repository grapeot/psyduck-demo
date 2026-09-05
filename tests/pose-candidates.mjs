import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {armBind,applyPose,neutral} from '../src/rig.js';
import {sculptHeadMetric} from './pose-reference-checks.js';
const bytes=await readFile('public/models/psyduck_rigged.glb');
const root=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
const mesh=root.getObjectByName('PsyduckSurface'),g=mesh.geometry,distal=[];
for(let i=0;i<g.attributes.position.count;i++)for(let k=0;k<4;k++)if(mesh.skeleton.bones[g.attributes.skinIndex.array[i*4+k]].name==='rightElbow'&&g.attributes.skinWeight.array[i*4+k]>.9){distal.push(i);break;}
const candidates=[],v=mesh.position.clone();
for(const x of [.92,.96,1,1.04,1.08,1.12,1.16,1.20])for(const y of [2.44,2.46,2.48,2.50,2.52,2.54,2.56]){
  const dx=x-armBind.x,dy=y-armBind.y,a=armBind.upper,b=armBind.lower,r=Math.hypot(dx,dy);
  const bend=Math.acos((r*r-a*a-b*b)/(2*a*b)),axis=Math.PI-Math.atan2(dx,dy),offset=Math.atan2(b*Math.sin(bend),a+b*Math.cos(bend)),angle=axis-offset;
  const valid=Number.isFinite(angle)&&angle>=.12&&angle<=2.9&&bend>=0&&bend<=1.1;
  const item={target:[x,y,armBind.z],reachFraction:r/(a+b),angle,bend,inwardBranch:{angle:axis+offset,bend:-bend},withinExistingLimits:valid};
  if(valid){
    applyPose(root,{...neutral(),left:angle,right:angle,leftBend:bend,rightBend:bend});
    const actual=[];
    const metrics=distal.map(i=>{v.fromBufferAttribute(g.attributes.position,i);mesh.applyBoneTransform(i,v);actual.push(sculptHeadMetric(v.x,v.y,v.z));return v.x*v.x+((v.y-2.22)/.73)**2+((v.z-.05)/.71)**2;});
    item.distalMinHeadMetric=Math.min(...metrics);item.distalInsideProxy=metrics.filter(v=>v<1).length;
    item.distalMinSculptHeadMetric=Math.min(...actual);item.distalInsideSculptHead=actual.filter(v=>v<1).length;
    item.elbow=root.getObjectByName('rightElbow').getWorldPosition(v).toArray();
  }
  candidates.push(item);
}
await mkdir('test-results/pose-reference-round1',{recursive:true});
await writeFile('test-results/pose-reference-round1/candidates.json',JSON.stringify({purpose:'单轮参数可行性筛选，不改几何/权重，不渲染成多轮；头部椭球代理阈值保持 1。',candidates},null,2));
console.log(candidates.filter(c=>c.withinExistingLimits&&c.distalInsideProxy===0&&c.distalInsideSculptHead===0));
