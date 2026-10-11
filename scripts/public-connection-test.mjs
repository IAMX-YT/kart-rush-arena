import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const base=process.env.TEST_URL || 'https://rushroom-games.vercel.app';
const expectedBackend=process.env.TEST_SERVER_URL;
const game=process.env.TEST_GAME || 'power-wash';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const errors=[];const endpoints=[];const debug=[];
async function client(phone=false) {
 const context=await browser.newContext({viewport:phone?{width:390,height:844}:{width:1280,height:800},isMobile:phone,hasTouch:phone});
 const page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 page.on('websocket',ws=>{if(new URL(ws.url()).pathname!=='/ws')return;endpoints.push(ws.url());ws.on('framesent',({payload})=>{try{const m=JSON.parse(String(payload));if(['create','join'].includes(m.type))debug.push({sent:m.type,name:m.name,code:m.code});}catch{}});ws.on('socketerror',e=>debug.push({socketerror:String(e)}));ws.on('framereceived',({payload})=>{try{const message=JSON.parse(String(payload));if(message.type==='state')page.roomState=message.room;if(message.type==='session')debug.push({session:message.role,code:message.code});if(message.type==='error')errors.push('Server: '+message.message);}catch{}});});
 await page.addInitScript(()=>{const Original=window.WebSocket;window.WebSocket=class extends Original{constructor(...args){super(...args);window.connectionTestSocket=this;}};});
 return page;
}
async function until(fn,description,timeout=15000) {const start=Date.now();while(!fn()){if(Date.now()-start>timeout)throw Error('Timed out: '+description);await new Promise(r=>setTimeout(r,100));}}
try {
 const host=await client(process.env.TEST_HOST_PHONE==='1');await host.goto(base);
 await host.getByRole('button',{name:'Create a room',exact:false}).first().click();
 await host.getByRole('heading',{name:'Start your match.'}).waitFor();
 assert.equal(await host.locator('.panel button.primary').isDisabled(),true,'Host must explicitly choose device role');
 await host.getByRole('button',{name:'Screen + Controls',exact:false}).click();
 if(!host.roomState) await Promise.race([host.getByRole('button',{name:'Create room',exact:false}).waitFor({timeout:20000}),host.getByRole('heading',{name:'Assemble your crew.'}).waitFor({timeout:20000})]);
 if(!host.roomState) await host.getByRole('button',{name:'Create room',exact:false}).click();
 await until(()=>host.roomState?.code,'host room creation');
 if(host.roomState.gameId!==game) {await host.locator('.lobby-main select').selectOption(game);await until(()=>host.roomState.gameId===game,'game selection');}
 if(expectedBackend)assert(endpoints.every(url=>new URL(url).hostname===new URL(expectedBackend).hostname),'Compiled frontend points at wrong backend');
 const phone=await client(true);await phone.goto(host.roomState.controllerUrl);
 assert.equal(await phone.locator('form button.primary').isDisabled(),true,'Join should require an explicit device role');
 await phone.getByRole('radio',{name:/Controller only/}).check();
 await phone.getByLabel('Room code').fill(host.roomState.code);
 await phone.getByLabel('Player name').fill('Connection Test');
 await phone.locator('form').getByRole('button',{name:'Join Room',exact:false}).waitFor({timeout:15000});
 await phone.locator('form').getByRole('button',{name:'Join Room',exact:false}).click();
 await until(()=>host.roomState.players.some(p=>p.name==='Connection Test'),'phone joined shared room');
 const playerId=host.roomState.players.find(p=>p.name==='Connection Test').id;
 await phone.getByRole('button',{name:'Ready to Clean',exact:false}).click();
 await until(()=>host.roomState.players.find(p=>p.id===playerId)?.ready,'phone readiness');
 const both=await client(true);await both.goto(host.roomState.joinUrl);
 await both.getByRole('radio',{name:/Screen \+ Controls/}).check();
 await both.getByLabel('Player name').fill('Same Device Test');
 await both.locator('form').getByRole('button',{name:'Join Room',exact:false}).click();
 await until(()=>host.roomState.players.some(p=>p.name==='Same Device Test'),'same-device player join');
 await both.getByRole('button',{name:'Ready to Clean',exact:false}).click();
 await until(()=>host.roomState.players.find(p=>p.name==='Same Device Test')?.ready,'same-device readiness');
 const screen=await client();await screen.goto(host.roomState.joinUrl);
 await screen.getByRole('radio',{name:/Screen only/}).check();
 assert.equal(await screen.getByLabel('Player name').count(),0,'Screen-only should not create a player');
 await screen.locator('form').getByRole('button',{name:'Join Room',exact:false}).click();
 await until(()=>screen.roomState?.code===host.roomState.code,'screen-only join');
 assert.equal(host.roomState.players.length,3,'Screen-only consumed a player slot');
 const hostReady=host.getByRole('button',{name:'Ready to Clean',exact:false});if(await hostReady.count())await hostReady.click();
 await host.getByRole('button',{name:'Start Game',exact:false}).click();
 await until(()=>game==='power-wash'?host.roomState.wash?.phase==='playing':host.roomState.race?.phase==='racing','authoritative game start');
 if(process.env.TEST_HOST_PHONE==='1'&&game==='power-wash'){
   await host.bringToFront();
   await host.locator('canvas').first().waitFor({timeout:30000});await host.locator('.mobile-btn-spray').waitFor();
   const stick=await host.locator('.mobile-stick-area').boundingBox();const cdp=await host.context().newCDPSession(host);
   const session=await host.evaluate(()=>JSON.parse(sessionStorage.getItem('rush-session')));const before=host.roomState.wash.players.find(p=>p.id===session.playerId).x;
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:stick.x+stick.width*.8,y:stick.y+stick.height*.5,id:10}]});
   await until(()=>Math.abs(host.roomState.wash.players.find(p=>p.id===session.playerId).x-before)>.1,'single-phone host joystick movement');
   await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
 }
 const controllerButton=()=>phone.getByRole('button',{name:game==='power-wash'?/spray/i:'GAS'}).first();
 await controllerButton().waitFor({timeout:20000});
 await both.locator('canvas').first().waitFor({timeout:30000});
 await both.locator(game==='power-wash'?'.mobile-btn-spray':'.kart-touch-controls').waitFor({timeout:30000});
 await screen.locator('canvas').first().waitFor({timeout:30000});
 assert.equal(await screen.locator('.mobile-wash-overlay,.nozzle-dock,.sonar-action-btn,.kart-touch-controls').count(),0,'Screen-only exposes gameplay controls');
 if(game==='kart-rush') {
   const gas=await both.getByRole('button',{name:'Accelerate',exact:true}).boundingBox();const left=await both.getByRole('button',{name:'left',exact:true}).boundingBox();
   const cdp=await both.context().newCDPSession(both);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:gas.x+gas.width/2,y:gas.y+gas.height/2,id:1},{x:left.x+left.width/2,y:left.y+left.height/2,id:2}]});
   assert.equal(await both.getByRole('button',{name:'Accelerate',exact:true}).getAttribute('aria-pressed'),'true');
   assert.equal(await both.getByRole('button',{name:'left',exact:true}).getAttribute('aria-pressed'),'true');
   await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
   assert.equal(await both.getByRole('button',{name:'Accelerate',exact:true}).getAttribute('aria-pressed'),'false');
   assert.equal(await both.getByRole('button',{name:'left',exact:true}).getAttribute('aria-pressed'),'false');
 }
 await phone.reload();
 await controllerButton().waitFor({timeout:20000});
 assert(phone.roomState.players.some(p=>p.id===playerId),'Reconnect changed player identity');
 assert.equal(phone.roomState.code,host.roomState.code,'Reconnect changed room');
 assert.equal(await phone.locator('canvas').count(),0,'Controller-only phone unexpectedly renders game');
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({passed:true,backend:endpoints[0],game,checks:['WebSocket connected','create room auto local player','explicit three-role picker','controller-only no canvas','screen-only no player slot or controls','same-device gameplay + touch controls','ready and start game','reload resume same player','no browser errors']}));
 await host.evaluate(()=>window.connectionTestSocket?.send(JSON.stringify({type:'leave'})));
} catch(error) {console.error(JSON.stringify({endpoints,errors,debug,message:error.message}));throw error;} finally {await browser.close();}
