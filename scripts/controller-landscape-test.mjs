import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base=process.env.TEST_URL||'http://localhost:3002';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
 await fs.mkdir('test-results',{recursive:true});
 for(const game of ['power-wash','kart-rush']){
  const host=await browser.newPage();await host.goto(base+'/?create='+game);
  await host.getByRole('button',{name:'Screen only',exact:false}).click();await host.locator('.panel button.primary').click();
  await host.getByRole('heading',{name:'Assemble your crew.'}).waitFor();
  const code=await host.locator('.room-code').textContent();
  const phone=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const inputs=[],errors=[];
  phone.on('pageerror',e=>errors.push(e.message));
  phone.on('websocket',ws=>{ws.on('framesent',({payload})=>{try{const m=JSON.parse(String(payload));if(m.type==='wash_input'||m.type==='input')inputs.push({at:Date.now(),...m});}catch{}});ws.on('framereceived',({payload})=>{try{const m=JSON.parse(String(payload));if(m.type==='state')phone.roomState=m.room;if(m.type==='error')errors.push(m.message);}catch{}});});
  await phone.goto(base+'/?join='+code);await phone.getByRole('radio',{name:/Controller only/}).check();await phone.getByLabel('Player name').fill('Landscape tester');await phone.locator('form button.primary').click();
  await phone.getByRole('heading',{name:'Turn your phone sideways.'}).waitFor();
  await phone.setViewportSize({width:844,height:390});await phone.getByRole('button',{name:'Ready to Clean',exact:false}).click();await host.getByRole('button',{name:'Start Game',exact:false}).click();
  const primary=phone.getByRole('button',{name:game==='power-wash'?'Spray':'Accelerate',exact:true});await primary.waitFor();
  const playingDeadline=Date.now()+15000;while(game==='power-wash'?phone.roomState?.wash?.phase!=='playing':phone.roomState?.race?.phase!=='racing'){assert(Date.now()<playingDeadline,'Game did not start');await phone.waitForTimeout(100);}
  const selectors=game==='power-wash'?['.virtual-joystick-base','.virtual-lookpad','.main-spray-btn','.nozzle-selector-row']:['.kart-remote-controls .left','.kart-remote-controls .right','.kart-remote-controls .gas','.kart-remote-controls .brake'];
  for(const [width,height] of [[568,320],[640,360],[844,390],[915,412]]){
   await phone.setViewportSize({width,height});
   assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight),false,'Controller scroll '+game+' '+width);
   const boxes=[];for(const selector of selectors){const b=await phone.locator(selector).boundingBox();assert(b&&b.x>=0&&b.y>=0&&b.x+b.width<=width+1&&b.y+b.height<=height+1,selector+' outside viewport');assert(b.height>=44);boxes.push(b);}
   for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];assert(a.x+a.width<=b.x+1||b.x+b.width<=a.x+1||a.y+a.height<=b.y+1||b.y+b.height<=a.y+1,'Touch areas overlap');}
  }
  await phone.setViewportSize({width:844,height:390});await phone.screenshot({path:`test-results/controller-${game}-landscape.png`});
  const cdp=await phone.context().newCDPSession(phone);const a=await phone.locator(selectors[0]).boundingBox(),b=await primary.boundingBox();
  const points=[{x:a.x+a.width/2,y:a.y+a.height/2,id:1},{x:b.x+b.width/2,y:b.y+b.height/2,id:2}];
  const initialYaw=inputs.at(-1)?.input.yaw;
  if(game==='power-wash'){const aim=await phone.locator('.virtual-lookpad').boundingBox();points.push({x:aim.x+aim.width/2,y:aim.y+aim.height/2,id:3});}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points});
  const since=Date.now();for(let i=0;i<40;i++){const moved=[{...points[0],x:points[0].x+30+i%10},points[1]];if(points[2])moved.push({...points[2],x:points[2].x+i*2});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:moved});await phone.waitForTimeout(15);}
  const touchInputs=inputs.filter(m=>m.at>=since);
  const maxPerSecond=Math.max(0,...touchInputs.map(m=>touchInputs.filter(n=>n.at>=m.at&&n.at<m.at+1000).length));
  assert(maxPerSecond<=33,'Input flood exceeds 30Hz budget: '+maxPerSecond);
  assert(inputs.some(m=>game==='power-wash'?m.input.spray&&m.input.moveX>0:m.input.gas&&m.input.left),'Simultaneous inputs missing');
  if(game==='power-wash'&&initialYaw!==undefined)assert(touchInputs.some(m=>Math.abs(m.input.yaw-initialYaw)>.05),'Aim did not change while moving and spraying');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await phone.waitForTimeout(250);
  assert(game==='power-wash'?!inputs.at(-1).input.spray&&inputs.at(-1).input.moveX===0:!inputs.at(-1).input.gas&&!inputs.at(-1).input.left);
  await phone.setViewportSize({width:390,height:844});await phone.getByRole('heading',{name:'Turn your phone sideways.'}).waitFor();assert.equal(await primary.isVisible(),false);
  await phone.screenshot({path:`test-results/controller-${game}-portrait-gate.png`});
  assert.deepEqual(errors,[]);console.log('PASS '+game+': 4 landscape sizes, portrait gate, no overflow/overlap, large buttons, simultaneous touch, cancellation and bounded input rate');
  await phone.close();await host.close();
 }
} finally {await browser.close();}
