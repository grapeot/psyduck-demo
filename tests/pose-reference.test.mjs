import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {armBind,holdHeadTargets,preset,applyPose} from '../src/rig.js';
import {sculptHeadMetric,headRestMatrix} from './pose-reference-checks.js';

test('hold-head, tilted hold and both waves use fixed-length FK and forearm surface stays outside both head checks',async()=>{
  const bytes=await readFile('public/models/psyduck_rigged.glb');
  const root=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
  const mesh=root.getObjectByName('PsyduckSurface'),g=mesh.geometry,v=mesh.position.clone();
  const wave=preset('raiseOneArm');
  const poses={holdHead:preset('holdHead'),holdTilt:{...preset('holdHead'),head:.24,torso:.12},wave,waveLeft:{...wave,left:wave.right,right:wave.left,leftBend:wave.rightBend,rightBend:wave.leftBend}};
  for(const [name,pose]of Object.entries(poses)){
  applyPose(root,pose);
  const toHeadRest=headRestMatrix(mesh),torso=root.getObjectByName('torso');
  for(const [side,sign]of [['left',-1],['right',1]]){
    const a=pose[side],b=pose[`${side}Bend`];
    const target=name.startsWith('hold')?holdHeadTargets[side]:{x:armBind.x+armBind.upper*Math.sin(a)+armBind.lower*Math.sin(a+b),y:armBind.y-armBind.upper*Math.cos(a)-armBind.lower*Math.cos(a+b),z:armBind.z};
    const elbow=root.getObjectByName(`${side}Elbow`);
    const endpoint=elbow.localToWorld(v.set(0,-armBind.lower,0));
    const targetWorld=torso.localToWorld(v.clone().set(sign*target.x,target.y-torso.position.y,target.z));
    assert.ok(endpoint.distanceTo(targetWorld)<1e-6);
    assert.ok(Math.abs(elbow.position.length()-armBind.upper)<1e-6);
    let tested=0;
    for(let i=0;i<g.attributes.position.count;i++){
      let weight=0;for(let k=0;k<4;k++)if(mesh.skeleton.bones[g.attributes.skinIndex.array[i*4+k]].name===`${side}Elbow`)weight+=g.attributes.skinWeight.array[i*4+k];
      if(weight<=.1)continue;tested++;
      v.fromBufferAttribute(g.attributes.position,i);mesh.applyBoneTransform(i,v);v.applyMatrix4(toHeadRest);
      assert.ok(v.x*v.x+((v.y-2.22)/.73)**2+((v.z-.05)/.71)**2>=1,`${side}/${i}: inside proxy head`);
      assert.ok(sculptHeadMetric(v.x,v.y,v.z)>=1,`${side}/${i}: inside sculpt head`);
    }
    assert.ok(tested>500);
  }
  }
});
