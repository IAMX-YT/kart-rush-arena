import {WebSocket} from 'ws';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
const endpoint=process.env.TEST_WS_URL||'ws://127.0.0.1:3210/ws';
const origin='https://rushroom-games.vercel.app';
const clients=[];
async function connect(){
 const ws=new WebSocket(endpoint,{origin,handshakeTimeout:15000});clients.push(ws);
 const messages=[];ws.on('message',data=>messages.push(JSON.parse(String(data))));
 await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
 return {send:m=>ws.send(JSON.stringify(m)),wait:async predicate=>{const end=Date.now()+10000;while(Date.now()<end){const match=messages.findLast(predicate);if(match)return match;await delay(25);}throw Error('Expected server state was not received');}};
}
try{
 for(const gameId of ['power-wash','kart-rush']){
  const host=await connect();host.send({type:'create',mode:'online',origin,gameId});
  const session=await host.wait(m=>m.type==='session');
  host.send({type:'keyboard',name:'VPS verification',color:'#60a5fa'});
  const self=await host.wait(m=>m.type==='session'&&m.playerId);
  const phone=await connect();phone.send({type:'join',code:session.code,name:'Phone verification',color:'#f472b6',role:'controller'});
  await phone.wait(m=>m.type==='session');
  phone.send({type:'ready',ready:true});host.send({type:'ready',ready:true});
  await host.wait(m=>m.type==='state'&&m.room.players.length===2&&m.room.players.every(p=>p.ready));
  host.send({type:'start'});
  const state=await host.wait(m=>m.type==='state'&&(gameId==='power-wash'?m.room.wash?.phase==='playing':m.room.race?.phase==='racing'));
  if(gameId==='power-wash'){
   const player=state.room.wash.players.find(p=>p.id===self.playerId),before=state.room.wash.objects.car.cleanedCells;
   for(let i=0;i<25;i++){host.send({type:'wash_input',input:{moveX:0,moveZ:0,yaw:player.yaw,pitch:player.pitch,spray:true,nozzle:1,highlight:false}});await delay(80);}
   const changed=await host.wait(m=>m.type==='state'&&m.room.wash?.objects.car.cleanedCells>before);
   assert(changed.room.wash.objects.car.cleanedCells>before);
  }else{
   const start=state.room.race.karts.find(k=>k.id===self.playerId);
   for(let i=0;i<25;i++){host.send({type:'input',input:{gas:true,brake:false,left:false,right:false,drift:false,item:false,respawn:false}});await delay(80);}
   await host.wait(m=>m.type==='state'&&m.room.race?.karts.some(k=>k.id===self.playerId&&Math.hypot(k.x-start.x,k.z-start.z)>.1));
  }
  host.send({type:'lobby'});phone.send({type:'leave'});host.send({type:'leave'});
  console.log('PASS VPS '+gameId+': create, phone controller join, readiness, start and authoritative input');
 }
}finally{for(const client of clients)client.close();}
