// The story: four scripted missions for Rico, a small-time driver rising
// through Mara's crew in Solmar Bay. Each mission is a list of steps; a step
// has an objective line, an optional marker, an entry hook and a completion
// check. Failing (wasted, busted, or out of time) restarts the mission from
// its start marker — nothing is lost but time.
import { RESPECT_RANKS } from './config.js';
import { clearGoons, spawnGoons } from './combat.js';
import { saveGame } from './save.js';

const MARK = {
  start: '#ffc93c',
  drive: '#2ecc71',
  pickup: '#3498db',
  fight: '#e74c3c',
  escape: '#f1c40f',
};

const MISSIONS = [
  {
    name: 'MISSION 1 — FIRST WHEELS',
    start: { x: 0, z: 0 },
    reward: 200,
    steps: [
      {
        objective: 'Steal a car — walk up to one and press E',
        marker: null,
        enter(g) {
          g.missions.say(g, [
            'MARA: Rico — you need wheels. Take any car on the street.',
            'MARA: Walk up to a car and press E. Try not to let the cops see you.',
          ]);
        },
        check: (g) => !g.player.onFoot,
      },
      {
        objective: 'Drive to the marker on Ocean Drive',
        marker: { x: 176, z: 0, color: MARK.drive },
        enter(g) {
          g.missions.say(g, ['MARA: Nice. Now bring it east, to the marker on Ocean Drive.']);
        },
        check: (g) => Math.hypot(g.player.x - 176, g.player.z) < 6,
      },
    ],
    complete(g) {
      g.missions.say(g, ["MARA: Clean work. You're in the crew now."]);
    },
  },
  {
    name: 'MISSION 2 — THE PICKUP',
    start: { x: -66, z: 66 },
    reward: 400,
    steps: [
      {
        objective: 'Drive to the contact on 5th Avenue',
        marker: { x: 88, z: 44, color: MARK.pickup },
        enter(g) {
          g.missions.say(g, ['MARA: Pick up the package from the contact on 5th Avenue.']);
        },
        check: (g) => Math.hypot(g.player.x - 88, g.player.z - 44) < 6,
      },
      {
        objective: 'Wait for the pickup…',
        marker: { x: 88, z: 44, color: MARK.pickup },
        enter(g) {
          g.missions.stepTimer = 5;
          g.missions.say(g, ['CONTACT: The package is in the trunk. Make it quick.']);
        },
        check(g, dt) {
          g.missions.stepTimer -= dt;
          return g.missions.stepTimer <= 0;
        },
      },
      {
        objective: 'Lose the cops — reach the safehouse',
        marker: { x: -66, z: 66, color: MARK.escape },
        enter(g) {
          g.police.addWanted(g, 2);
          g.missions.say(g, ['MARA: Package secured. Cops are onto you — get to the safehouse!']);
        },
        check: (g) => Math.hypot(g.player.x + 66, g.player.z - 66) < 7,
      },
    ],
    complete(g) {
      g.police.clearWanted(g);
      g.missions.say(g, ['MARA: That was close. The package is safe. Good driving.']);
    },
  },
  {
    name: 'MISSION 3 — WAREHOUSE HEAT',
    start: { x: 44, z: 44 },
    reward: 600,
    steps: [
      {
        objective: 'Go to the warehouse on the east side',
        marker: { x: 104, z: -104, color: MARK.drive },
        enter(g) {
          g.missions.say(g, ['MARA: The Vultures took our stash. Take it back — all of it.']);
        },
        check: (g) => Math.hypot(g.player.x - 104, g.player.z + 104) < 14,
      },
      {
        objective: 'Take out the Vultures',
        marker: { x: 104, z: -104, color: MARK.fight },
        enter(g) {
          // West of the shed, in the open lot — never inside the building.
          spawnGoons(g, 100, -104, 4);
          g.missions.say(g, ['VULTURE: The crew sent a driver? Take him down!']);
        },
        check: (g) => g.combat.goons.length > 0 && g.combat.goons.every((x) => x.state === 'dead'),
      },
      {
        objective: 'Grab the goods — press E at the crate',
        marker: { x: 104, z: -104, color: MARK.pickup },
        enter(g) {
          g.missions.say(g, ['MARA: The stash is in the crate. Grab it and go.']);
        },
        check: (g) => g.missions.interactPressed && Math.hypot(g.player.x - 104, g.player.z + 104) < 4,
      },
      {
        objective: 'Escape to the safehouse',
        marker: { x: -66, z: 66, color: MARK.escape },
        enter(g) {
          g.missions.say(g, ['MARA: Stash secured. Get out of there.']);
        },
        check: (g) => Math.hypot(g.player.x + 66, g.player.z - 66) < 7,
      },
    ],
    complete(g) {
      g.player.hasRifle = true;
      g.missions.say(g, ['MARA: The rifle is yours now. The Vultures will think twice.']);
    },
  },
  {
    name: 'MISSION 4 — THE GETAWAY',
    start: { x: 0, z: -44 },
    reward: 1000,
    steps: [
      {
        objective: 'Get in a car',
        marker: null,
        enter(g) {
          g.missions.say(g, ['MARA: One last job, Rico. Get in a car.']);
        },
        check: (g) => !g.player.onFoot,
      },
      {
        objective: 'Reach the pier — the heat is on!',
        marker: { x: 188, z: 0, color: MARK.escape },
        timer: 90,
        enter(g) {
          g.police.addWanted(g, 3);
          g.missions.say(g, ["MARA: Make the pier in 90 seconds. Don't stop for anything."]);
        },
        check: (g) => Math.hypot(g.player.x - 188, g.player.z) < 8,
      },
    ],
    complete(g) {
      g.police.clearWanted(g);
      g.missions.say(g, ['MARA: You made it. Solmar Bay is yours now, legend.']);
    },
  },
];

