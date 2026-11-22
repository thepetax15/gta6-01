// Cars: arcade physics for the car the player drives, road-following traffic,
// parked cars waiting to be stolen, damage, smoke and explosions. A car is a
// circle for collisions (radius 1.6) and a box mesh for the eye. Traffic
// drives the road graph: along a road, turning at intersections, stopping for
// whatever is ahead — including the player.
import { CAR, PALETTE, ROAD_WIDTH } from './config.js';
import { collideCircle, isOnRoad } from './city.js';

const LANE = 2.6; // offset from a road centreline for right-hand traffic
const TRAFFIC_COUNT = 14;
const PARKED_COUNT = 10;

function headingFor(axis, dir) {
  if (axis === 'x') return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  return dir > 0 ? 0 : Math.PI;
}

function laneOffset(axis, dir) {
  // Right-hand traffic: +x travel sits at +z, +z travel sits at -x.
  if (axis === 'x') return dir > 0 ? LANE : -LANE;
  return dir > 0 ? -LANE : LANE;
}

function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function spawnCar(game, x, z, heading, opts = {}) {
  const { renderer, random } = game;
  const police = !!opts.police;
  const color = police ? '#f2f2f2' : opts.color || random.pick(PALETTE.car);
  const mesh = renderer.buildCarMesh(color, police);
  mesh.group.position.set(x, 0, z);
  mesh.group.rotation.y = heading;
  renderer.scene.add(mesh.group);
  const car = {
    kind: opts.kind || 'traffic',
    x, z, heading,
    vx: 0, vz: 0, speed: 0, steer: 0,
    health: CAR.maxHealth, maxHealth: CAR.maxHealth,
    color, mesh, police,
    driven: false, burning: false, smokeTimer: 0, honkTimer: 0,
    axis: opts.axis || 'x', line: opts.line || 0, dir: opts.dir || 1,
    turn: null, // {fromX, fromZ, toX, toZ, fromH, toH, t}
    brake: false,
  };
  game.vehicles.list.push(car);
  return car;
}

export function removeCar(game, car) {
  game.renderer.scene.remove(car.mesh.group);
  const i = game.vehicles.list.indexOf(car);
  if (i !== -1) game.vehicles.list.splice(i, 1);
}

export function createVehicles(game) {
  game.vehicles = { list: [] };
  const { city, random } = game;
  // Traffic: random road, random position, random direction.
  for (let i = 0; i < TRAFFIC_COUNT; i += 1) {
    const axis = random.chance(0.5) ? 'x' : 'z';
    const lines = axis === 'x' ? city.roadsZ : city.roadsX;
    const line = random.pick(lines);
    const dir = random.sign();
    const pos = random.range(-150, 150);
    const off = laneOffset(axis, dir);
    const x = axis === 'x' ? pos : line + off;
    const z = axis === 'x' ? line + off : pos;
    if (Math.hypot(x - game.player.x, z - game.player.z) < 18) continue;
    const car = spawnCar(game, x, z, headingFor(axis, dir), { kind: 'traffic', axis, line, dir });
    car.pos = pos;
    car.speed = CAR.trafficSpeed * random.range(0.8, 1.1);
  }
  // Parked: along road edges, nose along the road.
  for (let i = 0; i < PARKED_COUNT; i += 1) {
    const axis = random.chance(0.5) ? 'x' : 'z';
    const lines = axis === 'x' ? city.roadsZ : city.roadsX;
    const line = random.pick(lines);
    const dir = random.sign();
    const pos = random.range(-150, 150);
    const side = random.sign() * (ROAD_WIDTH / 2 - 1.4);
    const x = axis === 'x' ? pos : line + side;
    const z = axis === 'x' ? line + side : pos;
    if (Math.hypot(x - game.player.x, z - game.player.z) < 12) continue;
    spawnCar(game, x, z, headingFor(axis, dir), { kind: 'parked' });
  }
}

