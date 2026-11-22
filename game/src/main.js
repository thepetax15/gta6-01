// Boot, game loop, screen state, ?shot= staging and the ?selftest= smoke
// test. The game object holds every system; the loop runs the simulation in
// fixed 1/60 s steps and renders every animation frame. Screens: title
// (orbiting city behind the card), play, pause, wasted, busted.
import * as THREE from '../vendor/three.module.min.js';
import { RESPECT_RANKS, STEP } from './config.js';
import { createRandom } from './random.js';
import { buildCity, createCityMeshes } from './city.js';
import { createRenderer } from './render.js';
import { createAudio } from './audio.js';
import {
  ACTION_CONFIRM, ACTION_INTERACT, ACTION_MUTE, ACTION_PAUSE, createInput,
} from './input.js';
import { createPlayer, enterExitCar, updatePlayer } from './player.js';
import { createVehicles, updateVehicles } from './vehicles.js';
import { createPeds, updatePeds } from './pedestrians.js';
import { createPolice, updatePolice } from './police.js';
import { createCombat, updateCombat } from './combat.js';
import { createMissions, resetMissions, updateMissions } from './missions.js';
import { createHud } from './hud.js';
import { createMinimap } from './minimap.js';
import { clearSave, describeSave, loadSave, saveGame } from './save.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const selftest = params.get('selftest') === '1';
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 1;

// --- World ---------------------------------------------------------------

const canvas = document.getElementById('game');
const renderer = createRenderer(canvas);
const random = createRandom(seed);
const city = buildCity(random);
renderer.scene.add(createCityMeshes(THREE, city, random));

const game = {
  renderer, random, city,
  time: 0,
  screen: 'title',
  autosaveTimer: 0,
};
game.audio = createAudio();
game.input = createInput(canvas);

// In shot mode for the start screen, seed a save so Continue shows with a
// real save line (headless browsers start with empty storage).
let save = loadSave();
if (shot === 'start' && !save) {
  saveGame({ money: 650, missionsDone: 1, hasRifle: false, x: 6, z: 0, health: 100 });
  save = loadSave();
}

const start = save || {
  x: city.spots.playerStart.x, z: city.spots.playerStart.z,
  money: 50, missionsDone: 0, hasRifle: false, health: 100,
};
const player = createPlayer(game, start.x, start.z);
player.money = start.money ?? 50;
player.missionsDone = start.missionsDone ?? 0;
player.hasRifle = !!start.hasRifle;
player.health = start.health ?? 100;
game.player = player;

createVehicles(game);
createPeds(game);
createPolice(game);
createCombat(game);
createMissions(game);
createHud(game);
createMinimap(game);
game.hud.hide();
window.__game = game;

// --- Screens ---------------------------------------------------------------

const $ = (id) => document.getElementById(id);
const overlays = {
  title: $('title'), pause: $('pause'), wasted: $('wasted'), busted: $('busted'),
};
const saveInfo = $('saveinfo');
const btnContinue = $('btncontinue');

function showOverlay(name) {
  for (const [key, el] of Object.entries(overlays)) {
    el.classList.toggle('on', key === name);
  }
}

function refreshTitleSave() {
  const s = loadSave();
  if (s) {
    saveInfo.textContent = describeSave(s, RESPECT_RANKS[Math.min(s.missionsDone, 4)]);
    btnContinue.style.display = '';
  } else {
    saveInfo.textContent = '';
    btnContinue.style.display = 'none';
  }
}

function persistSave() {
  const p = game.player;
  saveGame({
    money: p.money, missionsDone: p.missionsDone, hasRifle: p.hasRifle,
    x: p.x, z: p.z, health: p.health,
  });
}

function startGame(newGame) {
  const p = game.player;
  if (newGame) {
    clearSave();
    if (p.car) {
      p.car.driven = false;
      p.car.kind = 'parked';
      p.car = null;
    }
    p.money = 50;
    p.missionsDone = 0;
    p.hasRifle = false;
    p.health = 100;
    p.armor = 0;
    p.x = city.spots.playerStart.x;
    p.z = city.spots.playerStart.z;
    p.y = 0;
    p.vy = 0;
    p.heading = 0;
    p.onFoot = true;
    p.dead = false;
    p.busted = false;
    p.mesh.group.visible = true;
    p.mesh.group.position.set(p.x, 0, p.z);
    game.police.clearWanted(game);
    resetMissions(game);
  }
  game.audio.unlock();
  game.audio.pad(true);
  renderer.setShotCamera(null, null);
  showOverlay(null);
  game.hud.show();
  game.screen = 'play';
  renderer.snapCamera({ x: p.x, y: 0, z: p.z }, p.heading, !p.onFoot);
}

