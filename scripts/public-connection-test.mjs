import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const base=process.env.TEST_URL || 'https://rushroom-games.vercel.app';
const expectedBackend=process.env.TEST_SERVER_URL;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const errors=[];const endpoints=[];const debug=[];
async function client(phone=false) {
 const context=await browser.newContext({viewport:phone?{width:390,height:844}:{width:1280,height:800},isMobile:phone,hasTouch:phone});
 const page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 page.on('websocket',ws=>{endpoints.push(ws.url());ws.on('framesent',({payload})=>{try{const m=JSON.parse(String(payload));if(['create','join'].includes(m.type))debug.push({sent:m.type,name:m.name,code:m.code});}catch{}});ws.on('socketerror',e=>debug.push({socketerror:String(e)}));ws.on('framereceived',({payload})=>{try{const message=JSON.parse(String(payload));if(message.type==='state')page.roomState=message.room;if(message.type==='session')debug.push({session:message.role,code:message.code});if(message.type==='error')errors.push('Server: '+message.message);}catch{}});});
 await page.addInitScript(()=>{const Original=window.WebSocket;window.WebSocket=class extends Original{constructor(...args){super(...args);window.connectionTestSocket=this;}};});
 return page;
}
async function until(fn,description,timeout=15000) {const start=Date.now();while(!fn()){if(Date.now()-start>timeout)throw Error('Timed out: '+description);await new Promise(r=>setTimeout(r,100));}}
try {
 const host=await client();await host.goto(base);
 await host.getByRole('button',{name:'Create a room',exact:false}).first().click();
 if(!host.roomState) await Promise.race([host.getByRole('button',{name:'Create room',exact:false}).waitFor({timeout:20000}),host.getByRole('heading',{name:'Assemble your crew.'}).waitFor({timeout:20000})]);
 if(!host.roomState) await host.getByRole('button',{name:'Create room',exact:false}).click();
 await until(()=>host.roomState?.code,'host room creation');
 assert.equal(host.roomState.gameId,'power-wash');
 if(expectedBackend)assert(endpoints.every(url=>new URL(url).hostname===new URL(expectedBackend).hostname),'Compiled frontend points at wrong backend');
 const phone=await client(true);await phone.goto(host.roomState.controllerUrl);
 await phone.getByLabel('Room code').fill(host.roomState.code);
 await phone.getByLabel('Player name').fill('Connection Test');
 await phone.locator('form').getByRole('button',{name:'Join Room',exact:false}).waitFor({timeout:15000});
 await phone.locator('form').getByRole('button',{name:'Join Room',exact:false}).click();
 await until(()=>host.roomState.players.some(p=>p.name==='Connection Test'),'phone joined shared room');
 const playerId=host.roomState.players.find(p=>p.name==='Connection Test').id;
 await phone.getByRole('button',{name:'Ready to Clean',exact:false}).click();
 await until(()=>host.roomState.players.find(p=>p.id===playerId)?.ready,'phone readiness');
 const hostReady=host.getByRole('button',{name:'Ready to Clean',exact:false});if(await hostReady.count())await hostReady.click();
 await host.getByRole('button',{name:'Start Game',exact:false}).click();
 await until(()=>host.roomState.wash?.phase==='playing','authoritative game start');
 await phone.getByRole('button',{name:/spray/i}).first().waitFor({timeout:20000});
 await phone.reload();
 await phone.getByRole('button',{name:/spray/i}).first().waitFor({timeout:20000});
 assert(phone.roomState.players.some(p=>p.id===playerId),'Reconnect changed player identity');
 assert.equal(phone.roomState.code,host.roomState.code,'Reconnect changed room');
 assert.equal(await phone.locator('canvas').count(),0,'Controller-only phone unexpectedly renders game');
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({passed:true,backend:endpoints[0],game:'power-wash',checks:['public WebSocket connected','create room','phone join','ready','start game','reload resume same player','controller-only phone','no browser errors']}));
 await host.evaluate(()=>window.connectionTestSocket?.send(JSON.stringify({type:'leave'})));
} catch(error) {console.error(JSON.stringify({endpoints,errors,debug,message:error.message}));throw error;} finally {await browser.close();}
