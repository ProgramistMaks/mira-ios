import { BufferAttribute, BufferGeometry } from 'three';

// Subdivide only skinned hair without morph targets. Interpolating skin weights
// lets the denser surface bend between joints; it does not invent strands or textures.
export function subdivideSkin(geometry) {
  if(!geometry.index || !geometry.attributes.skinWeight || !geometry.attributes.skinIndex || Object.keys(geometry.morphAttributes).length)return null;
  if(geometry.index.count>150000 || geometry.attributes.position.count>50000)return null;
  const arrays={},names=Object.keys(geometry.attributes);
  if(names.some(n=>geometry.attributes[n].isInterleavedBufferAttribute))return null;
  for(const name of names){const a=geometry.attributes[name];arrays[name]=Array.from(a.array);}
  let count=geometry.attributes.position.count;const cache=new Map();
  function midpoint(a,b){
    const key=a<b?`${a}:${b}`:`${b}:${a}`;if(cache.has(key))return cache.get(key);
    const index=count++;cache.set(key,index);
    for(const name of names){
      if(name==='skinWeight'||name==='skinIndex')continue;
      const attr=geometry.attributes[name],n=attr.itemSize;
      for(let c=0;c<n;c++)arrays[name].push((attr.array[a*n+c]+attr.array[b*n+c])*.5);
      if(name==='normal'){const p=arrays[name].length-n,l=Math.hypot(...arrays[name].slice(p));if(l>0)for(let c=0;c<n;c++)arrays[name][p+c]/=l;}
    }
    const influences=new Map(),w=geometry.attributes.skinWeight,j=geometry.attributes.skinIndex;
    for(const v of [a,b])for(let c=0;c<4;c++){const joint=j.getComponent(v,c),weight=w.getComponent(v,c)*.5;influences.set(joint,(influences.get(joint)??0)+weight);}
    const sorted=[...influences].sort((a,b)=>b[1]-a[1]).slice(0,4),sum=sorted.reduce((s,v)=>s+v[1],0)||1;
    for(let c=0;c<4;c++){arrays.skinIndex.push(sorted[c]?.[0]??0);arrays.skinWeight.push((sorted[c]?.[1]??0)/sum);}
    return index;
  }
  const indices=[];
  for(let i=0;i<geometry.index.count;i+=3){
    const a=geometry.index.getX(i),b=geometry.index.getX(i+1),c=geometry.index.getX(i+2),ab=midpoint(a,b),bc=midpoint(b,c),ca=midpoint(c,a);
    indices.push(a,ab,ca,ab,b,bc,ca,bc,c,ab,bc,ca);
  }
  const result=new BufferGeometry();
  for(const name of names){const old=geometry.attributes[name];result.setAttribute(name,new BufferAttribute(new old.array.constructor(arrays[name]),old.itemSize,old.normalized));}
  result.setIndex(indices);for(const g of geometry.groups)result.addGroup(g.start*4,g.count*4,g.materialIndex);
  result.computeBoundingBox();result.computeBoundingSphere();return result;
}

export class HairDetail {
  constructor(root){
    this.mode='standard';this.entries=[];this.error='';this.root=root;
    root.traverse(mesh=>{if(mesh.isSkinnedMesh&&/hair/i.test(mesh.name)&&mesh.geometry.index&&mesh.geometry.attributes.skinWeight&&mesh.geometry.attributes.skinIndex&&!Object.keys(mesh.geometry.morphAttributes).length)this.entries.push({mesh,standard:mesh.geometry,high:null});});
  }
  set(mode){
    if(mode===this.mode)return;
    this.error='';
    if(mode==='high' && this.entries.reduce((n,e)=>n+e.standard.index.count,0)>150000){this.error='Сетка слишком велика для безопасного уплотнения';this.mode=mode;return;}
    for(const e of this.entries){
      if(mode==='high'&&!e.high){try{e.high=subdivideSkin(e.standard);}catch{this.error='Недостаточно ресурсов для плотной сетки';}}
      e.mesh.geometry=mode==='high'&&e.high?e.high:e.standard;
      if(mode==='standard'&&e.high){e.high.dispose();e.high=null;}
    }
    this.mode=mode;
  }
  get triangles(){let n=0;this.root.traverse(m=>{if(m.isMesh)n+=(m.geometry.index?.count??m.geometry.attributes.position.count)/3;});return n;}
  get available(){return this.entries.length>0;}
}
