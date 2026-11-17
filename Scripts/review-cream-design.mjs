import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const files = new Map([
  ['/Design/cream.html', ['Design/cream.html','text/html']],
  ['/Design/themes-duo.css', ['Design/themes-duo.css','text/css']],
  ['/Design/themes-duo.js', ['Design/themes-duo.js','application/javascript']],
  ['/Design/screens.css', ['Design/screens.css','text/css']],
  ['/Design/screens.js', ['Design/screens.js','application/javascript']],
  ['/Resources/Web/index.html',['Resources/Web/index.html','text/html']],
  ['/Resources/Web/avatar.js',['Resources/Web/avatar.js','application/javascript']],
  ['/Resources/Web/character.vrm',['Resources/Web/character.vrm','model/gltf-binary']],
]);
const server=createServer(async(req,res)=>{const f=files.get(new URL(req.url,'http://localhost').pathname);if(!f){res.writeHead(404);res.end();return;}try{res.setHeader('Content-Type',f[1]);res.end(await readFile(f[0]));}catch{res.writeHead(500);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
const output=process.env.MIRA_DESIGN_OUTPUT??'/tmp/mira-cream-review';
try{
 await mkdir(output,{recursive:true});
 browser=await chromium.launch({args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({deviceScaleFactor:2});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/Design/cream.html`);
 const scene=page.frames().find(f=>f.url().endsWith('/Resources/Web/index.html'));
 await scene.waitForFunction(()=>window.companion?.ready===true,undefined,{timeout:30000});
 if(!process.env.MIRA_REVIEW_PAGES_ONLY && !process.env.MIRA_REVIEW_DUO_ONLY) for(const [name,width,height,state] of [['portrait',390,780,'setup'],['conversation',390,780,'listening'],['compact',320,568,'idle'],['landscape',844,390,'idle'],['expanded',820,1000,'idle']]){
  await page.setViewportSize({width,height});await page.evaluate(state=>window.setPreviewState(state),state);
  await page.waitForTimeout(1400);
  const screen=await page.locator('.screen').boundingBox();const stage=await page.locator('.stage').boundingBox();
  assert.ok(stage.height>=160,'Character stage must keep usable space');
  for(const selector of ['.settings','.commands','.chat','.primary']){const r=await page.locator(selector).boundingBox();assert.ok(r.width>=44&&r.height>=44);assert.ok(r.x>=screen.x&&r.x+r.width<=screen.x+screen.width+1);assert.ok(r.y+r.height<=screen.y+screen.height+1);}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('.screen').screenshot({path:`${output}/${name}.png`});
  console.log(`${name}: ${width}×${height}, character stage ${Math.round(stage.width)}×${Math.round(stage.height)}, controls inside screen`);
 }
 if(!process.env.MIRA_REVIEW_DUO_ONLY) {
 for(const width of [390,320,844]) {
  await page.setViewportSize({width,height:width===844?390:780});
  for(const name of ['settings','models','voice','search','cloud','commands','chat','messages','widgets','appearance','data','themes','routines','routineEditor','voices','characters']){
   await page.evaluate(name=>window.openDesignPage(name),name);
   assert.equal(await page.locator('.sheet-content').evaluate(el=>el.scrollWidth>el.clientWidth+1),false,`${name}: no horizontal overflow`);
   const close=await page.locator('.close').boundingBox();const screen=await page.locator('.screen').boundingBox();
   assert.ok(close.height>=44 && close.y>=screen.y && close.y+close.height<=screen.y+screen.height);
   if(width===390)await page.locator('.screen').screenshot({path:`${output}/${name}.png`});
  }
  console.log(`All 16 secondary previews fit ${width}px width`);
 }
 await page.setViewportSize({width:390,height:780});
 await page.evaluate(()=>window.openDesignPage('models'));
 await page.locator('#model-query').fill('gemma');assert.equal(await page.locator('#model-cards .model-top').count(),1);
 await page.locator('[data-filter="installed"]').click();assert.ok(await page.getByText('Пока нет загруженных моделей').isVisible());
 await page.locator('[data-clear-models]').click();assert.equal(await page.locator('#model-cards .model-top').count(),5);
 await page.evaluate(()=>window.openDesignPage('commands'));
 await page.locator('[data-command="search"]').click();assert.ok(await page.getByRole('button',{name:'Искать в Мире',exact:true}).isVisible());
 await page.evaluate(()=>window.openDesignPage('chat'));
 await page.locator('[data-prompt]').first().click();assert.equal(await page.locator('.compose-preview input').inputValue(),'Давай придумаем идею');
 console.log('Design navigation, catalogue filtering and draft-only prompt selection passed. No app services invoked.');
 await page.locator('.close').click();
 }
 for(const theme of ['cream','night','rose','sage']) {
  await page.evaluate(theme=>window.setDesignTheme(theme),theme);
  for(const [name,width,height,pose] of [['outer',466,678,'flat'],['narrow',320,480,'flat'],['inner',890,626,'flat'],['book',890,626,'book'],['tabletop',626,890,'tabletop']]){
   await scene.evaluate(()=>window.companion.setActive(true));await page.setViewportSize({width,height});await page.evaluate(pose=>window.setDesignPosture(pose),pose);await page.waitForTimeout(300);await scene.evaluate(()=>window.companion.setActive(false));
   const stage=await page.locator('.stage').boundingBox();const screen=await page.locator('.screen').boundingBox();
   for(const selector of ['.primary','.chat','.settings','.commands']){const r=await page.locator(selector).boundingBox();assert.ok(r.width>=44&&r.height>=44,`${selector} tap size`);assert.ok(r.x>=screen.x&&r.x+r.width<=screen.x+screen.width+1&&r.y>=screen.y&&r.y+r.height<=screen.y+screen.height+1,`${theme}/${name}: controls inside screen`);}
   if(pose!=='flat') {const fold=await page.locator('.fold').boundingBox();const overlap=r=>r.x<fold.x+fold.width&&r.x+r.width>fold.x&&r.y<fold.y+fold.height&&r.y+r.height>fold.y;assert.equal(overlap(stage),false);assert.equal(overlap(await page.locator('.controls').boundingBox()),false);}
   await page.locator('.screen').screenshot({path:`${output}/${theme}-${name}.png`});
  }
 }
 await page.setViewportSize({width:320,height:480});await page.evaluate(()=>{document.querySelector('.screen').dataset.largeText='true';window.setDesignPosture('flat');});
 await page.waitForTimeout(100);assert.equal(await page.locator('.controls').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
 console.log('Four themes × five viewport/posture cases passed; large-text controls scroll without horizontal overflow. Simulated fold, not native Duo validation.');
 assert.deepEqual(errors,[]);console.log('Live WebGL scene and browser layout checks passed. This does not validate SwiftUI or native Liquid Glass.');
}finally{await browser?.close();server.close();}
