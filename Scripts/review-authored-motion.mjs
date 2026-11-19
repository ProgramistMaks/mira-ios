// Visual review of the iOS app's bundled renderer, not the hosted Site.
// The test adapter replaces wall-clock scheduling with independent simulation steps. Set MOTION_REVIEW_FPS=120 for a full-rate capture.
import {chromium} from '@playwright/test';
import {build} from 'esbuild';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import {CHOREOGRAPHY} from '../Renderer/choreography.mjs';
import checkpoints from '../Renderer/fixtures/reference-checkpoints.json' with {type:'json'};
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
const fps=Number(process.env.MOTION_REVIEW_FPS ?? 15);
assert.ok([15,30,60,120].includes(fps));
const simulationHz=Math.max(30,fps);
const checkSource=process.env.MOTION_REVIEW_REFS==='1';
const frontOnly=process.env.MOTION_REVIEW_VIEW==='front';
const portrait=process.env.MOTION_REVIEW_VIEW==='portrait';
const width=frontOnly?480:256, height=frontOnly?672:384;
function distribution(errors){
 const sorted=errors.toSorted((a,b)=>a-b);
 const mid=Math.floor(sorted.length/2);
 const median=sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
 return {count:sorted.length,median,
   p90:sorted[Math.ceil(sorted.length*.9)-1],max:sorted.at(-1)};
}
let source=await readFile('Renderer/avatar.ts','utf8');
const startLoop='  renderer.setAnimationLoop(renderFrame);\n}';
assert.equal(source.split(startLoop).length,2,'renderer startup hook changed');
source=source.replace(startLoop,`  let reviewTime = 0;
  const composite=document.createElement('canvas');
  composite.width=${frontOnly?width:width*2}; composite.height=${height};
  const ctx=composite.getContext('2d')!;
  const sideCamera=camera.clone();
  const reviewTargetY=center.y+height*${portrait ? .31 : 0};
  (window as any).nativeReview = {joints: () => {
    const projected=(id: any) => {
      const p=avatar.humanoid.getRawBoneNode(id)!.getWorldPosition(new THREE.Vector3()).project(camera);
      return new THREE.Vector2(p.x*camera.aspect,p.y);
    };
    const mid=projected('leftUpperArm').lerp(projected('rightUpperArm'),.5);
    const span=mid.distanceTo(projected('hips'));
    return ['leftHand','leftLowerArm','rightHand','rightLowerArm'].map(id=>projected(id).sub(mid).divideScalar(span).toArray());
  },step: (capture: boolean) => {
    if (${portrait}) {
      camera.position.set(0,reviewTargetY,height*.23/Math.tan(THREE.MathUtils.degToRad(camera.fov/2)));
      camera.lookAt(0,reviewTargetY,0);
    }
    reviewTime += 1000/${simulationHz};
    window.companion.renderDisplayFrame(reviewTime);
    if(!capture)return null;
    ctx.fillStyle='#f5f0e4';ctx.fillRect(0,0,composite.width,composite.height);
    ctx.drawImage(renderer.domElement,0,0,${width},${height});
    if (!${frontOnly}) {
      sideCamera.copy(camera);sideCamera.position.applyAxisAngle(new THREE.Vector3(0,1,0),.72);
      sideCamera.lookAt(0,reviewTargetY,0);renderer.render(scene,sideCamera);
      ctx.drawImage(renderer.domElement,${width},0,${width},${height});
    }
    return composite.toDataURL('image/jpeg',.94).split(',')[1];
  },rig:authored};
  renderFrame(0);
}`);
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
 await page.evaluate(([w,h,rate])=>{window.companion.setFrameRate(rate);window.companion.setViewport(w,h);window.companion.configurePerformance({variant:-1});},[width,height,simulationHz]);
 const comparisons={},allMarkerErrors=[];
 for(const id of (process.env.MOTION_CLIPS?.split(',') ?? CHOREOGRAPHY.map(c=>c.id))){
  const duration=await page.evaluate(id=>{
    if(id==='welcome') {
      window.companion.configureChoreography('auto');
      window.nativeReview.rig.react('greeting');
    } else {
      window.companion.configureChoreography(id);window.companion.replayGesture();
    }
    return window.nativeReview.rig.duration;
  },id);
  const encoder=spawn('ffmpeg',['-loglevel','error','-y','-f','image2pipe','-vcodec','mjpeg','-framerate',String(fps),'-i','pipe:0','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',out+'/'+id+'.mp4'],{stdio:['pipe','ignore','inherit']});
  const exited=once(encoder,'close');
  const reference=checkSource && checkpoints[id], samples=[];
  for(let f=0;f<Math.ceil((duration+.15)*simulationHz);f++){
   const jpg=await page.evaluate(capture=>window.nativeReview.step(capture),f%(simulationHz/fps)===0);
   if(reference && f/simulationHz<reference.start+reference.frames.at(-1)[0]/30+.12){
    samples.push(await page.evaluate(()=>[window.nativeReview.rig.age,window.nativeReview.joints()]));
   }
   if(jpg && !encoder.stdin.write(Buffer.from(jpg,'base64'))) await once(encoder.stdin,'drain');
  }
  encoder.stdin.end();assert.equal((await exited)[0],0);console.log('captured',id);
  if(reference){
   const errors=reference.frames.flatMap(([frame,...marks])=>{
    const time=reference.start+frame/30;
    const nearest=samples.reduce((a,b)=>Math.abs(a[0]-time)<Math.abs(b[0]-time)?a:b);
    assert.ok(Math.abs(nearest[0]-time)<1/simulationHz+.001,'missing source time for '+id);
    return marks.flatMap((p,j)=>p?[Math.hypot(p[0]-nearest[1][j][0],p[1]-nearest[1][j][1])]:[]);
   });
   comparisons[id]=distribution(errors);
   allMarkerErrors.push(...errors);
  }
 }
 if(allMarkerErrors.length){
  comparisons.total=distribution(allMarkerErrors);
  await writeFile(out+'/reference-errors.json',JSON.stringify(comparisons,null,2));
 }
 assert.deepEqual(errors,[]);await writeFile(`${out}/review.json`,JSON.stringify({renderer:'native iOS WebGL bundle',width:frontOnly?width:2*width,height,fps,simulationHz,angles:frontOnly?[0]:[0,41],errors},null,2));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
