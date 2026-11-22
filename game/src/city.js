// Solmar Bay: the city itself. A seeded road grid (9 roads each way, 8x8 blocks),
// procedural low-poly buildings with canvas window facades, sidewalks, lamps,
// palms, a boardwalk, a beach and the sea. The data (roads, blocks, building
// footprints) is separate from the meshes, so traffic, peds and the minimap all
// read the same city. Everything is deterministic for a seed.
import {
  BLOCK_SIZE, BOARDWALK_X, CITY_EDGE, GRID_HALF, PALETTE, ROAD_PITCH, ROAD_WIDTH,
  SAND_X, SIDEWALK, WATER_X, WORLD_EDGE,
} from './config.js';

// Road centrelines, -176..176 step 44.
export function roadLines() {
  const lines = [];
  for (let i = -GRID_HALF; i <= GRID_HALF; i += 1) lines.push(i * ROAD_PITCH);
  return lines;
}

/** Build the city data for a seed: roads, blocks, buildings, named spots. */
export function buildCity(random) {
  const roadsX = roadLines();
  const roadsZ = roadLines();
  const blocks = [];
  const buildings = [];
  const colliders = [];

  for (let ix = 0; ix < roadsX.length - 1; ix += 1) {
    for (let iz = 0; iz < roadsZ.length - 1; iz += 1) {
      const x0 = roadsX[ix] + ROAD_WIDTH / 2;
      const x1 = roadsX[ix + 1] - ROAD_WIDTH / 2;
      const z0 = roadsZ[iz] + ROAD_WIDTH / 2;
      const z1 = roadsZ[iz + 1] - ROAD_WIDTH / 2;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const downtown = Math.abs(cx) <= ROAD_PITCH * 1.5 && Math.abs(cz) <= ROAD_PITCH * 1.5;
      blocks.push({ x0, z0, x1, z1, cx, cz, downtown });
      // The safehouse lot (-66, 66) and the warehouse lot (110, -110) stay
      // open: their own buildings stand there, and the missions need the
      // ground around them reachable.
      if ((cx === -66 && cz === 66) || (cx === 110 && cz === -110)) continue;
      // One tower downtown, otherwise 1-3 smaller buildings per block.
      const count = downtown ? (random.chance(0.6) ? 1 : 2) : random.int(1, 3);
      const spots = splitBlock(x0, z0, x1, z1, count, random);
      for (const s of spots) {
        const h = downtown ? random.range(16, 46) : random.range(6, 18);
        const color = random.pick(PALETTE.building);
        const b = { ...s, h, color, downtown, cx: (s.x0 + s.x1) / 2, cz: (s.z0 + s.z1) / 2 };
        buildings.push(b);
        colliders.push({ x0: s.x0 - 0.4, z0: s.z0 - 0.4, x1: s.x1 + 0.4, z1: s.z1 + 0.4 });
      }
    }
  }

  // Named spots (road coordinates the missions and the spawn use).
  const spots = {
    playerStart: { x: 6, z: 0 },
    safehouse: { x: -66, z: 66 },
    warehouse: { x: 104, z: -104 },
    paynspray: { x: 44, z: -44 },
    hospital: { x: 0, z: -88 },
    contact: { x: 88, z: 44 },
    pier: { x: 188, z: 0 },
  };

  // The safehouse and the warehouse are colliders too (they are not buildings).
  colliders.push({ x0: -69, z0: 63.5, x1: -63, z1: 68.5 }); // safehouse
  colliders.push({ x0: 108, z0: -116, x1: 120, z1: -104 }); // warehouse

  return { roadsX, roadsZ, blocks, buildings, colliders, spots, random };
}

