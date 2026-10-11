import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const sent=[];
 await page.addInitScript(()=>{window.pointerLog=[];['pointerdown','pointerup','pointercancel','lostpointercapture'].forEach(type=>document.addEventListener(type,e=>window.pointerLog.push([type,e.target.className]),true));});
 page.on('websocket',ws=>{if(new URL(ws.url()).pathname!=='/ws')return;ws.on('framereceived',({payload})=>{try{const m=JSON.parse(String(payload));if(m.type==='state')page.room=m.room;}catch{}});ws.on('framesent',({payload})=>{try{const m=JSON.parse(String(payload));if(m.type==='wash_input'){sent.push(m.input);if(sent.length>5)sent.shift();}}catch{}});});
 await page.goto('http://localhost:3002/?create=power-wash');
 await page.getByRole('button',{name:'Screen + Controls',exact:false}).click();await page.locator('.panel button.primary').click();
 await page.getByRole('heading',{name:'Assemble your crew.'}).waitFor();await page.getByRole('button',{name:'Start Game',exact:false}).click();
 await page.locator('.mobile-stick-area').waitFor();await page.waitForTimeout(3500);
 const rect=await page.locator('.mobile-stick-area').boundingBox();const point={x:rect.x+rect.width*.8,y:rect.y+rect.height*.5,id:1};
 const hit=await page.evaluate(p=>({target:document.elementFromPoint(p.x,p.y)?.className,scale:visualViewport.scale,width:innerWidth,scrollWidth:document.documentElement.scrollWidth}),point);const before=page.room.wash.players[0].x;
 const cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await page.waitForTimeout(1500);
 if(Math.abs(page.room.wash.players[0].x-before)<=.1)console.log(JSON.stringify({hit,rect,before,player:page.room.wash.players[0],sent,pointerLog:await page.evaluate(()=>window.pointerLog)}));
 assert(Math.abs(page.room.wash.players[0].x-before)>.1);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
 await page.waitForTimeout(250);const stopped={x:page.room.wash.players[0].x,z:page.room.wash.players[0].z};await page.waitForTimeout(500);assert(Math.hypot(page.room.wash.players[0].x-stopped.x,page.room.wash.players[0].z-stopped.z)<.05,'Cancelled joystick stayed active');
 await page.screenshot({path:'test-results/host-phone.png'});
 console.log('PASS single-phone host movement');
} finally{await browser.close();}
