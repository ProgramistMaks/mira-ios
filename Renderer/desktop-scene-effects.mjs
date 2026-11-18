import {
  CircleGeometry, Color, DoubleSide, Group, InstancedMesh, MathUtils, Mesh, MeshBasicMaterial,
  Object3D, RingGeometry, Shape, ShapeGeometry, Vector3,
} from 'three';

export function weatherKind(code) {
  if (code === 0 || code === 1) return 'sun';
  if (code === 2 || code === 3) return 'cloud';
  if (code === 45 || code === 48) return 'fog';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  if ([95, 96, 99].includes(code)) return 'storm';
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain';
  return 'none';
}

function material(color, opacity = 1) {
  return new MeshBasicMaterial({color, transparent: true, opacity, side: DoubleSide, depthWrite: false});
}

function lightning() {
  const bolt = new Shape();
  bolt.moveTo(.12, .9); bolt.lineTo(-.55, -.05); bolt.lineTo(-.05, -.04);
  bolt.lineTo(-.21, -.85); bolt.lineTo(.6, .24); bolt.lineTo(.07, .2); bolt.closePath();
  return new ShapeGeometry(bolt);
}

function cloud(group, circle, color, density, disks) {
  const body = new Group();
  const mat = material(color);
  const lobes = [[-.43,-.10,.39],[.41,-.10,.42],[0,.12,.54],[-.31,.13,.33],[.32,.23,.30]];
  for (const [x,y,r] of lobes) {
    const mesh = new Mesh(circle, mat);
    mesh.position.set(x, y, 0);
    mesh.scale.set(r, r*density, 1);
    body.add(mesh);
  }
  body.renderOrder = 2;
  group.add(body);
  disks.push(mat);
  return body;
}

export class DesktopWeather {
  constructor(scene, head, hips, height) {
    Object.assign(this,{scene,head,hips,height});
    this.world = new Vector3();
    this.particle = new Object3D();
    this.kind = this.target = 'none';
    this.alpha = this.time = 0;
    this.group = null;
  }

  set(code) { this.target = weatherKind(code); }

  assemble(kind) {
    if (this.group) {
      this.group.removeFromParent();
      for (const object of this.group.children) if (object.isInstancedMesh) object.dispose();
      for (const mat of this.materials) mat.dispose();
      for (const geometry of this.geometries) geometry.dispose();
    }
    this.group = new Group();
    this.scene.add(this.group);
    this.materials = [];
    const circle = new CircleGeometry(1,24);
    this.geometries = [circle];
    this.clouds = [];
    this.sun = this.bolt = this.drops = null;
    if (kind === 'cloud' || kind === 'rain' || kind === 'storm' || kind === 'fog') {
      const color = new Color(({cloud:0xcbd9ee,rain:0x94b2d7,storm:0x596286,fog:0xe3dded})[kind]);
      this.clouds = Array.from({length:kind === 'fog' ? 4 : 3}, (_, i) => {
        return cloud(this.group,circle,color.clone().multiplyScalar(.85+i*.08),kind === 'fog' ? .36 : .92,this.materials);
      });
    }
    if (kind === 'sun') {
      const spokes = new Group();
      const ray = material(0xffce71);
      this.materials.push(ray);
      for (let i=0;i<12;i++) {
        const pivot = new Group();
        pivot.rotation.z = i*Math.PI/6;
        const mesh = new Mesh(circle,ray);
        mesh.position.y = .83;
        mesh.scale.set(.067,.16,1);
        pivot.add(mesh);
        spokes.add(pivot);
      }
      const disk = new Mesh(circle,material(0xffd464));
      disk.scale.setScalar(.64);
      this.materials.push(disk.material);
      spokes.add(disk);
      this.group.add(spokes);
      this.sun = spokes;
    }
    if (kind === 'storm') {
      const geometry = lightning();
      this.geometries.push(geometry);
      this.bolt = new Mesh(geometry,material(0xffdc83));
      this.materials.push(this.bolt.material);
      this.group.add(this.bolt);
    }
    if (['rain','storm','snow','sun'].includes(kind)) {
      const count = {rain:42,storm:60,snow:36,sun:8}[kind];
      this.drops = new InstancedMesh(circle,material(({rain:0x67b9df,storm:0x65afdc,snow:0xa3c4ed,sun:0xffd792})[kind]),count);
      this.drops.frustumCulled = false;
      this.drops.renderOrder = 3;
      this.materials.push(this.drops.material);
      this.group.add(this.drops);
      this.flakes = Array.from({length:count},()=>({x:Math.random(),y:Math.random(),rate:.8+Math.random()*.5}));
    }
  }