function togglePause() {
  if (game.screen === 'play') {
    game.screen = 'pause';
    showOverlay('pause');
    persistSave();
    game.audio.pad(false);
  } else if (game.screen === 'pause') {
    game.screen = 'play';
    showOverlay(null);
    game.audio.pad(true);
  }
}

function respawnAt(x, z) {
  const p = game.player;
  if (p.car) {
    p.car.driven = false;
    p.car.kind = 'parked';
    p.car = null;
  }
  p.onFoot = true;
  p.dead = false;
  p.busted = false;
  p.health = 100;
  p.armor = 0;
  p.x = x;
  p.z = z;
  p.y = 0;
  p.vy = 0;
  p.mesh.group.visible = true;
  p.mesh.group.position.set(x, 0, z);
  game.police.clearWanted(game);
  game.missions.onPlayerDown(game); // fail the active mission, if any
  showOverlay(null);
  game.hud.show();
  game.screen = 'play';
  game.audio.pad(true);
  renderer.snapCamera({ x, y: 0, z }, p.heading, false);
  persistSave();
}

btnContinue.addEventListener('click', () => startGame(false));
$('btnnew').addEventListener('click', () => startGame(true));
$('btnresume').addEventListener('click', () => togglePause());
$('btnquit').addEventListener('click', () => {
  persistSave();
  game.screen = 'title';
  showOverlay('title');
  game.hud.hide();
  game.audio.pad(false);
  refreshTitleSave();
});
$('btnrespawn').addEventListener('click', () => {
  game.player.money = Math.max(0, game.player.money - 100);
  respawnAt(city.spots.hospital.x, city.spots.hospital.z);
});
$('btnrelease').addEventListener('click', () => {
  game.player.money = Math.max(0, game.player.money - 150);
  respawnAt(city.spots.safehouse.x, city.spots.safehouse.z);
});
// Audio needs a gesture; unlock on any key or click (idempotent).
window.addEventListener('keydown', () => game.audio.unlock());
window.addEventListener('pointerdown', () => game.audio.unlock());

refreshTitleSave();

// --- Simulation ------------------------------------------------------------

function step(dt) {
  game.time += dt;
  const actions = game.input.takeActions();
  const p = game.player;
  if (actions & ACTION_PAUSE) {
    if (game.screen === 'play' || game.screen === 'pause') togglePause();
  }
  if (actions & ACTION_MUTE) game.audio.setMuted(!game.audio.isMuted());
  if (game.screen === 'title' && (actions & ACTION_CONFIRM)) {
    startGame(!loadSave());
  }
  if (game.screen === 'play') {
    if (actions & ACTION_INTERACT) {
      // Mission interactions take the key first (the warehouse crate).
      const m = game.missions;
      const atCrate = m.active && m.active === m.defs[2] && m.step === 2
        && Math.hypot(p.x - 104, p.z + 104) < 4;
      if (!atCrate) enterExitCar(game);
    }
    updatePlayer(game, dt);
    updateVehicles(game, dt);
    updatePeds(game, dt);
    updatePolice(game, dt);
    updateCombat(game, dt, actions);
    updateMissions(game, dt, !!(actions & ACTION_INTERACT));
    if (p.dead && game.screen === 'play') {
      game.screen = 'wasted';
      showOverlay('wasted');
      game.audio.pad(false);
    } else if (p.busted && game.screen === 'play') {
      game.screen = 'busted';
      showOverlay('busted');
      game.audio.pad(false);
    }
    game.autosaveTimer += dt;
    if (game.autosaveTimer >= 30) {
      game.autosaveTimer = 0;
      persistSave();
    }
  } else if (game.screen === 'title') {
    // The city lives behind the title screen.
    updateVehicles(game, dt);
    updatePeds(game, dt);
  }
  // Camera orbit (right-drag) + zoom (wheel), in any screen.
  const orbit = game.input.takeOrbit();
  if (orbit.dx || orbit.dy) game.renderer.addOrbit(orbit.dx * 0.003, -orbit.dy * 0.002);
  const wheel = game.input.takeWheel();
  if (wheel) game.renderer.zoom(1 + wheel * 0.001);
}

let titleAngle = 0.6;

function present(dt, drawIt = true) {
  const p = game.player;
  if (game.screen === 'title' && !shot) {
    titleAngle += dt * 0.03;
    const r = 150;
    renderer.setShotCamera(
      [Math.sin(titleAngle) * r, 55, Math.cos(titleAngle) * r],
      [0, 0, 0],
    );
  } else {
    renderer.updateCamera({ x: p.x, y: p.y, z: p.z }, p.heading, !p.onFoot, game.combat.aiming, dt);
  }
  renderer.updateSun({ x: p.x, z: p.z });
  if (p.car && game.screen === 'play') {
    game.audio.engine(Math.min(1, Math.abs(p.car.speed) / 34), true);
  } else {
    game.audio.engine(0, false);
  }
  game.audio.update(dt);
  if (game.screen === 'play') {
    game.hud.update(game, dt);
    game.minimap.update(game);
  }
  if (drawIt) renderer.draw(game, dt);
}

