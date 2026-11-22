// The minimap: a 196x196 canvas (cropped round by CSS), north up. The
// static city (roads, blocks, beach, water) is drawn once to an offscreen
// canvas; each frame it blits that and adds the player arrow, police dots
// and the mission marker.
import { BOARDWALK_X, CITY_EDGE, SAND_X, WATER_X } from './config.js';

const SIZE = 196;
const SPAN = 500; // world units across the map (-250..250)
const SCALE = SIZE / SPAN;

export function createMinimap(game) {
  const canvas = document.getElementById('minimap');
  const ctx = canvas.getContext('2d');
  const off = document.createElement('canvas');
  off.width = SIZE;
  off.height = SIZE;
  const octx = off.getContext('2d');
  const X = (wx) => (wx + SPAN / 2) * SCALE;
  const Y = (wz) => (wz + SPAN / 2) * SCALE;

  // Base: roads.
  octx.fillStyle = '#4a4a52';
  octx.fillRect(0, 0, SIZE, SIZE);
  // Blocks.
  octx.fillStyle = '#24242c';
  for (const b of game.city.blocks) {
    octx.fillRect(X(b.x0), Y(b.z0), (b.x1 - b.x0) * SCALE, (b.z1 - b.z0) * SCALE);
  }
  // Buildings: lighter marks on the blocks.
  octx.fillStyle = '#3d3d48';
  for (const b of game.city.buildings) {
    octx.fillRect(X(b.x0), Y(b.z0), Math.max(1.5, (b.x1 - b.x0) * SCALE), Math.max(1.5, (b.z1 - b.z0) * SCALE));
  }
  // Boardwalk, beach and water on the east.
  octx.fillStyle = '#a9805a';
  octx.fillRect(X(BOARDWALK_X - 3), 0, 6 * SCALE, SIZE);
  octx.fillStyle = '#c9a86a';
  octx.fillRect(X(SAND_X), 0, (WATER_X - SAND_X) * SCALE, SIZE);
  octx.fillStyle = '#1b6a9a';
  octx.fillRect(X(WATER_X), 0, SIZE - X(WATER_X), SIZE);
  // Pier.
  octx.fillStyle = '#6b4a2f';
  octx.fillRect(X(196), Y(-2.5), (226 - 196) * SCALE, 5 * SCALE);
  // Safehouse (green) + pay-n-spray (purple), painted on the static layer.
  const { safehouse, paynspray } = game.city.spots;
  octx.fillStyle = '#2ecc71';
  octx.fillRect(X(safehouse.x) - 2, Y(safehouse.z) - 2, 4, 4);
  octx.fillStyle = '#9b59b6';
  octx.fillRect(X(paynspray.x) - 2, Y(paynspray.z) - 2, 4, 4);
  // North arrow.
  octx.fillStyle = '#ffffff';
  octx.font = 'bold 9px system-ui, sans-serif';
  octx.fillText('N', SIZE / 2 - 3, 10);
  // City edge ring, faint.
  octx.strokeStyle = 'rgba(255,255,255,0.18)';
  octx.lineWidth = 1;
  octx.strokeRect(X(-CITY_EDGE), Y(-CITY_EDGE), CITY_EDGE * 2 * SCALE, CITY_EDGE * 2 * SCALE);

  game.minimap = {
    update(gameRef) {
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.drawImage(off, 0, 0);
      const p = gameRef.player;
      // Mission marker: diamond in the marker's own colour.
      const mm = gameRef.missions.marker;
      if (mm.group.visible) {
        const mx = X(mm.group.position.x);
        const my = Y(mm.group.position.z);
        ctx.fillStyle = `#${mm.diamond.material.color.getHexString()}`;
        ctx.beginPath();
        ctx.moveTo(mx, my - 5);
        ctx.lineTo(mx + 5, my);
        ctx.lineTo(mx, my + 5);
        ctx.lineTo(mx - 5, my);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      // Police: flashing blue dots.
      const flash = Math.floor(gameRef.time * 3) % 2 === 0;
      ctx.fillStyle = flash ? '#3498db' : '#1a5fa0';
      for (const car of gameRef.vehicles.list) {
        if (!car.police) continue;
        ctx.beginPath();
        ctx.arc(X(car.x), Y(car.z), 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      // Player: white arrow pointing along the heading. The arrow is drawn
      // pointing north (up); heading 0 faces south, so rotate by π - heading.
      const px = X(p.x);
      const py = Y(p.z);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(Math.PI - p.heading);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#111111';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(4, 5);
      ctx.lineTo(0, 2.5);
      ctx.lineTo(-4, 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    },
  };
}
