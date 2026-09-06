import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {motionModel,armBind,rigBoneNames,neutral,preset,applyPose,validateRig} from '../src/rig.js';
import {sculptHeadMetric,headRestMatrix} from './pose-reference-checks.js';

test('five-bone shoulder_flap preserves middle/distal shape through poses and a shoulder sweep',async()=>{
  const bytes=await readFile('public/models/psyduck_rigged.glb');
  const root=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
  validateRig(root);assert.equal(motionModel,'shoulder_flap');assert.equal(rigBoneNames.length,5);
  const renamed=root.getObjectByName('leftArm');renamed.name='leftElbow';assert.throws(()=>validateRig(root),/five bones/);renamed.name='leftArm';
  const metadata=root.getObjectByName('PsyduckRig').userData,originalZ=metadata.bind.z;
  metadata.bind.z+=.1;assert.throws(()=>validateRig(root),/five bones/);metadata.bind.z=originalZ;
  assert.deepEqual(Object.keys(neutral()).sort(),['head','left','nod','right','torso']);
  assert.ok(!('upper' in armBind)&&!('lower' in armBind));
  const mesh=root.getObjectByName('PsyduckSurface'),g=mesh.geometry,p=g.attributes.position,ids=g.attributes.skinIndex.array,w=g.attributes.skinWeight.array;
  for(let i=0;i<p.count;i++)if(p.getY(i)<.9){
    for(let k=0;k<4;k++)if(['leftArm','rightArm'].includes(mesh.skeleton.bones[ids[i*4+k]].name))assert.equal(w[i*4+k],0,'Lower torso must not be dragged by shoulder rotation');
  }
  const samples={};
  for(const [side,sign]of [['left',-1],['right',1]]){
    const joint=mesh.skeleton.bones.findIndex(b=>b.name===`${side}Arm`),rigid=[];
    for(let i=0;i<p.count;i++){
      const along=(sign*p.getX(i)-armBind.x)*Math.sin(armBind.restAngle)-(p.getY(i)-armBind.y)*Math.cos(armBind.restAngle);
      if(along<armBind.rigidFrom)continue;
      let influence=0;for(let k=0;k<4;k++)if(ids[i*4+k]===joint)influence+=w[i*4+k];
      assert.ok(Math.abs(influence-1)<1e-6,`${side}/${i} is not one-shoulder rigid skin`);rigid.push(i);
    }
    assert.ok(rigid.length>200);
    samples[side]={count:rigid.length,indices:Array.from({length:32},(_,k)=>rigid[Math.floor(k*(rigid.length-1)/31)])};
  }
  const poses={idle:preset('idle'),spread:preset('armsSpread'),raise:preset('raiseOneArm'),hold:preset('holdHead'),tiltedHold:{...preset('holdHead'),head:.24,torso:.12}};
  for(let i=0;i<=20;i++){const a=armBind.minAngle+(armBind.maxAngle-armBind.minAngle)*i/20;poses[`sweep${i}`]={...neutral(),left:a,right:a,head:.15*Math.sin(i/20*Math.PI),torso:.10*Math.sin(i/20*Math.PI)};}
  const pairResults={};let maximumPairError=0;
  for(const [name,pose]of Object.entries(poses)){
    applyPose(root,pose);pairResults[name]={};
    for(const side of ['left','right']){
      const points=samples[side].indices.map(i=>{const v=mesh.position.clone().fromBufferAttribute(p,i);mesh.applyBoneTransform(i,v);return v;});
      let error=0;
      for(let a=0;a<points.length;a++)for(let b=a+1;b<points.length;b++){
        const va=mesh.position.clone().fromBufferAttribute(p,samples[side].indices[a]),vb=mesh.position.clone().fromBufferAttribute(p,samples[side].indices[b]);
        error=Math.max(error,Math.abs(points[a].distanceTo(points[b])-va.distanceTo(vb)));
      }
      pairResults[name][side]=error;maximumPairError=Math.max(maximumPairError,error);assert.ok(error<1e-5,`${name}/${side} folded or stretched`);
    }
  }
  await mkdir('test-results',{recursive:true});
  await writeFile('test-results/flap-motion.json',JSON.stringify({motionModel,assetSha256:createHash('sha256').update(bytes).digest('hex'),rigidRegionStartsAt:armBind.rigidFrom,samples,maximumPairError,poses,pairResults},null,2));
});

test('required held whole-flap surface is outside the posed head field',async()=>{
  const bytes=await readFile('public/models/psyduck_rigged.glb');
  const root=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
  const mesh=root.getObjectByName('PsyduckSurface'),g=mesh.geometry,p=g.attributes.position,results={};
  const wave=preset('raiseOneArm');
  const poses={hold:preset('holdHead'),holdTilt:{...preset('holdHead'),head:.24,torso:.12},wave,waveLeft:{...wave,left:wave.right,right:wave.left}};
  for(let i=0;i<=20;i++)for(const head of [-.25,0,.25]){
    const angle=armBind.minAngle+(armBind.maxAngle-armBind.minAngle)*i/20;
    poses[`range${i}_head${head}`]={...neutral(),left:angle,right:angle,head,torso:.13};
  }
  for(const [name,pose]of Object.entries(poses)){
    applyPose(root,pose);const toHead=headRestMatrix(mesh);results[name]={};
    for(const side of ['left','right']){
      const joint=mesh.skeleton.bones.findIndex(b=>b.name===`${side}Arm`),values=[];
      for(let i=0;i<p.count;i++){
        let influence=0;for(let k=0;k<4;k++)if(g.attributes.skinIndex.array[i*4+k]===joint)influence+=g.attributes.skinWeight.array[i*4+k];
        if(influence<.9999)continue;
        const v=mesh.position.clone().fromBufferAttribute(p,i);mesh.applyBoneTransform(i,v);v.applyMatrix4(toHead);values.push(sculptHeadMetric(v.x,v.y,v.z));
      }
      results[name][side]={samples:values.length,minHeadMetric:Math.min(...values),inside:values.filter(v=>v<1).length};
    }
  }
  await mkdir('test-results',{recursive:true});await writeFile('test-results/flap-head-safety.json',JSON.stringify(results,null,2));
  for(const [name,sides]of Object.entries(results))for(const [side,result]of Object.entries(sides)){assert.ok(result.samples>200);assert.equal(result.inside,0,`${name}/${side}: ${JSON.stringify(result)}`);}
});
