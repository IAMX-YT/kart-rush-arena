import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
 await page.goto(process.env.TEST_URL||'https://rushroom-games.vercel.app');
 await page.getByRole('button',{name:'Create a room',exact:false}).first().click();
 await page.getByRole('heading',{name:'Start your match.'}).waitFor();
 assert.equal(await page.locator('.panel button.primary').isDisabled(),true);
 for(const name of ['Screen only','Controller only','Screen + Controls'])assert.equal(await page.getByRole('button',{name,exact:false}).count(),1);
 await page.getByRole('button',{name:'Screen + Controls',exact:false}).click();
 assert.equal(await page.locator('.panel button.primary').isDisabled(),false);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:'test-results/host-role-public.png',fullPage:true});
 console.log('PASS published host role choice on 390px phone viewport. Backend gameplay not checked by this static UI test.');
} finally {await browser.close();}
