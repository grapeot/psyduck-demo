import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {armBind,flipperShape} from '../src/rig.js';

test('reloaded palm rim has three shallow lobes in the actual indexed surface',async()=>{
  const bytes=await readFile('public/models/psyduck_rigged.glb');
  const root=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
  const g=root.getObjectByName('PsyduckSurface').geometry,p=g.attributes.position,index=g.index.array,segments=[];
  // Slice the actual triangles through the palm mid-depth. Sampling the
  // analytic field alone would not prove that the exported lobes survived.
  for(let i=0;i<index.length;i+=3){
    const cuts=[];
    for(let k=0;k<3;k++){
      const a=index[i+k],b=index[i+(k+1)%3],za=p.getZ(a)-armBind.z,zb=p.getZ(b)-armBind.z;
      if((za>0)===(zb>0))continue;
      const t=za/(za-zb);cuts.push([p.getX(a)+(p.getX(b)-p.getX(a))*t,p.getY(a)+(p.getY(b)-p.getY(a))*t]);
    }
    if(cuts.length===2)segments.push(cuts);
  }
  const results={};
  for(const [side,sign]of [['left',-1],['right',1]]){
    const support=[];
    for(const u of [-2/3,-1/3,0,1/3,2/3]){
      const y=armBind.y+u*flipperShape.palmHalfWidth;let farthest=-Infinity;
      for(const [a,b]of segments){
        if((a[1]>y)===(b[1]>y))continue;
        const t=(y-a[1])/(b[1]-a[1]);farthest=Math.max(farthest,sign*(a[0]+(b[0]-a[0])*t)-armBind.x);
      }
      support.push(farthest);
    }
    results[side]={acrossFractions:[-2/3,-1/3,0,1/3,2/3],actualAxialSupport:support};
  }
  await mkdir('test-results',{recursive:true});await writeFile('test-results/palm-shape.json',JSON.stringify(results,null,2));
  for(const [side,{actualAxialSupport:s}]of Object.entries(results)){
    assert.ok(s.every(Number.isFinite),`${side}: missing section`);
    assert.ok(s[0]>s[1]+.008&&s[2]>s[1]+.010&&s[2]>s[3]+.010&&s[4]>s[3]+.008,`${side}: not three exported lobes ${s}`);
    assert.ok(Math.max(...s)<armBind.upper+armBind.lower+.035,`${side}: fingers became too long`);
    assert.ok(flipperShape.palmHalfWidth*2<=.36&&flipperShape.lobeHeight<=.03);
  }
});