export function createMissions(game) {
  const marker = game.renderer.buildMarkerMesh(MARK.start);
  marker.group.visible = false;
  game.renderer.scene.add(marker.group);
  game.missions = {
    defs: MISSIONS,
    index: game.player.missionsDone,
    active: null,
    step: 0,
    stepTimer: 0,
    timer: 0,
    marker,
    queue: [], // {text, at}
    interactPressed: false,
    say(gameRef, lines) {
      const base = gameRef.time + 0.2;
      lines.forEach((text, i) => {
        gameRef.missions.queue.push({ text, at: base + i * 4.2 });
      });
    },
    onPlayerDown(gameRef) {
      failMission(gameRef);
    },
  };
  showStartMarker(game);
}

function showStartMarker(game) {
  const m = game.missions;
  const def = m.defs[m.index];
  if (!def) {
    m.marker.group.visible = false;
    return;
  }
  setMarker(game, def.start.x, def.start.z, MARK.start);
}

function setMarker(game, x, z, color) {
  const m = game.missions.marker;
  m.group.position.set(x, 0, z);
  m.beam.material.color.set(color);
  m.diamond.material.color.set(color);
  m.ring.material.color.set(color);
  m.group.visible = true;
}

function startMission(game) {
  const m = game.missions;
  const def = m.defs[m.index];
  if (!def) return;
  m.active = def;
  m.step = 0;
  m.timer = 0;
  game.hud.banner(def.name, 'Mission started');
  enterStep(game);
}

function enterStep(game) {
  const m = game.missions;
  const step = m.active.steps[m.step];
  m.stepTimer = 0;
  m.timer = step.timer || 0;
  if (step.marker) setMarker(game, step.marker.x, step.marker.z, step.marker.color);
  else m.marker.group.visible = false;
  step.enter(game);
}

function completeMission(game) {
  const m = game.missions;
  const def = m.active;
  const p = game.player;
  p.money += def.reward;
  p.missionsDone += 1;
  m.index = p.missionsDone;
  m.active = null;
  def.complete(game);
  game.audio.missionComplete();
  game.hud.banner('MISSION COMPLETE', `+$${def.reward} · ${RESPECT_RANKS[Math.min(p.missionsDone, 4)]}`);
  saveGame({
    money: p.money,
    missionsDone: p.missionsDone,
    hasRifle: p.hasRifle,
    x: p.x,
    z: p.z,
    health: p.health,
  });
  showStartMarker(game);
}

function failMission(game, reason) {
  const m = game.missions;
  if (!m.active) return;
  m.active = null;
  clearGoons(game);
  game.hud.banner('MISSION FAILED', reason || 'Try again — the marker is still there');
  showStartMarker(game);
}

/**
 * Put a mission mid-step without running its entry hooks (screenshot
 * staging): no dialogue, no wanted changes, just the state and the marker.
 */
export function stageMission(game, index, step, timer) {
  const m = game.missions;
  const def = m.defs[index];
  if (!def) return;
  m.index = index;
  m.active = def;
  m.step = step;
  m.timer = timer || 0;
  const s = def.steps[step];
  if (s && s.marker) setMarker(game, s.marker.x, s.marker.z, s.marker.color);
  else m.marker.group.visible = false;
}

/** Back to the start of the story (New Game): first mission, no active job. */
export function resetMissions(game) {
  const m = game.missions;
  m.index = game.player.missionsDone;
  m.active = null;
  m.step = 0;
  m.timer = 0;
  m.queue = [];
  clearGoons(game);
  showStartMarker(game);
}

/** What the HUD shows: mission name, objective text, seconds left (or null). */
export function currentObjective(game) {
  const m = game.missions;
  if (!m.active) {
    if (m.index >= m.defs.length) {
      return { name: 'FREE ROAM', text: 'Solmar Bay is yours — drive, explore, cause trouble', timer: null };
    }
    const def = m.defs[m.index];
    return { name: def.name, text: 'Reach the gold marker to start', timer: null };
  }
  const step = m.active.steps[m.step];
  let text = step.objective;
  if (m.active === m.defs[2] && m.step === 1) {
    const left = game.combat.goons.filter((x) => x.state !== 'dead').length;
    text = `Take out the Vultures — ${left} left`;
  }
  return { name: m.active.name, text, timer: m.timer > 0 ? Math.ceil(m.timer) : null };
}

export function updateMissions(game, dt, interactPressed) {
  const m = game.missions;
  const p = game.player;
  m.interactPressed = interactPressed;
  // Subtitle queue.
  while (m.queue.length > 0 && game.time >= m.queue[0].at) {
    game.hud.subtitle(m.queue.shift().text, 4);
  }
  // Marker animation.
  if (m.marker.group.visible) {
    m.marker.diamond.rotation.y += dt * 1.8;
    m.marker.diamond.position.y = 4.2 + Math.sin(game.time * 2) * 0.3;
    m.marker.ring.rotation.z += dt * 0.5;
    m.marker.beam.material.opacity = 0.26 + Math.sin(game.time * 3) * 0.08;
  }
  if (p.dead || p.busted) return;
  if (!m.active) {
    const def = m.defs[m.index];
    if (def && Math.hypot(p.x - def.start.x, p.z - def.start.z) < 4) {
      startMission(game);
    }
    return;
  }
  const step = m.active.steps[m.step];
  if (step.timer) {
    m.timer -= dt;
    if (m.timer <= 0) {
      failMission(game, 'Out of time');
      return;
    }
  }
  if (step.check(game, dt)) {
    m.step += 1;
    if (m.step >= m.active.steps.length) completeMission(game);
    else enterStep(game);
  }
}
