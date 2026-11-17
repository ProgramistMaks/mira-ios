import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const files = new Map([
  ['/Design/cream.html', ['Design/cream.html','text/html']],
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
 for(const [name,width,height,state] of [['portrait',390,780,'setup'],['conversation',390,780,'listening'],['compact',320,568,'idle'],['landscape',844,390,'idle'],['expanded',820,1000,'idle']]){
  await page.setViewportSize({width,height});await page.evaluate(state=>window.setPreviewState(state),state);
  await page.waitForTimeout(1400);
  const screen=await page.locator('.screen').boundingBox();const stage=await page.locator('.stage').boundingBox();
  assert.ok(stage.height>=160,'Character stage must keep usable space');
  for(const selector of ['.settings','.chat','.primary','.voice']){const r=await page.locator(selector).boundingBox();assert.ok(r.width>=44&&r.height>=44);assert.ok(r.x>=screen.x&&r.x+r.width<=screen.x+screen.width+1);assert.ok(r.y+r.height<=screen.y+screen.height+1);}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('.screen').screenshot({path:`${output}/${name}.png`});
  console.log(`${name}: ${width}×${height}, character stage ${Math.round(stage.width)}×${Math.round(stage.height)}, controls inside screen`);
 }
 await page.setViewportSize({width:390,height:780});await page.locator('.chat').click();await page.locator('.sheet.open').screenshot({path:`${output}/chat.png`});await page.locator('.close').click();
 assert.deepEqual(errors,[]);console.log('Live WebGL scene and browser layout checks passed. This does not validate SwiftUI or native Liquid Glass.');
}finally{await browser?.close();server.close();}
