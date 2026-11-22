// Combat: the player's pistol and rifle (mouse aim, click to shoot), mission
// goons who shoot back, and health/armour pickups. Shots are hitscan with a
// tracer and a muzzle flash; buildings block shots (2D ray vs footprint).
// Shooting is on foot only — no drive-bys in this build.
import * as THREE from '../vendor/three.module.min.js';
import { GOON, WEAPONS } from './config.js';
import { scarePeds } from './pedestrians.js';
import { damageCar } from './vehicles.js';
import { hurtPlayer, healPlayer } from './player.js';
import { ACTION_WEAPON1, ACTION_WEAPON2 } from './input.js';

const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const raycaster = new THREE.Raycaster();

export function createCombat(game) {
  game.combat = { aiming: false, forceAim: false, fireTimer: 0, wantedTimer: 0, goons: [], pickups: [] };
  // Health at the hospital + two corners; armour near the north avenue.
  const spots = [
    { x: 0, z: -88, kind: 'health' },
    { x: -132, z: 132, kind: 'health' },
    { x: 132, z: 88, kind: 'health' },
    { x: 0, z: 88, kind: 'armor' },
  ];
  for (const s of spots) {
    const color = s.kind === 'health' ? '#2ecc71' : '#3498db';
    const group = new THREE.Group();
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.9, 0.9),
      new THREE.MeshBasicMaterial({ color }),
    );
    const box2 = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.3, 0.3),
      new THREE.MeshBasicMaterial({ color: '#ffffff' }),
    );
    box2.position.y = 0.1;
    group.add(box, box2);
    group.position.set(s.x, 1.1, s.z);
    game.renderer.scene.add(group);
    game.combat.pickups.push({ ...s, mesh: group, taken: 0 });
  }
}

export function spawnGoons(game, x, z, count) {
  const { random, renderer } = game;
  const spawned = [];
  for (let i = 0; i < count; i += 1) {
    const gx = x + random.range(-9, 9);
    const gz = z + random.range(-9, 9);
    const mesh = renderer.buildPedMesh('#1a1a1e', '#2c2c30', random.pick(['#f1c27d', '#c68642', '#8d5524']), true);
    mesh.group.position.set(gx, 0, gz);
    renderer.scene.add(mesh.group);
    const goon = {
      x: gx, z: gz, heading: random.range(0, Math.PI * 2),
      health: GOON.health, mesh, state: 'combat', shootTimer: random.range(0.4, 1.2),
    };
    game.combat.goons.push(goon);
    spawned.push(goon);
  }
  return spawned;
}

export function clearGoons(game) {
  for (const g of game.combat.goons) game.renderer.scene.remove(g.mesh.group);
  game.combat.goons = [];
}

/** The ground point under the mouse cursor (for aiming). */
export function computeAimPoint(game) {
  const { input, renderer } = game;
  const ndc = new THREE.Vector2(input.mouse.x, input.mouse.y);
  raycaster.setFromCamera(ndc, renderer.camera);
  const point = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(groundPlane, point)) return { x: point.x, z: point.z };
  const p = game.player;
  return { x: p.x + Math.sin(p.heading) * 10, z: p.z + Math.cos(p.heading) * 10 };
}

// 2D ray vs building footprints: returns the distance to the first wall hit.
function rayBuildings(game, ox, oz, dx, dz, maxDist) {
  let best = maxDist;
  for (const b of game.city.buildings) {
    // Slab test on the XZ footprint.
    let tmin = 0;
    let tmax = best;
    for (const [o, d, lo, hi] of [[ox, dx, b.x0, b.x1], [oz, dz, b.z0, b.z1]]) {
      if (Math.abs(d) < 1e-9) {
        if (o < lo || o > hi) { tmin = Infinity; break; }
      } else {
        let t1 = (lo - o) / d;
        let t2 = (hi - o) / d;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) { tmin = Infinity; break; }
      }
    }
    if (tmin !== Infinity && tmin < best) best = tmin;
  }
  return best;
}