/** Nearest stealable car (parked or traffic) within range of (x, z). */
export function nearestCar(game, x, z, range) {
  let best = null;
  let bestD = range;
  for (const car of game.vehicles.list) {
    if (car.police || car.driven) continue;
    const d = Math.hypot(car.x - x, car.z - z);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

function damageCar(game, car, amount) {
  car.health -= amount;
  if (car.health <= 40 && !car.burning) car.burning = true;
  if (car.health <= 0) {
    game.renderer.spawnExplosion({ x: car.x, y: 0, z: car.z });
    game.audio.explosion();
    game.renderer.shake(0.5);
    if (car.driven) {
      // Eject the player, hurt, on foot beside the wreck.
      const p = game.player;
      p.onFoot = true;
      p.car = null;
      p.x = car.x + 3;
      p.z = car.z;
      p.health = Math.max(5, p.health - 25);
      p.mesh.group.visible = true;
      game.hud.flashVignette();
    }
    removeCar(game, car);
    // Keep traffic topped up.
    if (car.kind === 'traffic') {
      const { city, random } = game;
      const axis = random.chance(0.5) ? 'x' : 'z';
      const lines = axis === 'x' ? city.roadsZ : city.roadsX;
      const line = random.pick(lines);
      const dir = random.sign();
      const pos = random.sign() * random.range(120, 160);
      const off = laneOffset(axis, dir);
      const x = axis === 'x' ? pos : line + off;
      const z = axis === 'x' ? line + off : pos;
      const next = spawnCar(game, x, z, headingFor(axis, dir), { kind: 'traffic', axis, line, dir });
      next.pos = pos;
      next.speed = CAR.trafficSpeed;
    }
  }
}

function updateDrivenCar(game, car, dt) {
  const input = game.input;
  const move = input.move();
  const forward = { x: Math.sin(car.heading), z: Math.cos(car.heading) };
  const right = { x: Math.cos(car.heading), z: -Math.sin(car.heading) };
  let vF = car.vx * forward.x + car.vz * forward.z;
  let vL = car.vx * right.x + car.vz * right.z;

  if (move.f > 0) vF += CAR.accel * dt;
  else if (move.f < 0) {
    if (vF > 0.5) vF -= CAR.brake * dt;
    else vF -= CAR.reverseAccel * dt;
  }
  vF -= vF * CAR.drag * dt;
  if (move.f === 0) vF -= Math.sign(vF) * Math.min(Math.abs(vF), CAR.rollingDrag * dt);
  vF = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, vF));

  const grip = input.handbrake() ? CAR.handbrakeGrip : CAR.grip;
  vL *= Math.exp(-grip * dt);
  if (input.handbrake()) vF -= Math.sign(vF) * Math.min(Math.abs(vF), 14 * dt);

  const speedFactor = Math.min(1, Math.abs(vF) / 8) * (1 - Math.min(1, Math.abs(vF) / CAR.maxSpeed) * 0.45);
  const steerTarget = -move.s;
  car.steer += (steerTarget - car.steer) * Math.min(1, dt * 8);
  car.heading += car.steer * CAR.steerRate * speedFactor * dt * Math.sign(vF || 1);
  car.brake = move.f < 0 && vF > 0.5;

  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  const rx = Math.cos(car.heading);
  const rz = -Math.sin(car.heading);
  car.vx = fx * vF + rx * vL;
  car.vz = fz * vF + rz * vL;
  car.speed = Math.hypot(car.vx, car.vz);

  car.x += car.vx * dt;
  car.z += car.vz * dt;
  const [nx, nz] = collideCircle(game.city, car.x, car.z, 1.6);
  if (nx !== car.x || nz !== car.z) {
    const impact = car.speed;
    car.x = nx;
    car.z = nz;
    car.vx *= 0.35;
    car.vz *= 0.35;
    car.speed *= 0.35;
    if (impact > 9) {
      damageCar(game, car, (impact - 9) * 2.2);
      game.renderer.shake(Math.min(0.5, impact * 0.02));
    }
  }
  // Off-road is slower (sand/grass), not a wall.
  if (!isOnRoad(game.city, car.x, car.z) && Math.abs(car.x) < 200) {
    car.vx *= Math.exp(-0.8 * dt);
    car.vz *= Math.exp(-0.8 * dt);
  }
}

function obstacleAhead(game, car, range) {
  // Anything on the car's path within `range`: another car, the player, a ped.
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  for (const other of game.vehicles.list) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dz = other.z - car.z;
    const along = dx * fx + dz * fz;
    const side = Math.abs(dx * fz - dz * fx);
    if (along > 0 && along < range && side < 2.4) return true;
  }
  const p = game.player;
  if (p.onFoot) {
    const dx = p.x - car.x;
    const dz = p.z - car.z;
    const along = dx * fx + dz * fz;
    const side = Math.abs(dx * fz - dz * fx);
    if (along > 0 && along < range && side < 2.2) return true;
  }
  for (const ped of game.peds.list) {
    if (ped.state === 'down') continue;
    const dx = ped.x - car.x;
    const dz = ped.z - car.z;
    const along = dx * fx + dz * fz;
    const side = Math.abs(dx * fz - dz * fx);
    if (along > 0 && along < range && side < 2.2) return true;
  }
  return false;
}

