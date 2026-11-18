// Visual review of the iOS app's bundled renderer, not the hosted Site.
// The test adapter replaces wall-clock scheduling with deterministic 30 Hz steps.
import {chromium} from '@playwright/test';
import {build} from 'esbuild';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import {CHOREOGRAPHY} from '../Renderer/choreography.mjs';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
let source=await readFile('Renderer/avatar.ts','utf8');
source=source.replace('  renderer.setAnimationLoop(timestamp => {','  const renderFrame = (timestamp: number) => {');
source=source.replace('  });\n}\n\nmain()',`  };\n  let reviewTime = 0;\n  const composite=document.createElement('canvas'); composite.width=512; composite.height=384;
  const ctx=composite.getContext('2d')!;
  const sideCamera=camera.clone();
  (window as any).nativeReview = {step: (capture: boolean) => {
    reviewTime += 1000/30; renderFrame(reviewTime);
    if(!capture)return null;
    ctx.fillStyle='#f5f0e4';ctx.fillRect(0,0,512,384);
    renderer.render(scene,camera);ctx.drawImage(renderer.domElement,0,0,256,384);
    sideCamera.copy(camera);sideCamera.position.applyAxisAngle(new THREE.Vector3(0,1,0),.72);
    sideCamera.lookAt(0,center.y,0);renderer.render(scene,sideCamera);ctx.drawImage(renderer.domElement,256,0,256,384);
    return composite.toDataURL('image/jpeg',.9).split(',')[1];
  },rig:authored};
  renderFrame(0);\n}\n\nmain()`);
const bundle=await build({stdin:{contents:source,resolveDir:new URL('../Renderer/',import.meta.url).pathname,loader:'ts'},bundle:true,write:false,format:'iife'});
const root=new URL('../Resources/Web/',import.meta.url),out=process.env.MOTION_REVIEW_OUT||'/tmp/mira-native-motion';await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{const p=new URL(req.url,'http://localhost').pathname;
 const file={'/':'index.html','/character.vrm':'character.vrm'}[p];
 if(p==='/avatar.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].contents);return;}
 if(!file){res.writeHead(404).end();return;}res.setHeader('Content-Type',p==='/'?'text/html':'application/octet-stream');res.end(await readFile(new URL(file,root)));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:360,height:600},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>window.companion?.ready,{timeout:30000});
 await page.evaluate(()=>{document.body.style.background='#f5f0e4';window.companion.setViewport(256,384);window.companion.configurePerformance({variant:-1});});
 for(const id of (process.env.MOTION_CLIPS?.split(',') ?? CHOREOGRAPHY.map(c=>c.id))){
  const duration=await page.evaluate(id=>{window.companion.configureChoreography(id);window.companion.replayGesture();return window.nativeReview.rig.duration;},id);
  const encoder=spawn('ffmpeg',['-loglevel','error','-y','-f','image2pipe','-vcodec','mjpeg','-framerate','15','-i','pipe:0','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',out+'/'+id+'.mp4'],{stdio:['pipe','ignore','inherit']});
  const exited=once(encoder,'close');
  for(let f=0;f<=Math.ceil((duration+.15)*30);f++){
   const jpg=await page.evaluate(capture=>window.nativeReview.step(capture),f%2===0);
   if(jpg && !encoder.stdin.write(Buffer.from(jpg,'base64'))) await once(encoder.stdin,'drain');
  }
  encoder.stdin.end();assert.equal((await exited)[0],0);console.log('captured',id);
 }
 assert.deepEqual(errors,[]);await writeFile(`${out}/review.json`,JSON.stringify({renderer:'native iOS WebGL bundle',width:512,height:384,fps:15,simulationHz:30,angles:[0,41],errors},null,2));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