/** Split a block into `count` building footprints with gaps between them. */
function splitBlock(x0, z0, x1, z1, count, random) {
  const inner = SIDEWALK + 1;
  const ax0 = x0 + inner;
  const az0 = z0 + inner;
  const ax1 = x1 - inner;
  const az1 = z1 - inner;
  if (count === 1) return [{ x0: ax0, z0: az0, x1: ax1, z1: az1 }];
  if (count === 2) {
    const horizontal = random.chance(0.5);
    if (horizontal) {
      const mid = (az0 + az1) / 2 + random.range(-3, 3);
      return [
        { x0: ax0, z0: az0, x1: ax1, z1: mid - 1.5 },
        { x0: ax0, z0: mid + 1.5, x1: ax1, z1: az1 },
      ];
    }
    const mid = (ax0 + ax1) / 2 + random.range(-3, 3);
    return [
      { x0: ax0, z0: az0, x1: mid - 1.5, z1: az1 },
      { x0: mid + 1.5, z0: az0, x1: ax1, z1: az1 },
    ];
  }
  const mx = (ax0 + ax1) / 2 + random.range(-2, 2);
  const mz = (az0 + az1) / 2 + random.range(-2, 2);
  const quads = [
    { x0: ax0, z0: az0, x1: mx - 1.5, z1: mz - 1.5 },
    { x0: mx + 1.5, z0: az0, x1: ax1, z1: mz - 1.5 },
    { x0: ax0, z0: mz + 1.5, x1: mx - 1.5, z1: az1 },
    { x0: mx + 1.5, z0: mz + 1.5, x1: ax1, z1: az1 },
  ];
  // Three of the four quadrants, so one corner stays an open lot.
  const skip = random.int(0, 3);
  return quads.filter((_, i) => i !== skip);
}

/** Push a circle (x, z, radius) out of every building it overlaps. Returns [x, z]. */
export function collideCircle(city, x, z, radius) {
  for (const c of city.colliders) {
    if (x > c.x0 - radius && x < c.x1 + radius && z > c.z0 - radius && z < c.z1 + radius) {
      const pushLeft = x - (c.x0 - radius);
      const pushRight = c.x1 + radius - x;
      const pushBack = z - (c.z0 - radius);
      const pushFront = c.z1 + radius - z;
      const min = Math.min(pushLeft, pushRight, pushBack, pushFront);
      if (min === pushLeft) x = c.x0 - radius;
      else if (min === pushRight) x = c.x1 + radius;
      else if (min === pushBack) z = c.z0 - radius;
      else z = c.z1 + radius;
    }
  }
  // The sea is a wall; the world edge is a wall.
  if (x > WATER_X - 1.5) x = WATER_X - 1.5;
  if (x < -WORLD_EDGE + 8) x = -WORLD_EDGE + 8;
  if (z > WORLD_EDGE - 8) z = WORLD_EDGE - 8;
  if (z < -WORLD_EDGE + 8) z = -WORLD_EDGE + 8;
  return [x, z];
}

/** True when (x, z) is on a road surface (not a sidewalk or a block). */
export function isOnRoad(city, x, z) {
  const half = ROAD_WIDTH / 2;
  for (const rx of city.roadsX) {
    if (Math.abs(x - rx) <= half && Math.abs(z) <= CITY_EDGE) return true;
  }
  for (const rz of city.roadsZ) {
    if (Math.abs(z - rz) <= half && Math.abs(x) <= CITY_EDGE) return true;
  }
  return false;
}

/** Nearest point on the road network to (x, z), for respawns and traffic. */
export function nearestRoadPoint(city, x, z) {
  let best = null;
  let bestD = Infinity;
  for (const rx of city.roadsX) {
    const d = Math.abs(x - rx);
    if (d < bestD) { bestD = d; best = { x: rx, z }; }
  }
  for (const rz of city.roadsZ) {
    const d = Math.abs(z - rz);
    if (d < bestD) { bestD = d; best = { x, z: rz }; }
  }
  return best;
}

// --- Meshes -----------------------------------------------------------------

function facadeTexture(color, random) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = color;
  g.fillRect(0, 0, 128, 256);
  // Subtle vertical shading + grime near the base.
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255,255,255,0.10)');
  grad.addColorStop(1, 'rgba(0,0,0,0.18)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 256);
  // Window grid: dark glass, some lit warm. 8x16 so windows stay small.
  const cols = 8;
  const rows = 16;
  for (let cx = 0; cx < cols; cx += 1) {
    for (let cy = 0; cy < rows; cy += 1) {
      const lit = random.chance(0.28);
      g.fillStyle = lit ? '#ffd27a' : '#26313d';
      g.fillRect(6 + cx * 15, 8 + cy * 15, 10, 9);
    }
  }
  return canvas;
}

function skyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#5a9bd0');
  grad.addColorStop(0.35, '#8fb8dd');
  grad.addColorStop(0.47, PALETTE.skyHorizon);
  grad.addColorStop(0.56, PALETTE.fog);
  grad.addColorStop(0.72, '#e8a06a');
  grad.addColorStop(1, '#d98a5a');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  return canvas;
}

