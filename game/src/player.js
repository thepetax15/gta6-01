// The player: Rico, a small-time driver. On foot he runs, jumps and aims
// toward the mouse; near a car, E steals it (or climbs out of the one he is
// driving). The mesh is a ped model in his own colours; it hides while he
// drives and his position follows the car.
import * as THREE from '../vendor/three.module.min.js';
import { PLAYER } from './config.js';
import { collideCircle } from './city.js';
import { nearestCar } from './vehicles.js';

export function createPlayer(game, x, z) {
  const mesh = game.renderer.buildPedMesh('#f2f2f2', '#2c3e50', '#e0ac69', true);
  mesh.group.position.set(x, 0, z);
  game.renderer.scene.add(mesh.group);
  return {
    x, z, y: 0, vy: 0,
    heading: 0,
    onFoot: true,
    car: null,
    health: PLAYER.maxHealth,
    armor: 0,
    money: 50,
    missionsDone: 0,
    weapon: 'pistol',
    hasRifle: false,
    mesh,
    walkPhase: 0,
    moving: false,
    aimPoint: { x: x + 5, z },
    dead: false,
    busted: false,
  };
}

/** Steal the nearest car (adds a wanted star) or climb out of the driven one. */
export function enterExitCar(game) {
  const p = game.player;
  if (!p.onFoot && p.car) {
    const car = p.car;
    car.driven = false;
    car.kind = 'parked';
    car.speed = 0;
    car.vx = 0;
    car.vz = 0;
    p.onFoot = true;
    p.car = null;
    // Step out on the driver's side.
    p.x = car.x - Math.cos(car.heading) * 2.2;
    p.z = car.z + Math.sin(car.heading) * 2.2;
    p.heading = car.heading;
    [p.x, p.z] = collideCircle(game.city, p.x, p.z, PLAYER.radius);
    p.mesh.group.visible = true;
    game.audio.engine(0, false);
    return 'exit';
  }
  if (p.onFoot) {
    const car = nearestCar(game, p.x, p.z, PLAYER.enterCarRange);
    if (car) {
      car.driven = true;
      car.kind = 'player';
      p.onFoot = false;
      p.car = car;
      p.mesh.group.visible = false;
      p.x = car.x;
      p.z = car.z;
      game.police.addWanted(game, 1);
      game.hud.toast('Car stolen — the law noticed (+1★)');
      return 'enter';
    }
  }
  return null;
}

function updateOnFoot(game, dt) {
  const p = game.player;
  const input = game.input;
  const move = input.move();
  // Movement is camera-relative: W walks away from the camera.
  const cam = game.renderer.camera;
  const dir = new THREE.Vector3();
  cam.getWorldDirection(dir);
  const len = Math.hypot(dir.x, dir.z) || 1;
  const camDir = { x: dir.x / len, z: dir.z / len };
  const right = { x: -camDir.z, z: camDir.x };
  let mx = camDir.x * move.f + right.x * move.s;
  let mz = camDir.z * move.f + right.z * move.s;
  const mLen = Math.hypot(mx, mz);
  p.moving = mLen > 0.1;
  const sprint = input.sprint();
  const speed = sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  if (p.moving) {
    mx /= mLen;
    mz /= mLen;
    // Face where he runs — unless he is firing (mouse), then face the aim.
    // (Aiming alone does not turn him: the aim point comes from the camera,
    // and turning toward it while the camera follows would spin him.)
    const firing = input.shooting();
    if (!firing) {
      const targetHeading = Math.atan2(mx, mz);
      let d = targetHeading - p.heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      p.heading += d * Math.min(1, dt * 12);
    }
    p.x += mx * speed * dt;
    p.z += mz * speed * dt;
    p.walkPhase += dt * (sprint ? 13 : 9);
  }
  // Jump.
  if (input.jump() && p.y <= 0) p.vy = PLAYER.jumpSpeed;
  if (p.y > 0 || p.vy !== 0) {
    p.vy -= PLAYER.gravity * dt;
    p.y += p.vy * dt;
    if (p.y <= 0) { p.y = 0; p.vy = 0; }
  }
  [p.x, p.z] = collideCircle(game.city, p.x, p.z, PLAYER.radius);
  // Firing turns him toward the mouse point.
  if (input.shooting()) {
    p.heading = Math.atan2(p.aimPoint.x - p.x, p.aimPoint.z - p.z);
  }
  // Walk cycle: legs and arms swing, body bobs.
  const m = p.mesh;
  const swing = p.moving ? Math.sin(p.walkPhase) * 0.55 : 0;
  m.legL.rotation.x = swing;
  m.legR.rotation.x = -swing;
  m.armL.rotation.x = -swing * 0.7;
  m.armR.rotation.x = swing * 0.7;
  m.body.position.y = 1.26 + (p.moving ? Math.abs(Math.sin(p.walkPhase)) * 0.05 : 0);
  m.group.position.set(p.x, p.y, p.z);
  m.group.rotation.y = p.heading;
  // The gun is out while on foot.
  m.gun.visible = true;
}

export function updatePlayer(game, dt) {
  const p = game.player;
  if (p.dead || p.busted) return;
  if (p.onFoot) {
    updateOnFoot(game, dt);
  } else if (p.car) {
    // Driving: the player rides the car; the mesh stays hidden.
    p.x = p.car.x;
    p.z = p.car.z;
    p.heading = p.car.heading;
    p.mesh.group.position.set(p.x, 0, p.z);
    p.mesh.group.rotation.y = p.heading;
  }
}

/** Hurt the player: armor absorbs first, then health. Returns true if wasted. */
export function hurtPlayer(game, amount) {
  const p = game.player;
  if (p.dead) return true;
  let rest = amount;
  if (p.armor > 0) {
    const absorbed = Math.min(p.armor, rest);
    p.armor -= absorbed;
    rest -= absorbed;
  }
  p.health -= rest;
  game.hud.flashVignette();
  if (p.health <= 0) {
    p.health = 0;
    p.dead = true;
    game.audio.wasted();
    return true;
  }
  return false;
}

/** Heal / armour pickups. */
export function healPlayer(game, health, armor) {
  const p = game.player;
  p.health = Math.min(PLAYER.maxHealth, p.health + health);
  p.armor = Math.min(100, p.armor + armor);
}
