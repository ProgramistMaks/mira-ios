import {
  BoxGeometry, Color, EdgesGeometry, Group, InstancedMesh, LineBasicMaterial, LineSegments, MathUtils, Mesh, MeshBasicMaterial,
  Object3D, Shape, ShapeGeometry, Vector3,
} from 'three';

const rows = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
const fingers = ['Little', 'Ring', 'Middle', 'Index', 'Index', 'Index', 'Index', 'Middle', 'Ring', 'Little'];
const sides = ['left', 'right'];
const quietKey = new Color(0x6455a2);
const litKey = new Color(0xffd8ff);

function makeKeyboard(height, forward) {
  const group = new Group();
  group.position.set(0, -.11 * height, forward * .22 * height);
  group.rotation.x = forward * .43;
  const panel = new Mesh(new BoxGeometry(.32 * height, .007 * height, .124 * height),
    new MeshBasicMaterial({color: 0xa69acb, transparent: true, opacity: 0, depthWrite: false}));
  group.add(panel);
  const edges = new LineSegments(new EdgesGeometry(panel.geometry),
    new LineBasicMaterial({color: 0xbbacfa, transparent: true, opacity: 0, depthWrite: false}));
  edges.renderOrder = 1;
  group.add(edges);

  const keys = rows.flatMap((row, y) => Array.from(row, (label, x) => ({
    label, x: (x - (row.length - 1) / 2) * .029 * height * -forward,
    z: (1.4 - y) * .030 * height * forward,
    side: x < (y === 2 ? 4 : 5) ? 'left' : 'right', finger: fingers[x + (y === 2 && x >= 4 ? 1 : 0)],
    width: .024,
  })));
  keys.push({label: 'Space', x: 0, z: -.044 * height * forward, side: 'left', finger: 'Thumb', width: .125});
  const caps = new InstancedMesh(new BoxGeometry(height, .005 * height, .021 * height),
    new MeshBasicMaterial({color: 0xffffff, transparent: true, opacity: 0, depthWrite: false}), keys.length);
  caps.renderOrder = 1;
  const cap = new Object3D();
  keys.forEach((key, index) => {
    key.index = index;
    cap.position.set(key.x, .008 * height, key.z);
    cap.scale.set(key.width, 1, 1);
    cap.updateMatrix();
    caps.setMatrixAt(index, cap.matrix);
    caps.setColorAt(index, quietKey);
  });
  group.add(caps);
  group.visible = false;
  return {group, panel, edges, caps, keys};
}

function makeHearts(scene) {
  const shape = new Shape();
  shape.moveTo(0, -.57);
  shape.bezierCurveTo(-.24, -.33, -.68, -.05, -.6, .26);
  shape.bezierCurveTo(-.53, .58, -.14, .57, 0, .31);
  shape.bezierCurveTo(.14, .57, .53, .58, .6, .26);
  shape.bezierCurveTo(.68, -.05, .24, -.33, 0, -.57);
  const geometry = new ShapeGeometry(shape);
  return Array.from({length: 18}, (_, i) => {
    const mesh = new Mesh(geometry, new MeshBasicMaterial({
      color: [0xff91b8, 0xffc9da, 0xbea3ff][i % 3], transparent: true, depthWrite: false,
    }));
    mesh.visible = false;
    mesh.renderOrder = 2;
    scene.add(mesh);
    return {mesh, life: 0};
  });
}

