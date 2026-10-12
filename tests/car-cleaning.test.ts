import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPowerWashMatch,stepPowerWash,neutralWashInput} from '../src/shared/powerwash';

test('a new solo host can clean the visible car from the starting view',()=>{
  const match=createPowerWashMatch([{id:'host',name:'Host',color:'#bef264'}]);match.phase='playing';
  const player=match.players[0];const inputs=new Map([['host',{...neutralWashInput(),yaw:player.yaw,pitch:player.pitch,spray:true}]]);
  for(let i=0;i<60;i++)stepPowerWash(match,inputs,1/60);
  assert(match.objects.car.cleanedCells>0,'Starting view and spray must hit the car');
  assert.equal(match.totalCleaned,Object.values(match.objects).reduce((sum,object)=>sum+object.cleanedCells,0));
});
test('missing inputs stop spraying without resetting the view or nozzle',()=>{
 const match=createPowerWashMatch([{id:'host',name:'Host',color:'#bef264'}]);match.phase='playing';const p=match.players[0];p.yaw=.72;p.pitch=-.28;p.nozzle=2;p.spraying=true;
 stepPowerWash(match,new Map(),1/60);assert.equal(p.yaw,.72);assert.equal(p.pitch,-.28);assert.equal(p.nozzle,2);assert.equal(p.spraying,false);
});
