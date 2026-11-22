// Drawing only: the three.js scene, the chase camera, the lights and every
// mesh factory (people, cars, helicopter, mission markers) plus the transient
// effects (tracers, muzzle flashes, explosions, smoke). Game rules live in the
// system modules; this file turns state into pixels.
import * as THREE from '../vendor/three.module.min.js';
import { PALETTE } from './config.js';

const CAM_DIST_FOOT = 8.5;
const CAM_DIST_CAR = 11.5;
const CAM_DIST_AIM = 5.5;

function smokeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(120,120,120,0.55)');
  grad.addColorStop(0.6, 'rgba(90,90,90,0.28)');
  grad.addColorStop(1, 'rgba(80,80,80,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(PALETTE.fog, 150, 640);

  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1600);
  camera.position.set(0, 12, 20);

  // Golden-hour sun from the west, low enough for long shadows.
  const sun = new THREE.DirectionalLight(PALETTE.sun, 2.7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -95;
  sun.shadow.camera.right = 95;
  sun.shadow.camera.top = 95;
  sun.shadow.camera.bottom = -95;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 320;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);
  scene.add(new THREE.HemisphereLight('#ffe0b3', '#7a6a55', 0.95));
  scene.add(new THREE.AmbientLight('#505060', 0.4));

  // --- Camera state ---
  const camState = {
    yaw: 0, pitch: 0.32, dist: CAM_DIST_FOOT, orbitYaw: 0, orbitPitch: 0,
    shakeTime: 0, shakeMag: 0, shot: null, aim: false,
  };
  const camPos = new THREE.Vector3(0, 12, 20);
  const camTarget = new THREE.Vector3();
  const desired = new THREE.Vector3();

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  // --- Transient effects ---
  const smokeTex = smokeTexture();
  const tracers = [];
  for (let i = 0; i < 10; i += 1) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.07, 1),
      new THREE.MeshBasicMaterial({ color: '#ffe9a8', transparent: true, opacity: 0 }),
    );
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  const flashLight = new THREE.PointLight('#ffcf7a', 0, 14, 2);
  scene.add(flashLight);
  const flashMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 8, 6),
    new THREE.MeshBasicMaterial({ color: '#ffe9a8', transparent: true, opacity: 0 }),
  );
  flashMesh.visible = false;
  scene.add(flashMesh);
  let flashLife = 0;
  const explosions = [];
  for (let i = 0; i < 3; i += 1) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 12, 10),
      new THREE.MeshBasicMaterial({ color: '#ff7a1a', transparent: true, opacity: 0 }),
    );
    mesh.visible = false;
    scene.add(mesh);
    explosions.push({ mesh, life: 0 });
  }
  const smokePool = [];
  for (let i = 0; i < 42; i += 1) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, opacity: 0, depthWrite: false }));
    sprite.visible = false;
    scene.add(sprite);
    smokePool.push({ sprite, life: 0, max: 1, rise: 1 });
  }
  let smokeCursor = 0;
  const sparks = [];
  for (let i = 0; i < 8; i += 1) {
    const mesh = new THREE.Mesh(
      new THREE.TetrahedronGeometry(0.22),
      new THREE.MeshBasicMaterial({ color: '#ffe066' }),
    );
    mesh.visible = false;
    scene.add(mesh);
    sparks.push({ mesh, life: 0 });
  }

  function puff(pos, scale, dark) {
    const s = smokePool[smokeCursor];
    smokeCursor = (smokeCursor + 1) % smokePool.length;
    s.sprite.position.copy(pos);
    s.sprite.scale.setScalar(scale);
    s.sprite.material.color.set(dark ? '#3a3a3a' : '#9a9a9a');
    s.sprite.visible = true;
    s.life = 1;
    s.max = 1.1 + Math.random() * 0.5;
    s.rise = 1.5 + Math.random();
  }

  function updateEffects(dt) {
    for (const t of tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.mesh.material.opacity = Math.max(0, t.life / 0.09);
      if (t.life <= 0) t.mesh.visible = false;
    }
    if (flashLife > 0) {
      flashLife -= dt;
      const k = Math.max(0, flashLife / 0.07);
      flashMesh.material.opacity = k;
      flashLight.intensity = 14 * k;
      if (flashLife <= 0) { flashMesh.visible = false; flashLight.intensity = 0; }
    }
    for (const e of explosions) {
      if (e.life <= 0) continue;
      e.life -= dt;
      const k = Math.max(0, e.life / 0.55);
      e.mesh.scale.setScalar(1 + (1 - k) * 7);
      e.mesh.material.opacity = k * 0.85;
      if (e.life <= 0) e.mesh.visible = false;
    }
    for (const s of smokePool) {
      if (s.life <= 0) continue;
      s.life -= dt / s.max;
      s.sprite.position.y += s.rise * dt;
      s.sprite.scale.multiplyScalar(1 + dt * 0.9);
      s.sprite.material.opacity = Math.max(0, s.life) * 0.55;
      if (s.life <= 0) s.sprite.visible = false;
    }
    for (const s of sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.mesh.scale.setScalar(Math.max(0.01, s.life / 0.16));
      if (s.life <= 0) s.mesh.visible = false;
    }
  }

  // --- Mesh factories ---

  function buildPedMesh(shirt, pants, skin, armed) {
    const g = new THREE.Group();
    const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
    const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
    const skinMat = new THREE.MeshLambertMaterial({ color: skin });
    const darkMat = new THREE.MeshLambertMaterial({ color: '#222226' });
    const legGeo = new THREE.BoxGeometry(0.22, 0.82, 0.26);
    legGeo.translate(0, -0.41, 0);
    const armGeo = new THREE.BoxGeometry(0.16, 0.72, 0.2);
    armGeo.translate(0, -0.36, 0);
    const legL = new THREE.Group();
    legL.position.set(-0.15, 0.86, 0);
    legL.add(new THREE.Mesh(legGeo, pantsMat));
    const legR = new THREE.Group();
    legR.position.set(0.15, 0.86, 0);
    legR.add(new THREE.Mesh(legGeo, pantsMat));
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.78, 0.36), shirtMat);
    body.position.y = 1.26;
    const armL = new THREE.Group();
    armL.position.set(-0.4, 1.58, 0);
    armL.add(new THREE.Mesh(armGeo, shirtMat));
    const armR = new THREE.Group();
    armR.position.set(0.4, 1.58, 0);
    armR.add(new THREE.Mesh(armGeo, shirtMat));
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 10, 8), skinMat);
    head.position.y = 1.86;
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.235, 10, 6, 0, Math.PI * 2, 0, 1.1), darkMat);
    hair.position.y = 1.9;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.5), darkMat);
    gun.position.set(0.4, 1.15, 0.35);
    gun.visible = !!armed;
    g.add(legL, legR, body, armL, armR, head, hair, gun);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return { group: g, legL, legR, armL, armR, body, head, gun };
  }

  function buildCarMesh(color, police) {
    const g = new THREE.Group();
    const paint = new THREE.MeshLambertMaterial({ color: police ? '#f2f2f2' : color });
    const glass = new THREE.MeshLambertMaterial({ color: '#16202c' });
    const dark = new THREE.MeshLambertMaterial({ color: '#1c1c20' });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.72, 4.4), paint);
    body.position.y = 0.58;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.6, 2.1), police ? dark : glass);
    cabin.position.set(0, 1.18, -0.25);
    g.add(body, cabin);
    if (police) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.3, 2.6), dark);
      stripe.position.set(0, 0.62, 0.1);
      g.add(stripe);
    }
    const wheelGeo = new THREE.CylinderGeometry(0.37, 0.37, 0.3, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheels = [];
    for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
      const pivot = new THREE.Group();
      pivot.position.set(wx, 0.37, wz);
      const wheel = new THREE.Mesh(wheelGeo, dark);
      pivot.add(wheel);
      g.add(pivot);
      wheels.push({ pivot, wheel });
    }
    const headMat = new THREE.MeshBasicMaterial({ color: '#fff2cc' });
    for (const hx of [-0.62, 0.62]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.06), headMat);
      lamp.position.set(hx, 0.62, 2.21);
      g.add(lamp);
    }
    const tailMat = new THREE.MeshBasicMaterial({ color: '#ff2a1a' });
    for (const hx of [-0.62, 0.62]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.06), tailMat);
      lamp.position.set(hx, 0.62, -2.21);
      g.add(lamp);
    }
    let barL = null;
    let barR = null;
    if (police) {
      barL = new THREE.Mesh(
        new THREE.BoxGeometry(0.62, 0.2, 0.42),
        new THREE.MeshBasicMaterial({ color: '#ff1a1a' }),
      );
      barL.position.set(-0.34, 1.56, -0.25);
      barR = new THREE.Mesh(
        new THREE.BoxGeometry(0.62, 0.2, 0.42),
        new THREE.MeshBasicMaterial({ color: '#1a66ff' }),
      );
      barR.position.set(0.34, 1.56, -0.25);
      g.add(barL, barR);
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return { group: g, wheels, barL, barR, tailMat };
  }

  function buildHelicopterMesh() {
    const g = new THREE.Group();
    // Dark police livery: a white heli vanishes against the pale dusk sky.
    const navy = new THREE.MeshLambertMaterial({ color: '#1e3a5f' });
    const white = new THREE.MeshLambertMaterial({ color: '#eef2f4' });
    const blue = new THREE.MeshLambertMaterial({ color: '#1a4d8f' });
    const dark = new THREE.MeshLambertMaterial({ color: '#222226' });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.3, 3.8), navy);
    body.position.y = 0;
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.95, 10, 8), white);
    nose.scale.set(1, 0.72, 1);
    nose.position.set(0, -0.1, 1.9);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 3.4), navy);
    tail.position.set(0, 0.25, -3.4);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.7), white);
    fin.position.set(0, 0.7, -4.9);
    const rotor = new THREE.Group();
    rotor.position.y = 0.85;
    const bladeGeo = new THREE.BoxGeometry(8.4, 0.06, 0.45);
    rotor.add(new THREE.Mesh(bladeGeo, dark));
    const blade2 = new THREE.Mesh(bladeGeo, dark);
    blade2.rotation.y = Math.PI / 2;
    rotor.add(blade2);
    const tailRotor = new THREE.Group();
    tailRotor.position.set(0.25, 0.4, -5.0);
    const tblade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.6, 0.16), dark);
    tailRotor.add(tblade);
    const skidGeo = new THREE.BoxGeometry(0.12, 0.12, 3.0);
    for (const sx of [-0.85, 0.85]) {
      const skid = new THREE.Mesh(skidGeo, dark);
      skid.position.set(sx, -0.95, 0);
      g.add(skid);
    }
    // Spotlight cone: apex at the helicopter, base on the ground below.
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(4.4, 30, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: '#fff6cc', transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }),
    );
    cone.position.set(0, -15.2, 0.6);
    g.add(body, nose, tail, fin, rotor, tailRotor, cone);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return { group: g, rotor, tailRotor, cone };
  }

  function buildMarkerMesh(color) {
    const g = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15, 1.15, 30, 12, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.position.y = 15;
    const diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.95),
      new THREE.MeshBasicMaterial({ color }),
    );
    diamond.position.y = 4.2;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.9, 2.5, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.2;
    g.add(beam, diamond, ring);
    return { group: g, beam, diamond, ring };
  }

  // --- Camera ---

  function updateCamera(focus, heading, driving, aiming, dt) {
    if (camState.shot) {
      camera.position.copy(camState.shot.pos);
      camera.lookAt(camState.shot.look);
      return;
    }
    const targetDist = aiming ? CAM_DIST_AIM : driving ? CAM_DIST_CAR : CAM_DIST_FOOT;
    camState.dist += (targetDist - camState.dist) * Math.min(1, dt * 4);
    camState.aim = aiming;
    // Orbit decays back behind the player when the mouse is idle.
    camState.orbitYaw *= Math.max(0, 1 - dt * 0.9);
    camState.orbitPitch *= Math.max(0, 1 - dt * 0.9);
    const yaw = heading + Math.PI + camState.orbitYaw;
    const pitch = 0.34 + camState.orbitPitch;
    const dx = Math.sin(yaw) * Math.cos(pitch);
    const dz = Math.cos(yaw) * Math.cos(pitch);
    const dy = Math.sin(pitch);
    desired.set(
      focus.x + dx * camState.dist,
      focus.y + 2.1 + dy * camState.dist,
      focus.z + dz * camState.dist,
    );
    if (desired.y < 1.1) desired.y = 1.1;
    const k = 1 - Math.exp(-dt * 7);
    camPos.lerp(desired, k);
    camTarget.set(focus.x, focus.y + 2.0, focus.z);
    if (aiming) {
      // Over the shoulder: shift the target slightly right of the player.
      camTarget.x += Math.cos(heading) * 0.9;
      camTarget.z -= Math.sin(heading) * 0.9;
    }
    camera.position.copy(camPos);
    if (camState.shakeTime > 0) {
      camState.shakeTime -= dt;
      const m = camState.shakeMag * Math.max(0, camState.shakeTime / 0.4);
      camera.position.x += (Math.random() - 0.5) * m;
      camera.position.y += (Math.random() - 0.5) * m;
    }
    camera.lookAt(camTarget);
  }

  function updateSun(focus) {
    // Snap the shadow frustum to a 4-unit grid so shadows do not shimmer.
    const sx = Math.round(focus.x / 4) * 4;
    const sz = Math.round(focus.z / 4) * 4;
    sun.position.set(sx - 70, 95, sz - 55);
    sun.target.position.set(sx, 0, sz);
    sun.target.updateMatrixWorld();
  }

  return {
    scene,
    camera,
    renderer,
    resize,
    draw(game, dt) {
      updateEffects(dt);
      renderer.render(scene, camera);
    },
    updateCamera,
    updateSun,
    addOrbit(dyaw, dpitch) {
      camState.orbitYaw += dyaw;
      camState.orbitPitch = Math.max(-0.2, Math.min(0.55, camState.orbitPitch + dpitch));
    },
    zoom(factor) {
      camState.dist = Math.max(5, Math.min(18, camState.dist * factor));
    },
    shake(mag) {
      camState.shakeTime = 0.4;
      camState.shakeMag = Math.max(camState.shakeMag, mag);
    },
    setShotCamera(pos, look) {
      camState.shot = pos ? { pos: new THREE.Vector3(...pos), look: new THREE.Vector3(...look) } : null;
    },
    snapCamera(focus, heading, driving) {
      const yaw = heading + Math.PI;
      camPos.set(
        focus.x + Math.sin(yaw) * Math.cos(0.34) * (driving ? CAM_DIST_CAR : CAM_DIST_FOOT),
        focus.y + 2.1 + Math.sin(0.34) * (driving ? CAM_DIST_CAR : CAM_DIST_FOOT),
        focus.z + Math.cos(yaw) * Math.cos(0.34) * (driving ? CAM_DIST_CAR : CAM_DIST_FOOT),
      );
    },
    buildPedMesh,
    buildCarMesh,
    buildHelicopterMesh,
    buildMarkerMesh,
    spawnTracer(from, to) {
      const t = tracers.find((x) => x.life <= 0) ?? tracers[0];
      const dir = new THREE.Vector3().subVectors(to, from);
      const len = dir.length();
      t.mesh.position.copy(from).addScaledVector(dir, 0.5);
      t.mesh.scale.set(1, 1, Math.max(0.1, len));
      t.mesh.lookAt(to);
      t.mesh.material.opacity = 0.95;
      t.mesh.visible = true;
      t.life = 0.09;
    },
    muzzleFlash(pos) {
      flashMesh.position.copy(pos);
      flashMesh.visible = true;
      flashMesh.material.opacity = 1;
      flashLight.position.copy(pos);
      flashLight.intensity = 14;
      flashLife = 0.07;
    },
    spawnExplosion(pos) {
      const e = explosions.find((x) => x.life <= 0) ?? explosions[0];
      e.mesh.position.copy(pos);
      e.mesh.position.y += 1;
      e.mesh.visible = true;
      e.mesh.material.opacity = 0.85;
      e.life = 0.55;
      for (let i = 0; i < 6; i += 1) {
        puff(new THREE.Vector3(pos.x + (Math.random() - 0.5) * 2, pos.y + 1 + Math.random(), pos.z + (Math.random() - 0.5) * 2), 2.2, true);
      }
    },
    spawnSpark(pos) {
      const s = sparks.find((x) => x.life <= 0) ?? sparks[0];
      s.mesh.position.copy(pos);
      s.mesh.visible = true;
      s.mesh.scale.setScalar(1);
      s.life = 0.16;
    },
    puff,
  };
}