export class InteractiveReactions {
  constructor(scene, head, chest, height, armSign, random = Math.random) {
    this.head = head;
    this.height = height;
    this.armSign = armSign;
    this.forward = -armSign;
    this.random = random;
    this.hearts = head ? makeHearts(scene) : [];
    this.keyboard = chest ? makeKeyboard(height, this.forward) : null;
    chest?.add(this.keyboard.group);
    this.chest = chest;
    this.restKeys = this.keyboard && [this.keyboard.keys.find(key => key.label === 'F'),
      this.keyboard.keys.find(key => key.label === 'J')];
    this.paths = {};
    this.digits = {};
    this.wrists = [new Vector3(), new Vector3()];
    this.wristGoal = new Vector3();
    this.headPosition = new Vector3();
    this.keyColor = new Color();
    this.happiness = this.typing = this.petTime = this.previewTime = 0;
    this.strokeTravel = this.strokeTime = this.strokeDirection = this.headTilt = this.heartDelay = this.keyDelay = this.burst = 0;
    this.status = {hearts: 0, smile: 0, keyboard: false, key: null};
  }

  stroke(dx, dy) {
    const travel = Math.hypot(dx, dy);
    if (!this.head || travel < 1) return;
    this.strokeTime = .22;
    this.strokeTravel += travel;
    if (this.strokeTravel < 7) return;
    this.strokeDirection = MathUtils.clamp(dx / travel, -1, 1);
    this.petTime = .32;
    this.strokeTravel = 7;
  }

  endStroke() {
    this.strokeTravel = 0;
    this.strokeTime = 0;
    this.petTime = 0;
  }

  preview(kind) {
    if (kind === 'pet' && this.head) {
      this.petTime = .92;
      this.strokeDirection = .65;
    }
    if (kind === 'typing' && this.keyboard) this.previewTime = 6;
  }

  nextKey() {
    const {keys} = this.keyboard;
    if (this.burst <= 0) {
      this.burst = 3 + Math.floor(this.random() * 5);
      return keys.at(-1);
    }
    this.burst--;
    const candidates = keys.slice(0, -1).filter(key => key.side !== this.key?.side);
    return candidates[Math.floor(this.random() * candidates.length)];
  }

  update(delta, thinking, disabled, armTargets, articulation) {
    this.petTime = Math.max(0, this.petTime - delta);
    this.strokeTime = Math.max(0, this.strokeTime - delta);
    this.previewTime = Math.max(0, this.previewTime - delta);
    if (disabled) {
      this.endStroke();
      this.previewTime = this.happiness = this.typing = this.headTilt = 0;
      for (const heart of this.hearts) {
        heart.life = 0;
        heart.mesh.visible = false;
      }
    }
    const petting = this.petTime > 0;
    if (!this.strokeTime) this.strokeTravel = 0;
    this.happiness = MathUtils.damp(this.happiness, petting ? 1 : 0, petting ? 14 : 4.5, delta);
    this.headTilt = MathUtils.damp(this.headTilt, petting ? this.strokeDirection : 0, 9, delta);
    if (this.keyboard) this.updateTyping(delta, !disabled && (thinking || this.previewTime > 0), armTargets, articulation);
    this.head?.rotateZ(.09 * this.armSign * this.headTilt);
    this.head?.rotateX(this.forward * (.075 * this.typing - .035 * this.happiness));

    this.heartDelay -= delta;
    if (petting && this.heartDelay <= 0) {
      const heart = this.hearts.find(item => item.life <= 0);
      if (heart) {
        heart.life = heart.duration = 1.1 + this.random() * .56;
        heart.side = this.random() < .5 ? -1 : 1;
        heart.height = .055 + this.random() * .07;
        heart.size = .029 + this.random() * .018;
      }
      this.heartDelay = .13;
    }
    this.status.smile = this.happiness;
  }