  update(dt, camera, reduced) {
    if (reduced) {
      if (this.group) this.group.visible = false;
      this.alpha = 0;
      return;
    }
    this.alpha = MathUtils.damp(this.alpha,this.target === this.kind && this.kind !== 'none' ? 1 : 0,5,dt);
    if (this.target !== this.kind && this.alpha < .025) {
      this.kind = this.target;
      this.assemble(this.kind);
      this.time = 0;
    }
    if (!this.group) return;
    this.group.visible = this.kind !== 'none';
    if (!this.group.visible) return;
    this.time += dt;
    const fog = this.kind === 'fog';
    const h = this.height, t = this.time;
    (fog ? this.hips : this.head)?.getWorldPosition(this.world);
    this.group.position.copy(this.world);
    this.group.position.y += h*(fog ? -.26 : .15);
    this.group.position.z += h*.16;
    this.group.quaternion.copy(camera.quaternion);
    this.group.scale.setScalar(h);
    for (const mat of this.materials) mat.opacity = this.alpha*(fog ? .12 : .84);
    this.clouds.forEach((puff,i)=>{
      const drift = Math.sin(t*.75 + i*1.75);
      puff.position.set((i-(this.clouds.length-1)/2)*(fog ? .13 : .087)+drift*.025,
        fog ? i%2*.088 : drift*.012,-i*.011);
      puff.scale.setScalar(fog ? .16 : .084 + .014*(i%2));
    });
    if (this.sun) {
      this.sun.position.set(.125,.007,-.013);
      this.sun.scale.setScalar(.074);
      this.sun.rotation.z = t*.16;
    }
    if (this.bolt) {
      const flash = t%3.8;
      this.bolt.position.set(Math.sin(Math.floor(t/3.8)*4)*.13,-.105,.03);
      this.bolt.scale.setScalar(.074);
      this.bolt.material.opacity = flash < .21 ? this.alpha*(1-flash/.21) : 0;
    }
    if (this.drops) {
      const snow = this.kind === 'snow', sun = this.kind === 'sun';
      const speed = snow ? .27 : sun ? .32 : this.kind === 'storm' ? 2.6 : 1.9;
      const particle = this.particle;
      this.flakes.forEach(({x,y,rate},i)=>{
        const progress = (y+t*speed*rate)%1;
        const away = x<.5 ? -.034 : .034;
        const drift = Math.sin(t*1.6+i) * (snow || sun ? .022 : .003);
        const width = sun ? .28 : .38;
        particle.position.set((x-.5)*width+away+drift-(snow || sun ? 0 : progress*.06),
          (sun ? .07 : -.025) - progress*(sun ? .48 : .78),.015+x*.018);
        particle.rotation.z = snow ? t*rate : sun ? Math.PI/4 : -.12;
        const size = MathUtils.smoothstep(progress,0,.1)*(1-MathUtils.smoothstep(progress,.66,1));
        particle.scale.set((snow ? .0045 : .0021)*size,(snow ? .0045 : sun ? .008 : .018)*size,1);
        particle.updateMatrix();
        this.drops.setMatrixAt(i,particle.matrix);
      });
      this.drops.instanceMatrix.needsUpdate = true;
    }
  }
}

export class DesktopPortal {
  constructor(scene,height,center) {
    this.group = new Group();
    this.group.scale.setScalar(height);
    this.group.position.set(center.x,center.y,center.z);
    this.group.visible = false;
    scene.add(this.group);
    this.rings = [0x986dff,0xd5bbff,0x7469e8].map((color,i)=>{
      const ring = new Mesh(new RingGeometry(.102+i*.032,.108+i*.038,68),material(color));
      ring.rotation.x = -Math.PI/2;
      ring.position.y = .013+i*.014;
      this.group.add(ring);
      return ring;
    });
    this.glow = new Mesh(new CircleGeometry(.175,64),material(0xaaa6ff));
    this.glow.rotation.x = -Math.PI/2;
    this.group.add(this.glow);
  }

  update(age,duration) {
    this.group.visible = age >= 0;
    if (!this.group.visible) return;
    const t = Math.min(1,age/Math.max(.1,duration));
    const strength = MathUtils.smoothstep(t,0,.2)*(1-MathUtils.smoothstep(t,.81,1));
    this.group.rotation.y = t*3;
    for (const [i,ring] of this.rings.entries()) {
      ring.scale.setScalar(.52+.48*strength+.08*Math.sin(t*17-i));
      ring.material.opacity = strength*(.92-i*.14);
    }
    this.glow.material.opacity = strength*.28;
  }
}