/** All static meshes of the city, in one group. Needs document (canvas textures). */
export function createCityMeshes(THREE, city, random) {
  const group = new THREE.Group();
  const add = (mesh) => { group.add(mesh); return mesh; };

  // Ground: warm dry-grass base for everything outside the roads and blocks.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_EDGE * 2, WORLD_EDGE * 2),
    new THREE.MeshLambertMaterial({ color: PALETTE.ground }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  add(ground);

  // Sand + sea on the east edge.
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(WATER_X - SAND_X + 30, WORLD_EDGE * 2),
    new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set((SAND_X + WATER_X) / 2 + 12, 0.01, 0);
  sand.receiveShadow = true;
  add(sand);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_EDGE - WATER_X + 40, WORLD_EDGE * 2),
    new THREE.MeshLambertMaterial({ color: PALETTE.water, transparent: true, opacity: 0.94 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set((WATER_X + WORLD_EDGE) / 2 + 12, 0.06, 0);
  add(water);

  // Boardwalk strip.
  const boardwalk = new THREE.Mesh(
    new THREE.BoxGeometry(6, 0.3, CITY_EDGE * 2 + 8),
    new THREE.MeshLambertMaterial({ color: PALETTE.boardwalk }),
  );
  boardwalk.position.set(BOARDWALK_X, 0.15, 0);
  boardwalk.receiveShadow = true;
  add(boardwalk);

  // Road strips: x-roads at y 0.02, z-roads at 0.03 so crossings never z-fight.
  const roadMat = new THREE.MeshLambertMaterial({ color: PALETTE.road });
  const span = CITY_EDGE * 2 + ROAD_WIDTH;
  for (const rz of city.roadsZ) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(span, ROAD_WIDTH), roadMat);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(0, 0.02, rz);
    strip.receiveShadow = true;
    add(strip);
  }
  for (const rx of city.roadsX) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, span), roadMat);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(rx, 0.03, 0);
    strip.receiveShadow = true;
    add(strip);
  }

  // Sidewalk slabs, one per block.
  const walkMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
  for (const b of city.blocks) {
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(b.x1 - b.x0, 0.18, b.z1 - b.z0),
      walkMat,
    );
    slab.position.set(b.cx, 0.09, b.cz);
    slab.receiveShadow = true;
    add(slab);
  }

  // Centre dashes + crosswalks as instanced meshes (one draw call each).
  const dashGeo = new THREE.BoxGeometry(2.6, 0.02, 0.28);
  const dashMat = new THREE.MeshBasicMaterial({ color: '#e8e4d8' });
  const dashSpots = [];
  for (const rz of city.roadsZ) {
    for (let x = -CITY_EDGE; x <= CITY_EDGE; x += 6) {
      if (city.roadsX.some((rx) => Math.abs(x - rx) < 9)) continue;
      dashSpots.push({ x, z: rz, ry: 0 });
    }
  }
  for (const rx of city.roadsX) {
    for (let z = -CITY_EDGE; z <= CITY_EDGE; z += 6) {
      if (city.roadsZ.some((rz) => Math.abs(z - rz) < 9)) continue;
      dashSpots.push({ x: rx, z, ry: Math.PI / 2 });
    }
  }
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashSpots.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  dashSpots.forEach((s, i) => {
    q.setFromAxisAngle(up, s.ry);
    m4.compose(new THREE.Vector3(s.x, 0.05, s.z), q, new THREE.Vector3(1, 1, 1));
    dashes.setMatrixAt(i, m4);
  });
  add(dashes);

  const stripeGeo = new THREE.BoxGeometry(0.7, 0.02, 3.2);
  const stripeSpots = [];
  for (const rx of city.roadsX) {
    for (const rz of city.roadsZ) {
      for (const [dx, dz, ry] of [[-8, 0, 0], [8, 0, 0], [0, -8, Math.PI / 2], [0, 8, Math.PI / 2]]) {
        for (let k = -2; k <= 2; k += 1) {
          const off = k * 1.1;
          stripeSpots.push({
            x: rx + dx + (ry === 0 ? 0 : off),
            z: rz + dz + (ry === 0 ? off : 0),
            ry,
          });
        }
      }
    }
  }
  const stripes = new THREE.InstancedMesh(stripeGeo, dashMat, stripeSpots.length);
  stripeSpots.forEach((s, i) => {
    q.setFromAxisAngle(up, s.ry);
    m4.compose(new THREE.Vector3(s.x, 0.05, s.z), q, new THREE.Vector3(1, 1, 1));
    stripes.setMatrixAt(i, m4);
  });
  add(stripes);

  // Buildings: box + facade texture (repeat by size) + darker roof cap.
  const roofMat = new THREE.MeshLambertMaterial({ color: PALETTE.roof });
  const facadeCache = new Map();
  for (const b of city.buildings) {
    if (!facadeCache.has(b.color)) {
      const tex = new THREE.CanvasTexture(facadeTexture(b.color, random));
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      facadeCache.set(b.color, tex);
    }
    const w = b.x1 - b.x0;
    const d = b.z1 - b.z0;
    const tex = facadeCache.get(b.color).clone();
    tex.needsUpdate = true;
    tex.repeat.set(Math.max(1, Math.round(w / 10)), Math.max(1, Math.round(b.h / 14)));
    const faceMat = new THREE.MeshLambertMaterial({ map: tex });
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, b.h, d),
      [faceMat, faceMat, roofMat, roofMat, faceMat, faceMat],
    );
    mesh.position.set(b.cx, b.h / 2 + 0.18, b.cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    add(mesh);
    // Rooftop props on some buildings: AC unit or water tower.
    if (random.chance(0.4)) {
      const prop = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 1.4, 2.4),
        new THREE.MeshLambertMaterial({ color: '#8a8578' }),
      );
      prop.position.set(b.cx + random.range(-w / 4, w / 4), b.h + 0.9, b.cz + random.range(-d / 4, d / 4));
      prop.castShadow = true;
      add(prop);
    }
    if (b.downtown && b.h > 30 && random.chance(0.5)) {
      const tower = new THREE.Mesh(
        new THREE.CylinderGeometry(1.6, 1.6, 3.2, 8),
        new THREE.MeshLambertMaterial({ color: '#7a6a55' }),
      );
      tower.position.set(b.cx, b.h + 2.2, b.cz);
      tower.castShadow = true;
      add(tower);
    }
  }

  // Street lamps along the roads.
  const lampPoleGeo = new THREE.CylinderGeometry(0.09, 0.12, 6.5, 6);
  const lampPoleMat = new THREE.MeshLambertMaterial({ color: '#3d3d44' });
  const lampHeadGeo = new THREE.BoxGeometry(0.7, 0.28, 0.4);
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: '#ffd9a0' });
  const lampSpots = [];
  for (const rz of city.roadsZ) {
    for (let x = -CITY_EDGE + 10; x <= CITY_EDGE - 10; x += 22) {
      lampSpots.push({ x, z: rz + ROAD_WIDTH / 2 + 0.6 });
      lampSpots.push({ x: x + 11, z: rz - ROAD_WIDTH / 2 - 0.6 });
    }
  }
  const poles = new THREE.InstancedMesh(lampPoleGeo, lampPoleMat, lampSpots.length);
  const heads = new THREE.InstancedMesh(lampHeadGeo, lampHeadMat, lampSpots.length);
  lampSpots.forEach((s, i) => {
    m4.compose(new THREE.Vector3(s.x, 3.25, s.z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
    poles.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(s.x, 6.5, s.z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
    heads.setMatrixAt(i, m4);
  });
  add(poles);
  add(heads);

  // Palms: boardwalk row + beach scatter + a few on blocks.
  const trunkGeo = new THREE.CylinderGeometry(0.14, 0.22, 5.5, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: '#7a5a3a' });
  const frondGeo = new THREE.BoxGeometry(3.4, 0.06, 0.7);
  const frondMat = new THREE.MeshLambertMaterial({ color: '#2e7d4f' });
  const palmSpots = [];
  for (let z = -CITY_EDGE; z <= CITY_EDGE; z += 14) {
    palmSpots.push({ x: BOARDWALK_X - 4, z, lean: random.range(-0.12, 0.12) });
    if (random.chance(0.6)) palmSpots.push({ x: SAND_X + random.range(2, 16), z: z + 7, lean: random.range(-0.15, 0.15) });
  }
  for (const b of city.blocks) {
    if (random.chance(0.25)) palmSpots.push({ x: b.cx + random.range(-10, 10), z: b.cz + random.range(-10, 10), lean: 0 });
  }
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
  const fronds = new THREE.InstancedMesh(frondGeo, frondMat, palmSpots.length * 6);
  const euler = new THREE.Euler();
  palmSpots.forEach((s, i) => {
    euler.set(s.lean, 0, random.range(-0.1, 0.1));
    q.setFromEuler(euler);
    m4.compose(new THREE.Vector3(s.x, 2.75, s.z), q, new THREE.Vector3(1, 1, 1));
    trunks.setMatrixAt(i, m4);
    trunks.castShadow = true;
    for (let f = 0; f < 6; f += 1) {
      euler.set(0.7, (f / 6) * Math.PI * 2 + random.range(-0.2, 0.2), 0);
      q.setFromEuler(euler);
      const dir = new THREE.Vector3(Math.cos((f / 6) * Math.PI * 2), 0, Math.sin((f / 6) * Math.PI * 2));
      m4.compose(
        new THREE.Vector3(s.x + dir.x * 1.4, 5.6, s.z + dir.z * 1.4),
        q,
        new THREE.Vector3(1, 1, 1),
      );
      fronds.setMatrixAt(i * 6 + f, m4);
    }
  });
  add(trunks);
  add(fronds);

  // Fire hydrants at scattered block corners.
  const hydrantGeo = new THREE.CylinderGeometry(0.22, 0.26, 0.8, 8);
  const hydrantMat = new THREE.MeshLambertMaterial({ color: '#c0392b' });
  const hydrantSpots = [];
  for (const b of city.blocks) {
    if (random.chance(0.5)) {
      hydrantSpots.push({ x: b.x0 + 0.8, z: b.z0 + 0.8 });
    }
  }
  const hydrants = new THREE.InstancedMesh(hydrantGeo, hydrantMat, hydrantSpots.length);
  hydrantSpots.forEach((s, i) => {
    m4.compose(new THREE.Vector3(s.x, 0.4, s.z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
    hydrants.setMatrixAt(i, m4);
  });
  add(hydrants);

  // Safehouse: a small stucco house with a green door, on its reserved lot.
  const house = new THREE.Group();
  const houseBody = new THREE.Mesh(
    new THREE.BoxGeometry(6, 3.4, 5),
    new THREE.MeshLambertMaterial({ color: '#f2e3c6' }),
  );
  houseBody.position.y = 1.7;
  const houseRoof = new THREE.Mesh(
    new THREE.ConeGeometry(4.6, 2.2, 4),
    new THREE.MeshLambertMaterial({ color: '#b3552e' }),
  );
  houseRoof.position.y = 4.5;
  houseRoof.rotation.y = Math.PI / 4;
  const houseDoor = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 2.2, 0.15),
    new THREE.MeshLambertMaterial({ color: '#2ecc71' }),
  );
  houseDoor.position.set(0, 1.1, 2.55);
  house.add(houseBody, houseRoof, houseDoor);
  house.position.set(-66, 0.18, 66);
  house.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  add(house);

  // Warehouse: a big flat-roofed shed on the east side, where Mission 3 happens.
  const shed = new THREE.Mesh(
    new THREE.BoxGeometry(12, 7, 12),
    new THREE.MeshLambertMaterial({ color: '#9aa0a8' }),
  );
  shed.position.set(114, 3.68, -110);
  shed.castShadow = true;
  shed.receiveShadow = true;
  add(shed);
  const shedDoor = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 4.5, 6),
    new THREE.MeshLambertMaterial({ color: '#4a4a52' }),
  );
  shedDoor.position.set(107.9, 2.4, -110);
  add(shedDoor);

  // Pay-n-spray sign: a purple marker post at the shop corner.
  const signPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 4.2, 6),
    new THREE.MeshLambertMaterial({ color: '#3d3d44' }),
  );
  signPole.position.set(38.5, 2.1, -38.5);
  signPole.castShadow = true;
  const signBoard = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 1.4, 0.2),
    new THREE.MeshLambertMaterial({ color: '#9b59b6' }),
  );
  signBoard.position.set(38.5, 4.4, -38.5);
  add(signPole, signBoard);

  // Pier: a wooden deck reaching into the sea at the end of Ocean Drive.
  const pier = new THREE.Mesh(
    new THREE.BoxGeometry(30, 0.24, 5),
    new THREE.MeshLambertMaterial({ color: '#8a6a45' }),
  );
  pier.position.set(211, 0.18, 0);
  pier.receiveShadow = true;
  add(pier);
  for (let px = 198; px <= 224; px += 6.5) {
    for (const pz of [-2.2, 2.2]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.18, 1.2, 6),
        new THREE.MeshLambertMaterial({ color: '#6b4a2f' }),
      );
      post.position.set(px, 0.1, pz);
      add(post);
    }
  }

  // Sky dome: gradient canvas on a big sphere, fog off so it stays vivid.
  const skyTex = new THREE.CanvasTexture(skyTexture());
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(760, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }),
  );
  add(sky);

  return group;
}
