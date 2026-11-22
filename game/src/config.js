// Every tuning number in one place. Solmar Bay is a fixed-size coastal city on a
// road grid; the simulation runs in fixed 1/60 s steps, so no rule below depends on
// the display rate or the screen size.

export const STEP = 1 / 60;
export const SAVE_KEY = 'solmar-bay.save.v1';

// --- City grid (world units; x east-west, z north-south, y up) ---
export const ROAD_PITCH = 44; // distance between neighbouring road centrelines
export const ROAD_WIDTH = 12; // drivable road surface
export const GRID_HALF = 4; // roads at -4..+4 pitches each way (9 roads, 8x8 blocks)
export const CITY_EDGE = GRID_HALF * ROAD_PITCH + ROAD_WIDTH / 2; // 182
export const BLOCK_SIZE = ROAD_PITCH - ROAD_WIDTH; // 32, building ground per block
export const SIDEWALK = 2; // sidewalk border inside each block
export const BOARDWALK_X = CITY_EDGE + 4; // 186, wooden strip along the beach
export const SAND_X = CITY_EDGE + 14; // 196, sand starts
export const WATER_X = CITY_EDGE + 44; // 226, water starts
export const WORLD_EDGE = 460; // ground plane half-size

// --- Player on foot ---
export const PLAYER = {
  walkSpeed: 7,
  sprintSpeed: 11,
  radius: 0.7,
  height: 1.8,
  jumpSpeed: 7.5,
  gravity: 22,
  maxHealth: 100,
  enterCarRange: 3.2,
  interactRange: 3.0,
};

// --- Cars (arcade physics) ---
export const CAR = {
  accel: 26,
  brake: 42,
  reverseAccel: 16,
  maxSpeed: 34, // ~122 km/h
  maxReverse: 10,
  drag: 0.55,
  rollingDrag: 1.6,
  steerRate: 2.4, // rad/s at full lock, scaled by speed
  grip: 8.5, // lateral velocity damping
  handbrakeGrip: 2.2,
  length: 4.4,
  width: 2.0,
  maxHealth: 100,
  trafficSpeed: 11,
  trafficMinGap: 7,
};

// --- Pedestrians ---
export const PED = {
  walkSpeed: 1.6,
  fleeSpeed: 5.2,
  radius: 0.6,
  count: 26,
  fleeRadius: 18, // gunfire / near-miss scares them within this range
};

// --- Wanted / police ---
export const WANTED = {
  max: 5,
  starsForSteal: 1,
  starsForHitPed: 1,
  starsForHitCop: 2,
  starsForShot: 1,
  starsForKillCop: 2,
  decaySeconds: 22, // unseen this long -> lose a star
  bustSeconds: 2.0, // cop beside a slow on-foot player this long -> busted
  bustRange: 4.5,
  roadblockAt: 3,
  heliAt: 4,
  chaseRange: 130,
  despawnRange: 170,
  maxPursuit: [0, 2, 3, 4, 5, 6],
};

// --- Combat ---
export const WEAPONS = {
  pistol: { name: 'Pistol', damage: 34, rate: 0.22, range: 60, spread: 0.012, auto: false },
  rifle: { name: 'Rifle', damage: 26, rate: 0.09, range: 90, spread: 0.02, auto: true },
};
export const GOON = { health: 60, damage: 9, rate: 0.9, range: 42, accuracy: 0.55 };

// --- Missions ---
export const MISSION_COUNT = 4;
export const RESPECT_RANKS = ['Nobody', 'Wheelman', 'Runner', 'Hitter', 'Solmar Legend'];

// --- Look ---
export const PALETTE = {
  skyTop: '#6ea8d8',
  skyHorizon: '#ffb37a',
  fog: '#f2b98a',
  sun: '#ffd9a0',
  ground: '#8f8a80',
  road: '#3a3a41',
  roadEdge: '#565660',
  sidewalk: '#b3aa9c',
  sand: '#e8d5a3',
  water: '#2e8bb5',
  boardwalk: '#a9805a',
  building: ['#f2e3c6', '#e8b48c', '#d98d6a', '#c9d6c5', '#a8c8d8', '#e5c9a8', '#d8a7a0', '#b8b8a8'],
  roof: '#6b6259',
  car: ['#c0392b', '#2980b9', '#f1c40f', '#ecf0f1', '#1a1a1e', '#16a085', '#e67e22', '#8e44ad', '#7f8c8d'],
  pedShirt: ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#ecf0f1'],
  pedSkin: ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'],
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
