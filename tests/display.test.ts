import {test} from 'node:test';
import assert from 'node:assert/strict';
import {splitLayout,splitViewport} from '../src/shared/display';
test('two TV players receive equal side-by-side viewports',()=>{assert.deepEqual(splitLayout(2),{columns:2,rows:1});assert.deepEqual(splitViewport(0,2,1920,1080),{x:0,y:0,width:960,height:1080});assert.deepEqual(splitViewport(1,2,1920,1080),{x:960,y:0,width:960,height:1080});});
test('TV grids fit one through eight players without overlapping camera regions',()=>{for(let count=1;count<=8;count++){const views=Array.from({length:count},(_,i)=>splitViewport(i,count,1919,1079));for(const [i,v]of views.entries()){assert.ok(v.width>0&&v.height>0&&v.x>=0&&v.y>=0&&v.x+v.width<=1919&&v.y+v.height<=1079);for(const other of views.slice(i+1))assert.ok(v.x+v.width<=other.x||other.x+other.width<=v.x||v.y+v.height<=other.y||other.y+other.height<=v.y);}}});