  updateTyping(delta, working, armTargets, articulation) {
    const {group, panel, edges, caps} = this.keyboard;
    this.typing = MathUtils.damp(this.typing, working ? 1 : 0, working ? 4.8 : 6, delta);
    group.visible = this.status.keyboard = this.typing > .012;
    if (!working && this.key) {
      caps.setColorAt(this.key.index, quietKey);
      caps.instanceColor.needsUpdate = true;
      this.key = undefined;
    }
    this.status.key = null;
    if (!group.visible) {
      this.keyDelay = 0;
      return;
    }
    panel.material.opacity = this.typing * .55;
    edges.material.opacity = this.typing * .9;
    caps.material.opacity = this.typing * .88;
    if (working && this.typing > .55) {
      this.keyDelay -= delta;
      if (this.keyDelay <= 0) {
        if (this.key) caps.setColorAt(this.key.index, quietKey);
        this.key = this.nextKey();
        this.keyLength = .23 + this.random() * .17;
        this.keyDelay = this.keyLength;
      }
    }
    const progress = this.key ? MathUtils.clamp(1 - this.keyDelay / this.keyLength, 0, 1) : 0;
    const press = Math.sin(Math.PI * MathUtils.smoothstep(progress, .24, .81));
    if (this.key) {
      caps.setColorAt(this.key.index, this.keyColor.copy(quietKey).lerp(litKey, press));
      caps.instanceColor.needsUpdate = true;
      if (press > .45) this.status.key = this.key.label;
    }

    sides.forEach((side, i) => {
      const key = this.key?.side === side ? this.key : this.restKeys[i];
      const palmSide = (i === 0 ? -1 : 1) * this.armSign;
      const weight = MathUtils.smoothstep(this.typing, i * .12, .97);
      const keyX = MathUtils.lerp(this.restKeys[i].x, key.x, key.finger === 'Thumb' ? .25 : .78);
      const pressDepth = key === this.key ? press : 0;
      this.wristGoal.set(keyX, (.027 - .009 * pressDepth) * this.height, key.z - .056 * this.height * this.forward);
      group.localToWorld(this.wristGoal);
      this.chest.worldToLocal(this.wristGoal);
      const wrist = this.wrists[i];
      if (weight < .03) wrist.copy(this.wristGoal);
      else wrist.lerp(this.wristGoal, 1 - Math.exp(-17 * delta));
      this.paths[side] = {
        anchor: 'chest', weight, elbow: .17,
        position: [wrist.x / (palmSide * this.height), wrist.y / this.height, wrist.z / (this.forward * this.height)],
        fingers: [0, -.18, .98], palm: [0, -1, -.18],
      };
      for (const finger of ['Thumb', 'Index', 'Middle', 'Ring', 'Little']) {
        const bend = finger === key.finger ? pressDepth : 0;
        this.digits[side + finger + '0'] = .16 + .39 * bend;
        this.digits[side + finger + '1'] = .29 + .38 * bend;
        this.digits[side + finger + '2'] = .10 + .22 * bend;
      }
    });
    armTargets.apply({}, this.paths);
    articulation.apply(this.digits, this.paths);
  }

  drawHearts(delta, camera) {
    this.status.hearts = 0;
    if (!this.hearts.some(heart => heart.life > 0)) return;
    this.head.getWorldPosition(this.headPosition);
    for (const heart of this.hearts) {
      if (heart.life <= 0) continue;
      heart.life = Math.max(0, heart.life - delta);
      const t = 1 - heart.life / heart.duration;
      const opacity = MathUtils.smoothstep(t, 0, .13) * (1 - MathUtils.smoothstep(t, .48, 1));
      heart.mesh.visible = heart.life > 0;
      heart.mesh.material.opacity = opacity;
      heart.mesh.quaternion.copy(camera.quaternion);
      heart.mesh.rotateZ(heart.side * (.20 - t * .31));
      heart.mesh.position.copy(this.headPosition);
      heart.mesh.position.x += heart.side * (.05 + .105 * t + .024 * Math.sin(t * 5)) * this.height;
      heart.mesh.position.y += (heart.height + .20 * t) * this.height;
      heart.mesh.position.z += .12 * this.height;
      heart.mesh.scale.setScalar(heart.size * this.height * (.67 + .33 * MathUtils.smoothstep(t, 0, .26)));
      if (opacity > .02) this.status.hearts++;
    }
  }
}
