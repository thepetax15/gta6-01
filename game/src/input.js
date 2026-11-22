// Keyboard and mouse input. Held keys give movement; one-shot presses are
// queued as bit flags and taken once by the loop, so a press between frames is
// never lost and never counted twice. The mouse aims (a ground point under the
// cursor), shoots with the left button, orbits the camera with the right.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_INTERACT = 4;
export const ACTION_WEAPON1 = 8;
export const ACTION_WEAPON2 = 16;
export const ACTION_MUTE = 32;

const MOVE_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight',
  'ShiftLeft', 'ShiftRight', 'Space',
]);

export function createInput(target) {
  const held = new Set();
  let actions = 0;
  let shooting = false;
  let orbiting = false;
  let lastX = 0;
  let lastY = 0;
  let orbitDX = 0;
  let orbitDY = 0;
  let wheel = 0;
  // Mouse position in normalized device coordinates (-1..1), for aiming.
  const mouse = { x: 0, y: 0, inside: false };

  function updateMouse(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    mouse.inside = true;
  }

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Enter' || event.code === 'Space') {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    }
    if (event.code === 'KeyP' || event.code === 'Escape') {
      if (!event.repeat) actions |= ACTION_PAUSE;
    }
    if (event.code === 'KeyE' && !event.repeat) actions |= ACTION_INTERACT;
    if (event.code === 'Digit1' && !event.repeat) actions |= ACTION_WEAPON1;
    if (event.code === 'Digit2' && !event.repeat) actions |= ACTION_WEAPON2;
    if (event.code === 'KeyM' && !event.repeat) actions |= ACTION_MUTE;
    if (MOVE_KEYS.has(event.code) || event.code === 'Space') {
      held.add(event.code);
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  window.addEventListener('blur', () => {
    held.clear();
    shooting = false;
    orbiting = false;
  });
  target.addEventListener('pointermove', (event) => {
    updateMouse(event);
    if (orbiting) {
      orbitDX += event.clientX - lastX;
      orbitDY += event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
    }
  });
  target.addEventListener('pointerdown', (event) => {
    updateMouse(event);
    if (event.button === 0) shooting = true;
    if (event.button === 2) {
      orbiting = true;
      lastX = event.clientX;
      lastY = event.clientY;
    }
  });
  window.addEventListener('pointerup', (event) => {
    if (event.button === 0) shooting = false;
    if (event.button === 2) orbiting = false;
  });
  target.addEventListener('contextmenu', (event) => event.preventDefault());
  target.addEventListener('wheel', (event) => {
    wheel += event.deltaY;
    event.preventDefault();
  }, { passive: false });

  const has = (...codes) => codes.some((c) => held.has(c));

  return {
    /** Forward/back/strafe as -1..1 (W/S and A/D), camera-relative. */
    move() {
      return {
        f: (has('KeyW', 'ArrowUp') ? 1 : 0) - (has('KeyS', 'ArrowDown') ? 1 : 0),
        s: (has('KeyD', 'ArrowRight') ? 1 : 0) - (has('KeyA', 'ArrowLeft') ? 1 : 0),
      };
    },
    sprint() { return has('ShiftLeft', 'ShiftRight'); },
    jump() { return held.has('Space'); },
    handbrake() { return held.has('Space'); },
    shooting() { return shooting; },
    mouse,
    /** Camera orbit deltas since the last call (pixels), then cleared. */
    takeOrbit() {
      const out = { dx: orbitDX, dy: orbitDY };
      orbitDX = 0;
      orbitDY = 0;
      return out;
    },
    /** Wheel delta since the last call, then cleared. */
    takeWheel() {
      const out = wheel;
      wheel = 0;
      return out;
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
