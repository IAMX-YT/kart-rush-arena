import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base=process.env.TEST_URL||'http://localhost:3002';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
 await fs.mkdir('test-results',{recursive:true});
 for(const [name,width,height] of [['desktop',1440,1000],['phone',390,844]]){
  const page=await browser.newPage({viewport:{width,height},hasTouch:name==='phone',isMobile:name==='phone'});
  await page.goto(base);
  await page.getByRole('heading',{name:'Play together. Anywhere.'}).waitFor();
  await page.locator('.featured-game-image').evaluate(img=>img.decode());
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Home overflow '+name);
  assert.equal(await page.getByText('PLAYABLE NOW',{exact:true}).count(),0);
  assert.equal(await page.locator('.wash-art-water-jet,.art-chip,.hero-meta').count(),0);
  await page.screenshot({path:`test-results/home-${name}.png`,fullPage:true});
  await page.getByRole('button',{name:'Play Kart Rush Arena'}).click();
  assert.equal(await page.locator('.panel button.primary').isDisabled(),true);
  assert.equal(await page.locator('select').inputValue(),'kart-rush');
  await page.close();
 }
 if(process.env.TEST_STATIC_ONLY!=='1'){
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  await page.goto(base+'/?create=power-wash');
  await page.getByRole('button',{name:'Screen + Controls',exact:false}).click();
  await page.locator('.panel button.primary').click();
  await page.getByRole('button',{name:'Start Game',exact:false}).click();
  await page.locator('.wash-canvas[data-vehicle="detailed"]').waitFor({timeout:30000});
  await page.waitForTimeout(3500);
  assert.equal(await page.locator('.job-stars,.objects-hud-list,.keyboard-hint').count(),0);
  await page.screenshot({path:'test-results/game-clean-hud.png'});
  const hideHud=await page.addStyleTag({content:'.race-screen > :not(.wash-canvas) {visibility:hidden!important}'});
  await page.locator('.wash-canvas canvas').screenshot({path:'public/wash-world.png'});
  await hideHud.evaluate(el=>el.remove());
  await page.getByRole('button',{name:'Menu',exact:true}).click();
  await page.getByText('Objects to clean',{exact:true}).click();
  assert.equal(await page.locator('.menu-object-list>div').count(),7);
  await page.getByRole('button',{name:'Sound',exact:false}).click();
  await page.getByRole('button',{name:'Graphics',exact:false}).click();
  await page.getByRole('button',{name:'Close game menu'}).click();
  assert.equal(await page.locator('#wash-game-menu').count(),0);
  await page.getByRole('button',{name:'Split view',exact:true}).click();
  assert.equal(await page.locator('.split-options-dropdown input').nth(1).isChecked(),false);
  await page.getByRole('button',{name:'Split view',exact:true}).click();
  await page.getByRole('button',{name:'Menu',exact:true}).click();
  await page.getByRole('button',{name:'Return to lobby',exact:false}).click();
  await page.getByRole('heading',{name:'Assemble your crew.'}).waitFor();
 }
 console.log('PASS responsive home, game selection and explicit host choice'+(process.env.TEST_STATIC_ONLY==='1'?' (static UI only)':' + compact HUD, settings, object list, split consent default and lobby navigation'));
} finally {await browser.close();}
