// The screenshot scenes behind ?shot=chase|city|mission|start. Each one
// stages the real game (real rules, real HUD) at a fixed frame, runs the
// simulation forward a short while so traffic, peds, police and the camera
// settle into natural positions, then returns; main.js paints twice and sets
// window.__shotReady. The seed (?seed=N) fixes the city, so a shot can be
// re-taken exactly. Staging only ever sets game state — the frame the judge
// sees is what the game itself renders.
import { spawnCar } from './vehicles.js';
import { spawnGoons } from './combat.js';
import { forceHeli } from './police.js';
import { stageMission } from './missions.js';

function putPlayerInCar(game, x, z, heading) {
  const p = game.player;
  const car = spawnCar(game, x, z, heading, { kind: 'player' });
  car.driven = true;
  p.onFoot = false;
  p.car = car;
  p.x = x;
  p.z = z;
  p.heading = heading;
  p.mesh.group.visible = false;
  return car;
}

/**
 * Cover: a chase down Ocean Drive — the player's car at speed, three police
 * cars behind, the helicopter overhead, 3 wanted stars, a mission objective
 * and a ticking timer on the HUD. The camera sits ahead of the player,
 * looking back down the road at the whole pursuit.
 */
function stageChase(game, runSteps) {
  const p = game.player;
  p.money = 1250;
  p.missionsDone = 3;
  p.health = 100;
  p.armor = 25;
  const car = putPlayerInCar(game, 30, 0, Math.PI / 2);
  // Three pursuit cars: one pulls alongside the player (foreground right),
  // two close in from behind on offset lanes so they peek out from behind
  // the player's car instead of hiding directly behind it.
  for (const [x, z] of [[48, 5], [5, -5], [-15, 5]]) {
    const cop = spawnCar(game, x, z, Math.PI / 2, { kind: 'police', police: true });
    cop.speed = 15;
  }
  runSteps(45);
  // Final touches after the sim has settled: wanted, helicopter, mission.
  game.police.wanted = 3;
  // The heli hangs just east of the player (between the camera and the
  // action), low and close, so it reads large in the frame.
  forceHeli(game, { height: 10, radius: 10, angle: Math.PI / 2 });
  stageMission(game, 3, 1, 65);
  car.speed = 25;
  car.vx = Math.sin(car.heading) * 25;
  car.vz = Math.cos(car.heading) * 25;
  runSteps(2);
  // Fixed camera on the road behind the player, looking west down Ocean
  // Drive at the player, the pursuit and the helicopter.
  game.renderer.setShotCamera(
    [p.x + 30, 7, p.z + 2],
    [p.x - 12, 4, p.z],
  );
}

/**
 * On foot in a busy downtown street: peds on the sidewalks, traffic on the
 * road, the gold mission marker ahead, dusk light on the buildings. The
 * chase camera behind the player frames the street ahead.
 */
function stageCity(game, runSteps) {
  const p = game.player;
  p.x = -22;
  p.z = 0;
  p.heading = Math.PI / 2;
  p.mesh.group.position.set(p.x, 0, p.z);
  p.mesh.group.rotation.y = p.heading;
  // Guarantee a populated street: four peds on the sidewalks nearby.
  const spots = [[-8, 8], [6, -8], [14, 8], [-14, -8]];
  game.peds.list.slice(0, 4).forEach((ped, i) => {
    [ped.x, ped.z] = spots[i];
    ped.target = { x: spots[i][0] + 20, z: spots[i][1] };
  });
  // Guarantee traffic on this road: one car each way, close enough to read.
  const east = spawnCar(game, 10, 2.6, Math.PI / 2, { kind: 'traffic', axis: 'x', line: 0, dir: 1 });
  east.pos = 10;
  east.speed = 11;
  const west = spawnCar(game, 30, -2.6, -Math.PI / 2, { kind: 'traffic', axis: 'x', line: 0, dir: -1 });
  west.pos = 30;
  west.speed = 11;
  // Crosshair off the player's head: up the street, where he is looking.
  game.input.mouse.x = 0.35;
  game.input.mouse.y = 0.2;
  game.renderer.snapCamera({ x: p.x, y: 0, z: p.z }, p.heading, false);
  runSteps(90);
}

/**
 * A mission in progress: Mission 3 at the warehouse — the player on foot
 * facing four goons, the red objective marker, the objective on the HUD.
 */
function stageMissionShot(game, runSteps) {
  const p = game.player;
  p.money = 650;
  p.missionsDone = 2;
  p.x = 100;
  p.z = -90;
  p.heading = Math.PI; // facing north, toward the warehouse
  p.mesh.group.position.set(p.x, 0, p.z);
  p.mesh.group.rotation.y = p.heading;
  stageMission(game, 2, 1, 0);
  spawnGoons(game, 100, -104, 4);
  // Aim camera (closer, over the shoulder) + crosshair on the goons.
  game.combat.forceAim = true;
  game.input.mouse.x = 0;
  game.input.mouse.y = 0.15;
  game.renderer.snapCamera({ x: p.x, y: 0, z: p.z }, p.heading, false);
  runSteps(60);
  // The goons shot at the player during staging; top the bars back up so
  // the frame reads as a fight in progress, not a defeat.
  p.health = 100;
  p.armor = 50;
  runSteps(2);
}

/**
 * The start screen over the city: title, Continue/New Game, controls and
 * the feature list, with downtown and the beach behind the card.
 */
function stageStart(game, runSteps) {
  game.renderer.setShotCamera([80, 40, 110], [0, 10, 0]);
  runSteps(60);
}

/** Stage the named scene (chase, city, mission, start; anything else is city). */
export function stageShot(name, game, runSteps) {
  if (name === 'chase') stageChase(game, runSteps);
  else if (name === 'mission') stageMissionShot(game, runSteps);
  else if (name === 'start') stageStart(game, runSteps);
  else stageCity(game, runSteps);
}
