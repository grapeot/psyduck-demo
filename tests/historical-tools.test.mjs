import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

test('historical articulated CLIs reject the current motion model before doing work',()=>{
  for(const file of ['pose-reference.mjs','pose-candidates.mjs','pose-ablation.mjs','pose-snapshot.mjs','final-artifacts.mjs','shoulders.mjs']){
    const result=spawnSync(process.execPath,[`tests/${file}`,'final'],{encoding:'utf8',timeout:15000});
    assert.notEqual(result.status,0,`${file} silently accepted the new rig`);
    assert.match(result.stderr,/historical|not applicable/i,`${file}: missing explicit version rejection`);
  }
});