function updateTrafficCar(game, car, dt) {
  const { city, random } = game;
  if (car.turn) {
    const t = car.turn;
    t.t += dt / 0.8;
    const k = t.t >= 1 ? 1 : t.t * t.t * (3 - 2 * t.t);
    car.x = t.fromX + (t.toX - t.fromX) * k;
    car.z = t.fromZ + (t.toZ - t.fromZ) * k;
    car.heading = lerpAngle(t.fromH, t.toH, k);
    car.speed = CAR.trafficSpeed * 0.7;
    if (t.t >= 1) {
      car.axis = t.axis;
      car.line = t.line;
      car.dir = t.dir;
      car.pos = t.pos;
      car.turn = null;
    }
    return;
  }
  const blocked = obstacleAhead(game, car, CAR.trafficMinGap + 2);
  const target = blocked ? 0 : CAR.trafficSpeed;
  car.speed += (target - car.speed) * Math.min(1, dt * 2.5);
  if (blocked && car.honkTimer <= 0 && Math.hypot(game.player.x - car.x, game.player.z - car.z) < 25) {
    game.audio.honk();
    car.honkTimer = 4;
  }
  car.honkTimer -= dt;
  car.pos += car.dir * car.speed * dt;
  // Turn at an intersection, or turn around at the city edge.
  const lines = car.axis === 'x' ? city.roadsX : city.roadsZ;
  const edge = 176;
  if (Math.abs(car.pos) > edge) {
    car.dir *= -1;
    car.pos = Math.sign(car.pos) * edge;
    car.heading = headingFor(car.axis, car.dir);
  } else {
    for (const cross of lines) {
      if (Math.abs(car.pos - cross) < 1.2 && car.speed > 2) {
        if (random.chance(0.3)) {
          const newAxis = car.axis === 'x' ? 'z' : 'x';
          const newDir = random.sign();
          const newLine = cross;
          const off = laneOffset(newAxis, newDir);
          const toX = newAxis === 'x' ? car.line + newDir * 8 : newLine + off;
          const toZ = newAxis === 'x' ? newLine + off : car.line + newDir * 8;
          car.turn = {
            fromX: car.x, fromZ: car.z, toX, toZ,
            fromH: car.heading, toH: headingFor(newAxis, newDir),
            axis: newAxis, line: newLine, dir: newDir,
            pos: car.line + newDir * 8, t: 0,
          };
        }
        break;
      }
    }
  }
  const off = laneOffset(car.axis, car.dir);
  if (car.axis === 'x') { car.x = car.pos; car.z = car.line + off; }
  else { car.x = car.line + off; car.z = car.pos; }
  car.heading = headingFor(car.axis, car.dir);
  // Running over a ped: knock them down (traffic does it rarely — they stop).
  for (const ped of game.peds.list) {
    if (ped.state === 'down') continue;
    if (Math.hypot(ped.x - car.x, ped.z - car.z) < 2.0 && car.speed > 3) {
      // Traffic knocks a ped down; it is not the player's crime, so no wanted.
      ped.state = 'down';
      ped.downTimer = 3;
    }
  }
}

function updateCarMesh(game, car, dt) {
  const m = car.mesh;
  m.group.position.set(car.x, 0, car.z);
  m.group.rotation.y = car.heading;
  const spin = (car.speed / 0.37) * dt;
  for (let i = 0; i < m.wheels.length; i += 1) {
    m.wheels[i].wheel.rotation.x += spin;
    if (i < 2) m.wheels[i].pivot.rotation.y = -car.steer * 0.42;
  }
  if (car.police) {
    const phase = Math.floor(game.time * 3.5) % 2 === 0;
    m.barL.material.color.set(phase ? '#ff1a1a' : '#550000');
    m.barR.material.color.set(phase ? '#001155' : '#1a66ff');
  }
  if (car.burning) {
    car.smokeTimer -= dt;
    if (car.smokeTimer <= 0) {
      car.smokeTimer = 0.14;
      game.renderer.puff({ x: car.x + Math.sin(car.heading) * 1.6, y: 1.2, z: car.z + Math.cos(car.heading) * 1.6 }, 1.6, true);
    }
  }
}

export function updateVehicles(game, dt) {
  for (const car of [...game.vehicles.list]) {
    if (car.driven) updateDrivenCar(game, car, dt);
    else if (car.kind === 'traffic') updateTrafficCar(game, car, dt);
    else if (car.kind === 'police') game.police.updatePoliceCar(game, car, dt);
    // Car-vs-car: push apart, damage on hard hits.
    for (const other of game.vehicles.list) {
      if (other === car) continue;
      const dx = other.x - car.x;
      const dz = other.z - car.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.01 && d < 3.4) {
        const push = (3.4 - d) / 2;
        const nx = dx / d;
        const nz = dz / d;
        car.x -= nx * push;
        car.z -= nz * push;
        other.x += nx * push;
        other.z += nz * push;
        const rel = Math.abs(car.speed - other.speed);
        if (rel > 10) {
          damageCar(game, car, (rel - 10) * 1.2);
          damageCar(game, other, (rel - 10) * 1.2);
        }
        car.vx *= 0.6;
        car.vz *= 0.6;
      }
    }
    updateCarMesh(game, car, dt);
  }
}

export { damageCar };