function playerShoot(game) {
  const p = game.player;
  const weapon = WEAPONS[p.weapon];
  const muzzle = {
    x: p.x + Math.sin(p.heading) * 0.9,
    y: 1.45,
    z: p.z + Math.cos(p.heading) * 0.9,
  };
  const dx = p.aimPoint.x - p.x;
  const dz = p.aimPoint.z - p.z;
  const dist = Math.hypot(dx, dz) || 1;
  const spread = (Math.random() - 0.5) * weapon.spread * 2;
  const dirX = dx / dist + -dz / dist * spread;
  const dirZ = dz / dist + dx / dist * spread;
  const range = Math.min(weapon.range, dist + 5);
  const wallDist = rayBuildings(game, p.x, p.z, dirX, dirZ, range);
  let hitDist = Math.min(range, wallDist);
  let hitPoint = { x: p.x + dirX * hitDist, y: 1.2, z: p.z + dirZ * hitDist };
  let hitWall = wallDist < range;

  // Goons first (they are the point), then peds, then cars.
  for (const g of game.combat.goons) {
    if (g.state === 'dead') continue;
    const gx = g.x - p.x;
    const gz = g.z - p.z;
    const along = gx * dirX + gz * dirZ;
    const side = Math.abs(gx * dirZ - gz * dirX);
    if (along > 0 && along < hitDist && side < 0.85) {
      hitDist = along;
      hitPoint = { x: g.x, y: 1.3, z: g.z };
      hitWall = false;
      g.health -= weapon.damage;
      game.renderer.spawnSpark(hitPoint);
      if (g.health <= 0) {
        g.state = 'dead';
        g.mesh.group.rotation.x = Math.PI / 2;
        g.mesh.group.position.y = 0.25;
        game.hud.toast('Goon down');
      }
    }
  }
  for (const ped of game.peds.list) {
    if (ped.state === 'down') continue;
    const px = ped.x - p.x;
    const pz = ped.z - p.z;
    const along = px * dirX + pz * dirZ;
    const side = Math.abs(px * dirZ - pz * dirX);
    if (along > 0 && along < hitDist && side < 0.8) {
      hitDist = along;
      hitPoint = { x: ped.x, y: 1.2, z: ped.z };
      hitWall = false;
      ped.state = 'down';
      ped.downTimer = 6;
      game.police.addWanted(game, 1);
    }
  }
  for (const car of game.vehicles.list) {
    const cx = car.x - p.x;
    const cz = car.z - p.z;
    const along = cx * dirX + cz * dirZ;
    const side = Math.abs(cx * dirZ - cz * dirX);
    if (along > 0 && along < hitDist && side < 1.9) {
      hitDist = along;
      hitPoint = { x: car.x, y: 1.0, z: car.z };
      hitWall = false;
      damageCar(game, car, weapon.damage * 0.5);
      game.renderer.spawnSpark(hitPoint);
    }
  }
  if (hitWall) game.renderer.spawnSpark(hitPoint);
  game.renderer.spawnTracer(muzzle, hitPoint);
  game.renderer.muzzleFlash(muzzle);
  game.audio.shot(p.weapon === 'rifle');
  scarePeds(game, p.x, p.z, 22);
  if (game.combat.wantedTimer <= 0) {
    game.police.addWanted(game, 1);
    game.combat.wantedTimer = 6;
  }
}

function updateGoons(game, dt) {
  const p = game.player;
  for (const g of game.combat.goons) {
    if (g.state === 'dead') continue;
    const dx = p.x - g.x;
    const dz = p.z - g.z;
    const dist = Math.hypot(dx, dz);
    g.heading = Math.atan2(dx, dz);
    g.mesh.group.rotation.y = g.heading;
    if (dist > GOON.range || p.dead) continue;
    g.shootTimer -= dt;
    if (g.shootTimer <= 0) {
      g.shootTimer = GOON.rate * (0.8 + Math.random() * 0.5);
      const muzzle = { x: g.x + Math.sin(g.heading) * 0.9, y: 1.45, z: g.z + Math.cos(g.heading) * 0.9 };
      const hit = Math.random() < GOON.accuracy;
      const target = hit
        ? { x: p.x, y: 1.2, z: p.z }
        : { x: p.x + (Math.random() - 0.5) * 6, y: 0.5, z: p.z + (Math.random() - 0.5) * 6 };
      game.renderer.spawnTracer(muzzle, target);
      game.renderer.spawnSpark(muzzle);
      game.audio.shot(false);
      if (hit && !p.dead) {
        if (hurtPlayer(game, GOON.damage)) game.missions.onPlayerDown(game);
      }
    }
  }
}

function updatePickups(game, dt) {
  const p = game.player;
  for (const pk of game.combat.pickups) {
    if (pk.taken > 0) {
      pk.taken -= dt;
      if (pk.taken <= 0) pk.mesh.visible = true;
      continue;
    }
    pk.mesh.rotation.y += dt * 1.5;
    pk.mesh.position.y = 1.1 + Math.sin(game.time * 2 + pk.x) * 0.12;
    if (p.onFoot && Math.hypot(p.x - pk.x, p.z - pk.z) < 1.6) {
      if (pk.kind === 'health') healPlayer(game, 50, 0);
      else healPlayer(game, 0, 50);
      pk.taken = 45;
      pk.mesh.visible = false;
      game.audio.pickup();
      game.hud.toast(pk.kind === 'health' ? '+50 health' : '+50 armor');
    }
  }
}

export function updateCombat(game, dt, actions) {
  const p = game.player;
  const c = game.combat;
  c.fireTimer -= dt;
  c.wantedTimer -= dt;
  if (actions & ACTION_WEAPON1) p.weapon = 'pistol';
  if (actions & ACTION_WEAPON2 && p.hasRifle) p.weapon = 'rifle';
  if (actions & ACTION_WEAPON2 && !p.hasRifle) game.hud.toast('Rifle unlocks after Mission 3');

  // Aim point follows the mouse while on foot.
  if (p.onFoot && !p.dead) {
    p.aimPoint = computeAimPoint(game);
  }
  c.aiming = c.forceAim || (p.onFoot && game.input.shooting());
  const weapon = WEAPONS[p.weapon];
  const canFire = p.onFoot && !p.dead && !p.busted && game.input.shooting() && c.fireTimer <= 0;
  if (canFire && (weapon.auto || game.input.shooting())) {
    playerShoot(game);
    c.fireTimer = weapon.rate;
  }
  updateGoons(game, dt);
  updatePickups(game, dt);
}
