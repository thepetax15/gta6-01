// The HUD: wanted stars, money, respect rank, health/armour bars, weapon,
// speed, mission objective, toasts, banners, subtitles and the damage
// vignette. All DOM — cheap, crisp at 1280x720, and readable in a
// screenshot. The game logic never touches the DOM directly; it calls these
// methods. Element ids match game/index.html.
import { currentObjective } from './missions.js';
import { PLAYER, RESPECT_RANKS, WEAPONS } from './config.js';
import { nearestCar } from './vehicles.js';

export function createHud(game) {
  const $ = (id) => document.getElementById(id);
  const el = {
    hud: $('hud'),
    stars: $('stars'),
    money: $('money'),
    respect: $('respect'),
    healthBar: $('healthbar'),
    armorBar: $('armorbar'),
    weapon: $('weapon'),
    speed: $('speed'),
    missionName: $('missionname'),
    missionObjective: $('objectivetext'),
    missionTimer: $('missiontimer'),
    toast: $('toast'),
    banner: $('banner'),
    bannerTitle: $('banner').querySelector('h2'),
    bannerSub: $('banner').querySelector('p'),
    subtitle: $('subtitle'),
    vignette: $('vignette'),
    hint: $('hint'),
    crosshair: $('crosshair'),
    status: $('status'),
  };
  const state = { bannerTimer: 0, subtitleTimer: 0, toastTimer: 0, vignetteAlpha: 0 };
  game.hud = {
    el,
    show() {
      el.hud.classList.add('on');
    },
    hide() {
      el.hud.classList.remove('on');
    },
    toast(text) {
      el.toast.textContent = text;
      el.toast.style.display = 'block';
      state.toastTimer = 3;
    },
    banner(title, sub) {
      el.bannerTitle.textContent = title;
      el.bannerSub.textContent = sub || '';
      el.banner.style.display = 'block';
      el.status.textContent = `${title}. ${sub || ''}`;
      state.bannerTimer = 3.2;
    },
    subtitle(text, seconds) {
      el.subtitle.textContent = text;
      el.subtitle.style.display = 'block';
      state.subtitleTimer = seconds || 3.5;
    },
    flashVignette() {
      state.vignetteAlpha = 0.75;
    },
    update(gameRef, dt) {
      const p = gameRef.player;
      const pol = gameRef.police;
      // Wanted stars: filled gold stars are <b>, the rest outline.
      let stars = '';
      for (let i = 0; i < 5; i += 1) stars += i < pol.wanted ? '<b>★</b>' : '☆';
      el.stars.innerHTML = stars;
      el.money.textContent = `$${p.money.toLocaleString('en-US')}`;
      el.respect.textContent = RESPECT_RANKS[Math.min(p.missionsDone, 4)].toUpperCase();
      el.healthBar.style.width = `${p.health}%`;
      el.armorBar.style.width = `${p.armor}%`;
      el.weapon.textContent = WEAPONS[p.weapon].name.toUpperCase();
      if (p.car) {
        const kmh = Math.round(Math.abs(p.car.speed) * 3.6);
        el.speed.innerHTML = `${kmh} <small>km/h</small>`;
        el.speed.style.visibility = 'visible';
      } else {
        el.speed.style.visibility = 'hidden';
      }
      const obj = currentObjective(gameRef);
      el.missionName.textContent = obj.name;
      el.missionObjective.textContent = obj.text;
      if (obj.timer !== null) {
        el.missionTimer.textContent = `⏱ ${Math.floor(obj.timer / 60)}:${String(obj.timer % 60).padStart(2, '0')}`;
        el.missionTimer.style.display = 'block';
      } else {
        el.missionTimer.style.display = 'none';
      }
      // Context hint: the one action that matters right now.
      let hint = '';
      if (p.onFoot) {
        const car = nearestCar(gameRef, p.x, p.z, PLAYER.enterCarRange);
        hint = car
          ? 'E — Steal car'
          : 'WASD — Move · Mouse — Aim · Click — Shoot · Shift — Run · Space — Jump';
      } else {
        hint = 'W/S — Drive · A/D — Steer · Space — Handbrake · E — Exit car';
      }
      if (gameRef.missions.active && gameRef.missions.active === gameRef.missions.defs[2]
        && gameRef.missions.step === 2) {
        hint = 'E — Grab the goods';
      }
      el.hint.textContent = hint;
      // Crosshair follows the mouse while on foot.
      const showCross = p.onFoot && !p.dead && !p.busted && gameRef.screen === 'play';
      el.crosshair.style.display = showCross ? 'block' : 'none';
      if (showCross) {
        const m = gameRef.input.mouse;
        el.crosshair.style.left = `${((m.x + 1) / 2) * window.innerWidth}px`;
        el.crosshair.style.top = `${((1 - m.y) / 2) * window.innerHeight}px`;
      }
      // Timers.
      if (state.bannerTimer > 0) {
        state.bannerTimer -= dt;
        if (state.bannerTimer <= 0) el.banner.style.display = 'none';
      }
      if (state.subtitleTimer > 0) {
        state.subtitleTimer -= dt;
        if (state.subtitleTimer <= 0) el.subtitle.style.display = 'none';
      }
      if (state.toastTimer > 0) {
        state.toastTimer -= dt;
        if (state.toastTimer <= 0) el.toast.style.display = 'none';
      }
      if (state.vignetteAlpha > 0) {
        state.vignetteAlpha = Math.max(0, state.vignetteAlpha - dt * 1.6);
      }
      el.vignette.style.opacity = state.vignetteAlpha.toFixed(2);
    },
  };
}
