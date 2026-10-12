import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:390,height:844}});
 let probes=0,sockets=0;
 await page.route('**/health',route=>{probes++;return route.fulfill({status:410,body:'Service stopped'});});
 page.on('websocket',()=>sockets++);
 await page.goto(process.env.TEST_URL||'http://localhost:3002');
 await page.getByRole('button',{name:'Create a room',exact:false}).first().click();
 await page.getByRole('alert').getByText(/The multiplayer server has stopped/).waitFor();
 assert.equal(await page.getByText('Connecting to Server…',{exact:true}).count(),0);
 await page.getByRole('button',{name:'Screen + Controls',exact:false}).click();
 await page.getByRole('button',{name:'Retry server connection',exact:true}).click();
 await page.getByRole('alert').getByText(/The multiplayer server has stopped/).waitFor();
 assert.equal(probes,2);
 assert.equal(sockets,0);
 assert.equal(await page.getByRole('button',{name:'Screen + Controls',exact:false}).getAttribute('aria-pressed'),'true');
 await page.waitForTimeout(9000);
 assert.equal(probes,2,'Expired backend should not be retried indefinitely');
 console.log('PASS expired backend stops reconnection, explains unavailable hosting and retries without losing the device choice.');
} finally {await browser.close();}
