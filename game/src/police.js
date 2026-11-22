// The law: wanted stars 0-5, pursuit cars that chase and ram, roadblocks at
// 3 stars, a helicopter with a spotlight at 4. Stars come from crimes (steal,
// hit, shoot); they decay when no cop can see the player, and a pay-n-spray
// clears them for cash. A cop beside a slow on-foot player busts them.
import * as THREE from '../vendor/three.module.min.js';
import { WANTED } from './config.js';
import { collideCircle, nearestRoadPoint } from './city.js';
import { removeCar, spawnCar } from './vehicles.js';

export function createPolice(game) {
  game.police = {
    wanted: 0,
    unseenTimer: 0,
    bustTimer: 0,
    heli: null,
    heliSpot: null,
    heliStaged: false,
    roadblocks: [],
    blockTimer: 0,
    sprayToastAt: 0,
  };
  // Other systems call these through the game object.
  game.police.addWanted = addWanted;
  game.police.clearWanted = clearWanted;
  game.police.updatePoliceCar = updatePoliceCar;
}

export function addWanted(game, n) {
  const pol = game.police;
  if (n <= 0) return;
  const before = pol.wanted;
  pol.wanted = Math.min(WANTED.max, pol.wanted + n);
  pol.unseenTimer = 0;
  if (pol.wanted > before) {
    game.hud.toast(`Wanted level ${pol.wanted}★`);
  }
}

export function clearWanted(game) {
  const pol = game.police;
  pol.wanted = 0;
  pol.unseenTimer = 0;
  pol.bustTimer = 0;
  for (const car of [...game.vehicles.list]) {
    if (car.police) removeCar(game, car);
  }
  if (pol.heli) {
    game.renderer.scene.remove(pol.heli.mesh.group);
    pol.heli = null;
  }
  if (pol.heliSpot) {
    game.renderer.scene.remove(pol.heliSpot);
    pol.heliSpot = null;
  }
  pol.heliStaged = false;
  pol.roadblocks = [];
}

function spawnPursuit(game) {
  const p = game.player;
  const { city, random } = game;
  // On a road 55-85 units away, roughly ahead of the player's travel.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const angle = random.range(0, Math.PI * 2);
    const dist = random.range(55, 85);
    const at = nearestRoadPoint(city, p.x + Math.sin(angle) * dist, p.z + Math.cos(angle) * dist);
    if (!at) continue;
    if (Math.hypot(at.x - p.x, at.z - p.z) < 40) continue;
    const heading = Math.atan2(p.x - at.x, p.z - at.z);
    const car = spawnCar(game, at.x, at.z, heading, { kind: 'police', police: true });
    car.speed = 10;
    return car;
  }
  return null;
}

function spawnRoadblock(game) {
  const p = game.player;
  const { city } = game;
  const ahead = p.car
    ? { x: p.x + Math.sin(p.heading) * 42, z: p.z + Math.cos(p.heading) * 42 }
    : { x: p.x + 42, z: p.z };
  const at = nearestRoadPoint(city, ahead.x, ahead.z);
  if (!at) return;
  // Two cars parked across the road, nose to nose.
  const onXRoad = Math.abs(at.x - ahead.x) < Math.abs(at.z - ahead.z);
  const heading = onXRoad ? 0 : Math.PI / 2;
  const perp = onXRoad ? { x: 0, z: 1 } : { x: 1, z: 0 };
  for (const side of [-2.6, 2.6]) {
    const car = spawnCar(game, at.x + perp.x * side, at.z + perp.z * side, heading, { kind: 'police', police: true });
    car.blocking = true;
    game.police.roadblocks.push(car);
  }
}

function spotTexture() {
  // A soft pool of light: bright centre fading to nothing at the edge.
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255, 240, 170, 0.6)');
  grad.addColorStop(0.6, 'rgba(255, 240, 170, 0.28)');
  grad.addColorStop(1, 'rgba(255, 240, 170, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

function spawnHeli(game, opts = {}) {
  const mesh = game.renderer.buildHelicopterMesh();
  game.renderer.scene.add(mesh.group);
  const spot = new THREE.Mesh(
    new THREE.CircleGeometry(4.5, 20),
    new THREE.MeshBasicMaterial({ map: spotTexture(), transparent: true, depthWrite: false }),
  );
  spot.rotation.x = -Math.PI / 2;
  spot.position.y = 0.1;
  game.renderer.scene.add(spot);
  game.police.heli = {
    mesh,
    angle: opts.angle ?? 0,
    height: opts.height ?? 34,
    radius: opts.radius ?? 24,
  };
  game.police.heliSpot = spot;
}

/** Spawn the helicopter regardless of wanted level (screenshot staging). */
export function forceHeli(game, opts = {}) {
  if (game.police.heli) return game.police.heli;
  spawnHeli(game, opts);
  game.police.heliStaged = true;
  return game.police.heli;
}

/** Chase AI for one pursuit car: steer at the player, ram, never give up. */
export function updatePoliceCar(game, car, dt) {
  if (car.blocking) return; // roadblock cars hold their ground
  const p = game.player;
  const dx = p.x - car.x;
  const dz = p.z - car.z;
  const dist = Math.hypot(dx, dz);
  // Predict where the player will be, more at higher wanted levels.
  const lead = game.police.wanted >= 3 ? 0.9 : 0.4;
  const px = p.car ? p.x + p.car.vx * lead : p.x;
  const pz = p.car ? p.z + p.car.vz * lead : p.z;
  const want = Math.atan2(px - car.x, pz - car.z);
  let diff = want - car.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const turnRate = 2.6;
  car.heading += Math.max(-turnRate * dt, Math.min(turnRate * dt, diff));
  const targetSpeed = p.onFoot && dist < 6 ? 4 : game.police.wanted >= 3 ? 33 : 28;
  car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 1.6);
  car.vx = Math.sin(car.heading) * car.speed;
  car.vz = Math.cos(car.heading) * car.speed;
  car.x += car.vx * dt;
  car.z += car.vz * dt;
  const [nx, nz] = collideCircle(game.city, car.x, car.z, 1.6);
  if (nx !== car.x || nz !== car.z) {
    // Bounced off a building: back up and re-aim.
    car.x = nx;
    car.z = nz;
    car.heading += Math.PI * 0.35 * (Math.random() < 0.5 ? 1 : -1);
    car.speed *= 0.4;
  }
  car.steer = Math.max(-1, Math.min(1, -diff * 1.5));
}

