# gta6-01 — Solmar Bay

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/thepetax15/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/thepetax15/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Solmar Bay** — an open-world 3D crime game in a sun-soaked coastal city
at golden hour, built by an AI agent for make.fun's "Make GTA 6" bounty.
A small-time driver, four story missions, every car on the street yours
for the taking, and a five-star police force that does not give up.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no network: static files only, three.js vendored under
`game/vendor/`, all sound synthesized with WebAudio.

## What's in the game

- **Open city** — a seeded procedural coastal city (9×9 road grid, ~130
  buildings, sidewalks, lamps, palms, boardwalk, beach, pier), the same
  city every load, explorable on foot and by car.
- **Driving** — arcade car physics (accel, brake, steer, handbrake),
  damage, smoke and explosions. Steal any parked or traffic car.
- **Traffic & pedestrians** — cars follow the road graph, stop for
  obstacles, honk; peds walk the sidewalks and flee gunfire.
- **Wanted 1–5 stars** — police pursuit cars that chase and ram,
  roadblocks at 3 stars, a helicopter with a spotlight at 4. Stars decay
  when you break line of sight; the pay-n-spray clears them for $100.
- **4 story missions** — First Wheels, The Pickup, Warehouse Heat
  (shootout with rival goons), The Getaway (timed escape), with dialogue,
  objectives, rewards and respect ranks.
- **Combat** — pistol + rifle (unlocked by Mission 3), mouse aim,
  tracers, muzzle flash, health/armour pickups.
- **HUD + minimap** — wanted stars, money, respect, health/armour,
  speed, mission objective, live minimap with police blips.
- **Save & continue** — localStorage (money, missions, rifle, position),
  title screen with Continue / New Game, pause menu, Wasted / Busted.

## Controls

| Keys | Action |
| ---- | ------ |
| W A S D | Move / drive |
| Mouse | Camera orbit (right-drag) & aim |
| Click | Shoot |
| E | Enter / exit car, interact |
| Space | Jump / handbrake |
| Shift | Sprint |
| 1 / 2 | Pistol / rifle |
| P | Pause |
| M | Sound on/off |

## Layout

```
game/index.html        canvas + HUD DOM + module script
game/src/main.js       boot, game loop, screens, ?shot= staging
game/src/config.js     tuning constants
game/src/random.js     seeded RNG
game/src/city.js       procedural city (roads, blocks, buildings, beach)
game/src/render.js     three.js scene, lighting, chase camera, effects
game/src/player.js     on-foot movement, enter/exit car
game/src/vehicles.js   car physics, carjacking, traffic AI
game/src/pedestrians.js  ped AI (walk, flee)
game/src/police.js     wanted stars, pursuit, roadblocks, helicopter
game/src/combat.js     shooting, goons, pickups
game/src/missions.js   4 scripted story missions + dialogue
game/src/hud.js        HUD (stars, money, objective, speed, hints)
game/src/minimap.js    minimap canvas
game/src/audio.js      WebAudio synth (engine, siren, shots, music)
game/src/save.js       localStorage save/load
game/src/input.js      keyboard + mouse
game/src/shots.js      staged screenshot scenes (?shot=chase|city|mission|start)
game/vendor/three.module.min.js   vendored three.js 0.170.0 (MIT)
```

Screenshots are staged renders of the game's own code (`?shot=<name>&seed=1`).

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