/** Advance the simulation n fixed steps (staging: no draw until the end). */
function runSteps(n) {
  for (let i = 0; i < n; i += 1) {
    step(STEP);
    present(STEP, false);
  }
}

let last = performance.now();
let acc = 0;
window.__frames = 0;
function frame(now) {
  requestAnimationFrame(frame);
  window.__frames += 1;
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt;
  let n = 0;
  while (acc >= STEP && n < 5) {
    step(STEP);
    acc -= STEP;
    n += 1;
  }
  if (n === 5) acc = 0;
  present(dt);
}

// --- Modes -----------------------------------------------------------------

if (shot) {
  // Screenshot mode: stage the scene synchronously, paint twice, signal.
  game.screen = shot === 'start' ? 'title' : 'play';
  if (shot === 'start') {
    showOverlay('title');
    game.hud.hide();
  } else {
    showOverlay(null);
    game.hud.show();
  }
  stageShot(shot, game, runSteps);
  let painted = 0;
  (function paint() {
    renderer.draw(game, 0);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  })();
} else if (selftest) {
  // Playability smoke test: scripted input through the real listeners,
  // stepped synchronously (headless --dump-dom barely runs rAF, so the
  // test drives the fixed-step simulation itself). Results in the
  // document title + #status for --dump-dom to read.
  runSelftest();
} else {
  showOverlay('title');
  requestAnimationFrame(frame);
}

function runSelftest() {
  const result = {
    moved: false, enteredCar: false, drove: false, exitedCar: false,
    shot: false, errors: [],
  };
  window.__selftest = result;
  window.addEventListener('error', (e) => {
    result.errors.push(String((e && e.message) || 'error'));
  });
  const origError = console.error;
  console.error = (...args) => {
    result.errors.push(args.map(String).join(' '));
    origError(...args);
  };
  const origShot = game.audio.shot;
  game.audio.shot = (...args) => {
    result.shot = true;
    return origShot(...args);
  };
  startGame(false);
  const p = game.player;
  const startX = p.x;
  const startZ = p.z;
  const key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code }));
  // 1. Walk forward: hold W for 60 steps (1 s).
  key('KeyW', true);
  runSteps(60);
  key('KeyW', false);
  result.moved = Math.hypot(p.x - startX, p.z - startZ) > 2;
  // 2. Stage beside a parked car, press E, step a few times.
  const cars = game.vehicles.list.filter((c) => c.kind === 'parked');
  if (cars.length > 0) {
    const car = cars[0];
    p.x = car.x + 2;
    p.z = car.z;
    p.mesh.group.position.set(p.x, 0, p.z);
    key('KeyE', true);
    runSteps(3);
    key('KeyE', false);
    runSteps(3);
  }
  result.enteredCar = !p.onFoot && !!p.car;
  // 3. Drive forward for 60 steps, then exit with E.
  if (p.car) {
    const carX = p.car.x;
    const carZ = p.car.z;
    key('KeyW', true);
    runSteps(60);
    key('KeyW', false);
    result.drove = Math.hypot(p.car.x - carX, p.car.z - carZ) > 3;
    key('KeyE', true);
    runSteps(3);
    key('KeyE', false);
    runSteps(3);
  }
  result.exitedCar = p.onFoot && !p.car;
  // 4. Aim at the middle of the screen and shoot once (pointer events,
  // like a real mouse: the input layer listens for those).
  const mx = window.innerWidth * 0.65;
  const my = window.innerHeight * 0.4;
  canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: mx, clientY: my }));
  canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: mx, clientY: my }));
  runSteps(5);
  window.dispatchEvent(new PointerEvent('pointerup', { button: 0 }));
  runSteps(2);
  // 5. Report.
  const ok = result.moved && result.enteredCar && result.drove
    && result.exitedCar && result.shot && result.errors.length === 0;
  const text = `SELFTEST ${ok ? 'PASS' : 'FAIL'} moved=${result.moved} enteredCar=${result.enteredCar} drove=${result.drove} exitedCar=${result.exitedCar} shot=${result.shot} errors=${result.errors.length} simtime=${game.time.toFixed(2)} player=(${p.x.toFixed(1)},${p.z.toFixed(1)})${result.errors.length ? ` ${result.errors.join(' | ')}` : ''}`;
  document.title = text;
  document.getElementById('status').textContent = text;
  window.__selftestDone = true;
}
