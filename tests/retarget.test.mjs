import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Retarget} from '../src/retarget.js';
import {neutral,preset,holdAngles} from '../src/rig.js';

function person(){
  const p=Array.from({length:33},()=>({x:.5,y:.9,visibility:0,presence:1}));
  const set=(i,x,y)=>{p[i]={x,y,visibility:1,presence:1};};
  set(0,.5,.22);set(2,.54,.19);set(5,.46,.19);set(11,.65,.4);set(12,.35,.4);
  set(13,.68,.6);set(14,.32,.6);set(15,.68,.8);set(16,.32,.8);return p;
}
function run(r,p,from=0,to=2500,mirror=true,w=640,h=480){for(let t=from;t<=to;t+=50)r.update(p,w,h,t,mirror);return r.output;}
test('shoulder-wrist left/right contract, mirror and plain',()=>{
  for(const [w,side]of [[15,'left'],[16,'right']]){
    const p=person();p[w].y=.06;const r=new Retarget();run(r,p);
    assert.ok(r.output[side]>2.4);assert.ok(r.output[side==='left'?'right':'left']<.5);
    const plain=new Retarget();run(plain,p,0,2500,false);assert.ok(plain.output[side==='left'?'right':'left']>2.4);
  }
});
test('elbow changes, disappearance and non-finite elbows cannot affect output or calibration',()=>{
  for(const mirror of [true,false])for(const gesture of ['idle','spread','hold']){
    const p=person();if(gesture==='spread'){p[15].x=.98;p[16].x=.02;p[15].y=p[16].y=.4;}
    if(gesture==='hold'){p[15]={...p[15],x:.59,y:.24};p[16]={...p[16],x:.41,y:.24};}
    const baseline=new Retarget();run(baseline,p,0,3000,mirror);
    for(const replacement of [undefined,{x:NaN,y:Infinity,visibility:1},{x:-20,y:42,z:NaN,visibility:0},{x:.5,y:.01,visibility:1}]){
      const modified=p.map(point=>({...point}));modified[13]=modified[14]=replacement;
      const r=new Retarget();run(r,modified,0,3000,mirror);
      assert.deepEqual(r.output,baseline.output);assert.deepEqual(r.target,baseline.target);
      assert.equal(r.validMs,baseline.validMs);assert.equal(r.calibrated,true);
      assert.equal(r.channels.left.contact,baseline.channels.left.contact);assert.equal(r.channels.right.contact,baseline.channels.right.contact);
    }
  }
});
test('spread and aspect-correct shoulder-to-wrist direction need no hip',()=>{
  const p=person();p[15].x=1;p[16].x=0;p[15].y=p[16].y=.4;
  const r=new Retarget();run(r,p);assert.ok(Math.abs(r.output.left-Math.PI/2)<.01);assert.ok(r.calibrated);
  const q=person(),a=new Retarget(),b=new Retarget();run(a,q);run(b,q.map(p=>({...p,x:p.x/2})),0,2500,true,1280,480);
  assert.ok(Math.abs(a.output.left-b.output.left)<1e-6);
});
test('hold intention retains entry/exit dwell and hysteresis without IK',()=>{
  const p=person(),r=new Retarget();run(r,p);p[15]={...p[15],x:.59,y:.24};
  run(r,p,2550,2700);assert.equal(r.channels.left.contact,false);
  run(r,p,2750,3100);assert.equal(r.channels.left.contact,true);assert.equal(r.target.left,holdAngles.left);
  p[15].x=.71;run(r,p,3150,3600);assert.equal(r.channels.left.contact,true);
  p[15].x=.9;run(r,p,3650,3750);assert.equal(r.channels.left.contact,true);
  run(r,p,3800,4100);assert.equal(r.channels.left.contact,false);
});
test('both held flaps match their shoulder presets on each screen side',()=>{
  for(const mirror of [true,false]){
    const p=person(),r=new Retarget();p[15]={...p[15],x:.59,y:.24};p[16]={...p[16],x:.41,y:.24};run(r,p,0,3000,mirror);
    assert.ok(r.channels.left.contact&&r.channels.right.contact);
    assert.equal(r.target.left,preset('holdHead').left);assert.equal(r.target.right,preset('holdHead').right);
    assert.deepEqual(Object.keys(r.output).sort(),['head','left','nod','right','torso']);
  }
});
test('one obscured wrist does not reset the other flap',()=>{
  const p=person(),r=new Retarget();p[16].y=.04;run(r,p);p[15].visibility=0;run(r,p,2550,3500);
  assert.ok(r.output.right>2.4);assert.ok(Math.abs(r.output.left-neutral().left)<.02);
});
test('brief loss holds, sustained loss returns idle, and reentry is confirmed and smooth',()=>{
  const p=person(),r=new Retarget();p[15].y=.02;run(r,p);const before=r.output.left;
  run(r,[],2550,2750);assert.ok(Math.abs(r.output.left-before)<.01);
  run(r,[],2800,4500);assert.ok(r.output.left<.25);r.update(p,640,480,4550);assert.ok(r.output.left<.25);
  run(r,p,4600,5500);assert.ok(r.output.left>2.4);
});
test('degenerate shoulders/wrists, NaN, dimensions and stale timestamps remain safe',()=>{
  for(const mutate of [p=>{p[11]={...p[12]};},p=>{p[15].x=NaN;},p=>{p[0].y=Infinity;},p=>{p[15]={...p[11]};},p=>{p[15].visibility=Infinity;}]){
    const r=new Retarget(),p=person();mutate(p);run(r,p);assert.ok(Object.values(r.output).every(Number.isFinite));assert.equal(r.calibrated,false);
    const before={...r.output};r.update(person(),640,480,10);assert.deepEqual(r.output,before);
  }
  const r=new Retarget();run(r,person(),0,2500,true,0,0);assert.equal(r.calibrated,false);
});
test('calibration is accumulated continuous valid shoulder/wrist time and resets',()=>{
  const r=new Retarget(),p=person();p[13]=p[14]=undefined;run(r,p,0,1500);assert.equal(r.calibrated,false);
  r.update([],640,480,1550);assert.equal(r.validMs,0);run(r,p,1600,2500);r.update(p,640,480,4000);assert.equal(r.validMs,0);
  run(r,p,4050,6100);assert.equal(r.calibrated,true);r.reset();assert.equal(r.validMs,0);assert.equal(r.calibrated,false);assert.deepEqual(r.output,neutral());
});
test('head confidence and shoulder-local roll contract are retained',()=>{
  const p=person(),r=new Retarget();p[2].y+=.04;run(r,p);assert.ok(r.output.head>.15);p[2].visibility=0;run(r,p,2550,4000);assert.ok(Math.abs(r.output.head)<.01);
  const q=person(),angle=.12,aspect=640/480;
  const rotated=q.map(p=>{const x=(p.x-.5)*aspect,y=p.y-.4;return{...p,x:.5+(x*Math.cos(angle)-y*Math.sin(angle))/aspect,y:.4+x*Math.sin(angle)+y*Math.cos(angle)};});
  const a=new Retarget(),b=new Retarget();run(a,q);run(b,rotated);assert.ok(Math.abs(a.output.left-b.output.left)<1e-6);assert.ok(Math.abs(a.output.right-b.output.right)<1e-6);
});
