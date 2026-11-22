// Pedestrians: they walk the sidewalks around the blocks, cross at corners,
// and run when shots are fired or a car nearly hits them. Knocked down, they
// stay down a few seconds, then get up and flee. They are scenery with a
// pulse — the city feels alive because they react.
import { PALETTE, PED } from './config.js';
import { collideCircle } from './city.js';

function randomSidewalkPoint(game) {
  const { city, random } = game;
  const b = random.pick(city.blocks);
  const edge = random.int(0, 3);
  const m = 0.8;
  if (edge === 0) return { x: random.range(b.x0 + m, b.x1 - m), z: b.z0 + m };
  if (edge === 1) return { x: random.range(b.x0 + m, b.x1 - m), z: b.z1 - m };
  if (edge === 2) return { x: b.x0 + m, z: random.range(b.z0 + m, b.z1 - m) };
  return { x: b.x1 - m, z: random.range(b.z0 + m, b.z1 - m) };
}

export function createPeds(game) {
  game.peds = { list: [] };
  const { random, renderer } = game;
  for (let i = 0; i < PED.count; i += 1) {
    const at = randomSidewalkPoint(game);
    const mesh = renderer.buildPedMesh(
      random.pick(PALETTE.pedShirt),
      random.pick(['#2c3e50', '#5d4037', '#37474f', '#4a6741']),
      random.pick(PALETTE.pedSkin),
      false,
    );
    mesh.group.position.set(at.x, 0, at.z);
    renderer.scene.add(mesh.group);
    const target = randomSidewalkPoint(game);
    game.peds.list.push({
      x: at.x, z: at.z,
      heading: Math.atan2(target.x - at.x, target.z - at.z),
      speed: PED.walkSpeed * random.range(0.8, 1.2),
      state: 'walk',
      target,
      mesh,
      walkPhase: random.range(0, 6),
      downTimer: 0,
      fleeTimer: 0,
    });
  }
}

/** Scare every ped near (x, z): gunfire, explosions, near-misses. */
export function scarePeds(game, x, z, radius) {
  for (const ped of game.peds.list) {
    if (ped.state === 'down') continue;
    const d = Math.hypot(ped.x - x, ped.z - z);
    if (d < radius) {
      ped.state = 'flee';
      ped.fleeTimer = 4 + Math.random() * 2;
      ped.heading = Math.atan2(ped.x - x, ped.z - z);
    }
  }
}

function animatePed(ped, dt, running) {
  const m = ped.mesh;
  const swing = Math.sin(ped.walkPhase) * (running ? 0.85 : 0.5);
  m.legL.rotation.x = swing;
  m.legR.rotation.x = -swing;
  m.armL.rotation.x = -swing * 0.7;
  m.armR.rotation.x = swing * 0.7;
  m.group.position.set(ped.x, 0, ped.z);
  m.group.rotation.y = ped.heading;
  if (ped.state === 'down') {
    m.group.rotation.x = Math.PI / 2;
    m.group.position.y = 0.25;
  } else {
    m.group.rotation.x = 0;
  }
}

export function updatePeds(game, dt) {
  const p = game.player;
  for (const ped of game.peds.list) {
    if (ped.state === 'down') {
      ped.downTimer -= dt;
      if (ped.downTimer <= 0) {
        ped.state = 'flee';
        ped.fleeTimer = 5;
      }
      animatePed(ped, dt, false);
      continue;
    }
    if (ped.state === 'flee') {
      ped.fleeTimer -= dt;
      ped.walkPhase += dt * 13;
      const speed = PED.fleeSpeed;
      ped.x += Math.sin(ped.heading) * speed * dt;
      ped.z += Math.cos(ped.heading) * speed * dt;
      [ped.x, ped.z] = collideCircle(game.city, ped.x, ped.z, PED.radius);
      if (ped.fleeTimer <= 0) {
        ped.state = 'walk';
        ped.target = randomSidewalkPoint(game);
      }
      animatePed(ped, dt, true);
      continue;
    }
    // Walk toward the target; pick a new one on arrival.
    const dx = ped.target.x - ped.x;
    const dz = ped.target.z - ped.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.2) {
      ped.target = randomSidewalkPoint(game);
    } else {
      const want = Math.atan2(dx, dz);
      let diff = want - ped.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      ped.heading += diff * Math.min(1, dt * 6);
      ped.x += Math.sin(ped.heading) * ped.speed * dt;
      ped.z += Math.cos(ped.heading) * ped.speed * dt;
      ped.walkPhase += dt * 8;
    }
    [ped.x, ped.z] = collideCircle(game.city, ped.x, ped.z, PED.radius);
    // A fast car bearing down scares them.
    if (p.car && p.car.speed > 12) {
      const dx2 = p.car.x - ped.x;
      const dz2 = p.car.z - ped.z;
      if (Math.hypot(dx2, dz2) < 9) {
        ped.state = 'flee';
        ped.fleeTimer = 3;
        ped.heading = Math.atan2(ped.x - p.car.x, ped.z - p.car.z);
      }
    }
    animatePed(ped, dt, false);
  }
}
