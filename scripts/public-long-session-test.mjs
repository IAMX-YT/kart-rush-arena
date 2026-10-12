import {WebSocket} from 'ws';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
const origin='https://rushroom-games.vercel.app';
let socket,session,room,closed=false,connections=0,resumes=0;
function connect(){
 socket=new WebSocket('wss://rushroom-games.vercel.app/ws',{origin,handshakeTimeout:15000});
 socket.on('open',()=>{connections++;socket.send(JSON.stringify(session?{type:'resume',code:session.code,token:session.token}:{type:'create',mode:'online',origin,gameId:'power-wash'}));});
 socket.on('message',data=>{const message=JSON.parse(String(data));if(message.type==='error')console.log('Server: '+message.message);if(message.type==='session'){if(session)resumes++;session=message;}if(message.type==='state')room=message.room;});
 socket.on('error',()=>{});
 socket.on('close',()=>{if(!closed)setTimeout(connect,1500);});
}
async function wait(check,timeout=30000){const end=Date.now()+timeout;while(Date.now()<end){if(check())return;await delay(100);}throw Error('Long-session state timeout');}
function send(message){if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(message));}
const heartbeat=setInterval(()=>send({type:'ping',sent:Date.now()}),1000);
try{
 connect();await wait(()=>session);
 const addPlayer=setInterval(()=>{if(!session.playerId)send({type:'keyboard',name:'Session test',color:'#60a5fa'});},1000);
 try {send({type:'keyboard',name:'Session test',color:'#60a5fa'});await wait(()=>session.playerId);} finally {clearInterval(addPlayer);}
 send({type:'ready',ready:true});await wait(()=>room?.players[0]?.ready);
 send({type:'start'});await wait(()=>room?.wash?.phase==='playing');
 const identity=session.playerId,code=session.code,player=room.wash.players[0];
 for(let i=0;i<25;i++){send({type:'wash_input',input:{moveX:0,moveZ:0,yaw:player.yaw,pitch:player.pitch,spray:true,nozzle:1,highlight:false}});await delay(80);}
 send({type:'wash_input',input:{moveX:0,moveZ:0,yaw:player.yaw,pitch:player.pitch,spray:false,nozzle:1,highlight:false}});
 await wait(()=>room.wash.objects.car.cleanedCells>0);const progress=room.wash.objects.car.cleanedCells;
 const duration=Number(process.env.TEST_DURATION_MS||330000),until=Date.now()+duration;
 let reported=Date.now();
 while(Date.now()<until){await delay(1000);if(Date.now()-reported>60000){console.log('Session still running; completed reconnects: '+Math.max(0,connections-1));reported=Date.now();}}
 await wait(()=>socket.readyState===WebSocket.OPEN&&room?.wash);
 assert.equal(session.playerId,identity);assert.equal(room.code,code);assert(room.wash.objects.car.cleanedCells>=progress);
 console.log(JSON.stringify({passed:true,durationMs:duration,connections,resumes,identityPreserved:true,cleaningPreserved:true}));
 send({type:'lobby'});send({type:'leave'});
}finally{closed=true;clearInterval(heartbeat);socket?.close();}