export function updatePolice(game, dt) {
  const pol = game.police;
  const p = game.player;
  if (p.dead || p.busted) return;
  const wanted = pol.wanted;

  // Keep the pursuit at the wanted level's strength.
  const pursuit = game.vehicles.list.filter((c) => c.police && !c.blocking);
  const wantCount = WANTED.maxPursuit[wanted];
  if (pursuit.length < wantCount) {
    if (Math.random() < dt * 1.2) spawnPursuit(game);
  }
  for (const car of pursuit) {
    if (Math.hypot(car.x - p.x, car.z - p.z) > WANTED.despawnRange) removeCar(game, car);
  }

  // Roadblocks at 3+ stars, refreshed while the player keeps moving.
  if (wanted >= WANTED.roadblockAt) {
    pol.blockTimer -= dt;
    if (pol.blockTimer <= 0 && pol.roadblocks.length < 2) {
      spawnRoadblock(game);
      pol.blockTimer = 25;
    }
  } else if (pol.roadblocks.length > 0) {
    for (const car of [...pol.roadblocks]) removeCar(game, car);
    pol.roadblocks = [];
  }
  pol.roadblocks = pol.roadblocks.filter((c) => game.vehicles.list.includes(c));

  // Helicopter at 4+ stars. A staged heli (screenshots) is never auto-removed.
  if (wanted >= WANTED.heliAt && !pol.heli) spawnHeli(game);
  if (wanted < WANTED.heliAt && pol.heli && !pol.heliStaged) {
    game.renderer.scene.remove(pol.heli.mesh.group);
    game.renderer.scene.remove(pol.heliSpot);
    pol.heli = null;
    pol.heliSpot = null;
  }
  if (pol.heli) {
    const h = pol.heli;
    h.angle += dt * 0.35;
    const hx = p.x + Math.sin(h.angle) * h.radius;
    const hz = p.z + Math.cos(h.angle) * h.radius;
    h.mesh.group.position.set(hx, h.height, hz);
    h.mesh.group.rotation.y = Math.atan2(p.x - hx, p.z - hz);
    h.mesh.rotor.rotation.y += dt * 22;
    h.mesh.tailRotor.rotation.z += dt * 30;
    h.mesh.group.rotation.z = Math.sin(h.angle * 2) * 0.04;
    pol.heliSpot.position.set(p.x, 0.1, p.z);
  }

  // Decay: unseen for a while, lose a star.
  const nearest = pursuit.reduce((m, c) => Math.min(m, Math.hypot(c.x - p.x, c.z - p.z)), Infinity);
  if (wanted > 0 && nearest > 60 && !pol.heli) {
    pol.unseenTimer += dt;
    if (pol.unseenTimer >= WANTED.decaySeconds) {
      pol.wanted -= 1;
      pol.unseenTimer = 0;
      game.hud.toast(pol.wanted > 0 ? `Wanted level ${pol.wanted}★` : 'You lost them');
    }
  } else {
    pol.unseenTimer = 0;
  }

  // Bust: a cop beside a slow on-foot player.
  if (wanted > 0 && p.onFoot) {
    if (nearest < WANTED.bustRange) {
      pol.bustTimer += dt;
      if (pol.bustTimer >= WANTED.bustSeconds) {
        p.busted = true;
        game.audio.wasted();
      }
    } else {
      pol.bustTimer = 0;
    }
  } else {
    pol.bustTimer = 0;
  }

  // Pay-n-spray: drive in with wanted stars, drive out clean — $100, and
  // the car comes out repaired. The shop is on 5th Avenue, purple sign.
  const spray = game.city.spots.paynspray;
  if (p.car && wanted > 0 && Math.hypot(p.x - spray.x, p.z - spray.z) < 9) {
    if (p.money >= 100) {
      p.money -= 100;
      clearWanted(game);
      p.car.health = p.car.maxHealth;
      p.car.burning = false;
      game.hud.toast('Respray — $100 · Stars cleared · Car repaired');
    } else if (game.time - pol.sprayToastAt > 5) {
      pol.sprayToastAt = game.time;
      game.hud.toast('Pay-n-spray costs $100');
    }
  }

  game.audio.siren(pursuit.length > 0 && wanted > 0);
}
