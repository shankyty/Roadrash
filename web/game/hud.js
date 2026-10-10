'use strict';
// The HUD, menus and screens.
// ------------------------------------------------------------------ HUD & screens
function text(str, x, y, size, color = '#fff', align = 'center', font = FONT, stroke = true) {
  ctx.font = `${size}px ${font}`; ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (stroke) { ctx.lineWidth = Math.max(3, size / 7); ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.lineJoin = 'round'; ctx.strokeText(str, x, y); }
  ctx.fillStyle = color; ctx.fillText(str, x, y);
}
function panel(x, y, w, h, a = 0.45) { ctx.fillStyle = `rgba(10,5,20,${a})`; rr(ctx, x, y, w, h, 10); ctx.fill(); }
function bar(x, y, w, h, pct, color, label) {
  panel(x - 6, y - 22, w + 12, h + 30, 0.45);
  text(label, x, y - 10, 13, '#fff', 'left');
  ctx.fillStyle = 'rgba(255,255,255,.15)'; rr(ctx, x, y, w, h, 4); ctx.fill();
  ctx.fillStyle = color; rr(ctx, x, y, Math.max(0, w * clamp(pct, 0, 1)), h, 4); ctx.fill();
}

// on touch devices the on-screen buttons sit in the bottom corners, so the HUD moves to the top
const touchUI = () => { const t = document.getElementById('touch'); return !!t && t.classList.contains('on'); };
function drawHUD() {
  const rank = currentRank(), total = rivals.length + 1, touch = touchUI();
  panel(12, 12, 190, 84);
  text(`${rank}`, 24, 50, 44, rank <= 3 ? '#ffeb3b' : '#fff', 'left');
  text(`/${total}`, 24 + ctx.measureText(`${rank}`).width + 4, 58, 18, '#ddd', 'left');
  text(fmtTime(raceTime), 190, 34, 18, '#fff', 'right');
  text(`TRACK ${level + 1}`, 190, 58, 12, '#ffcc80', 'right');
  text(`KO ${player.kos}`, 190, 80, 12, '#ff8a80', 'right');
  if (player.drift && player.driftPts >= 1) text(`DRIFT ${Math.round(player.driftPts)}`, W / 2, 90, 22, '#ffd21f');
  if (stats.chain > 1 && player.boostT > 0 && def.handling.slipstream > 0) text(`SLIPSTREAM \u00d7${stats.chain}`, W / 2, 114, 16, '#80deea');
  if (touch) text(`${Math.round(player.speed / MAX_SPEED * KMH)} KM/H`, 24, 84, 11, '#ffd21f', 'left');
  else {
    text('ESC MENU', 24, 84, 9, 'rgba(255,255,255,.55)', 'left');
    panel(W - 212, 12, 200, 60);
    text(fmtCash(cash), W - 24, 34, 20, '#a5d6a7', 'right');
    text(def.name, W - 24, 58, 10, '#ffcc80', 'right');
  }

  // progress strip
  const px = W / 2 - 170, pw = 340, py = 26;
  panel(px - 10, 12, pw + 20, 30, 0.4);
  ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(px, py - 1, pw, 3);
  const prog = a => clamp((a.dist - startZ + 400) / (finishDist - startZ + 400), 0, 1);
  for (const r of rivals) { ctx.fillStyle = r.color; ctx.beginPath(); ctx.arc(px + pw * prog(r), py, 5, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke(); }
  ctx.fillStyle = '#1e9e4a'; ctx.strokeStyle = '#ffd21f'; ctx.lineWidth = 2;
  const ppx = px + pw * prog(player); ctx.beginPath(); ctx.moveTo(ppx, py - 9); ctx.lineTo(ppx + 7, py + 6); ctx.lineTo(ppx - 7, py + 6); ctx.closePath(); ctx.fill(); ctx.stroke();
  text('🏁', px + pw + 2, py, 14, '#fff', 'left', 'sans-serif', false);

  // health
  if (touch) bar(24, 126, 166, 12, player.health / 100, player.health > 35 ? '#66bb6a' : '#ef5350', 'YOUR AUTO');
  else bar(24, H - 44, 200, 14, player.health / 100, player.health > 35 ? '#66bb6a' : '#ef5350', 'YOUR AUTO');
  // tip warning
  if (Math.abs(player.lean) > 0.7 && player.crash <= 0 && state === 'race') {
    const a = 0.6 + Math.sin(performance.now() / 70) * 0.4;
    ctx.globalAlpha = a; text(player.tip > 0 ? '⚠ TIPPING! SLOW DOWN' : '⚠ EASY ON THE TURN', W / 2, H - 290, 22, '#ff5252'); ctx.globalAlpha = 1;
  }
  // nearest rival
  let near = null, nd = 1600;
  for (const r of rivals) { const d = Math.abs(r.dist - player.dist); if (d < nd) { nd = d; near = r; } }
  if (near) bar(touch ? W - 206 : W - 250, touch ? 116 : H - 110, touch ? 180 : 200, 12, near.ko > 0 ? 0 : near.health / 100, near.ko > 0 ? '#9e9e9e' : '#ffa726', near.ko > 0 ? `${near.name} (KO)` : rivalLabel(near));

  // speedometer (touch devices show km/h in the top-left panel instead)
  if (touch) return;
  const cx = W - 80, cy = H - 26, R = 58;
  panel(cx - R - 12, cy - R - 14, R * 2 + 24, R + 36, 0.5);
  ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(cx, cy, R - 6, Math.PI, 0); ctx.stroke();
  const sp = player.speed / MAX_SPEED, dial = clamp(sp / def.handling.topSpeed, 0, 1); // full dial = this track's top speed
  ctx.strokeStyle = player.boostT > 0 ? '#80deea' : dial > 0.85 ? '#ff7043' : '#ffd21f'; ctx.beginPath(); ctx.arc(cx, cy, R - 6, Math.PI, Math.PI + Math.PI * dial); ctx.stroke();
  const na = Math.PI + Math.PI * dial; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(na) * (R - 14), cy + Math.sin(na) * (R - 14)); ctx.stroke();
  text(`${Math.round(sp * KMH)}`, cx, cy - 20, 22, '#fff');
  text('KM/H', cx, cy - 4, 9, '#ccc');
}

function drawBubbles() {
  for (const b of bubbles) {
    let x, y;
    if (b.who.isPlayer) { x = (playerScr ? playerScr.x : W / 2) + 60; y = playerScr ? playerScr.top - 6 : H - 270; }
    else { const s = b.who.scr; if (!s || s.frame !== frameNo || s.w < 30) continue; x = s.x; y = s.y - 6; }
    ctx.save(); ctx.globalAlpha = clamp(b.t * 3, 0, 1);
    ctx.font = `14px ${FONT}`;
    const tw = ctx.measureText(b.text).width, bw = tw + 22, bh = 30;
    const bx = clamp(x - bw / 2, 8, W - bw - 8), by = y - bh - 14;
    ctx.fillStyle = 'rgba(0,0,0,.35)'; rr(ctx, bx + 3, by + 3, bw, bh, 12); ctx.fill();
    ctx.fillStyle = b.hawker ? '#fff3c4' : '#fffdf4'; rr(ctx, bx, by, bw, bh, 12); ctx.fill();
    ctx.beginPath(); ctx.moveTo(clamp(x, bx + 14, bx + bw - 14) - 8, by + bh - 1); ctx.lineTo(clamp(x, bx + 14, bx + bw - 14) + 8, by + bh - 1); ctx.lineTo(x, by + bh + 12); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 2; rr(ctx, bx, by, bw, bh, 12); ctx.stroke();
    text(b.text, bx + bw / 2, by + bh / 2 + 1, 14, b.hawker ? '#e65100' : b.who.isPlayer ? '#1b5e20' : '#b71c1c', 'center', FONT, false);
    ctx.restore();
  }
}
function drawPopups() {
  for (const p of popups) {
    const k = 1 - p.t / 0.9, s = k < 0.15 ? lerp(0.4, 1.2, k / 0.15) : 1;
    ctx.save(); ctx.globalAlpha = clamp(p.t * 2, 0, 1); ctx.translate(p.x, p.y); ctx.rotate(-0.08); ctx.scale(s, s);
    text(p.text, 0, 0, p.size, p.color); ctx.restore();
  }
}
function drawMessages() {
  messages.forEach((m, i) => {
    const k = m.dur - m.t, s = k < 0.2 ? lerp(0.5, 1, k / 0.2) : 1;
    ctx.save(); ctx.globalAlpha = clamp(m.t * 2, 0, 1); ctx.translate(W / 2, 150 + i * 44); ctx.scale(s, s);
    text(m.text, 0, 0, 30, m.color); ctx.restore();
  });
}
function drawCountdown() {
  const c = Math.ceil(countdown), k = countdown - Math.floor(countdown);
  ctx.save(); ctx.translate(W / 2, H / 2 - 60); ctx.scale(1 + k * 0.6, 1 + k * 0.6); ctx.globalAlpha = clamp(k * 2, 0, 1);
  text(String(c), 0, 0, 90, c === 1 ? '#66bb6a' : c === 2 ? '#ffca28' : '#ef5350'); ctx.restore();
  text(def.name, W / 2, H / 2 + 20, 24, '#ffcc80');
  text(`Finish top 3 to qualify  ·  ${rivals.length} rival autos`, W / 2, H / 2 + 52, 14, '#fff', 'center', 'system-ui, sans-serif');
  text(LAYOUTS[layoutIdx].label, W / 2, H / 2 + 80, 14, '#ffd21f');
  const me = player.driver; // who you are in this city
  if (me && me.tag) text(`YOU ARE ${me.name} OF ${me.cityName}: ${me.tag}`, W / 2, H / 2 + 106, 13, '#ffcc80', 'center', 'system-ui, sans-serif');
}
function keycap(x, y, label, w = 40, hot = false) {
  ctx.fillStyle = 'rgba(0,0,0,.45)'; rr(ctx, x - w / 2, y - 16, w, 36, 7); ctx.fill();
  ctx.fillStyle = hot ? '#ffd21f' : '#f3efe6'; rr(ctx, x - w / 2, y - 18, w, 34, 7); ctx.fill();
  text(label, x, y - 1, label.length > 2 ? 11 : 15, '#1a1a1a', 'center', FONT, false);
}
// Two-hand controls diagram for the current layout.
function drawControls(top) {
  const L = LAYOUTS[layoutIdx], arrowsDrive = L.id === 'arrows';
  const cap = c => ({ ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'SPACE' }[c] || c.replace('Key', ''));
  const drive = cx => {
    text('DRIVE', cx, top + 18, 14, '#8bc34a');
    keycap(cx, top + 50, cap(L.up[0])); keycap(cx - 46, top + 90, cap(L.left[0])); keycap(cx, top + 90, cap(L.down[0])); keycap(cx + 46, top + 90, cap(L.right[0]));
    text('gas · brake · steer', cx, top + 120, 12, '#ddd', 'center', 'system-ui, sans-serif');
    text('SPACE handbrake: steer + SPACE to drift', cx, top + 135, 11, '#ffcc80', 'center', 'system-ui, sans-serif');
  };
  const fight = cx => {
    text('HIT', cx, top + 18, 14, '#ff8a65');
    keycap(cx - 34, top + 60, cap(L.hitL[0]), 44, true); keycap(cx + 34, top + 60, cap(L.hitR[0]), 44, true);
    text('◀ left', cx - 34, top + 88, 11, '#ddd', 'center', 'system-ui, sans-serif');
    text('right ▶', cx + 34, top + 88, 11, '#ddd', 'center', 'system-ui, sans-serif');
    text(`horn: ${cap(L.horn[0])} · ${cap(L.horn[1])}`, cx, top + 120, 12, '#ddd', 'center', 'system-ui, sans-serif');
  };
  panel(W / 2 - 300, top, 600, 176, 0.55);
  text('LEFT HAND', W / 2 - 150, top + 2 + 150, 10, '#aaa'); text('RIGHT HAND', W / 2 + 150, top + 2 + 150, 10, '#aaa');
  if (arrowsDrive) { fight(W / 2 - 150); drive(W / 2 + 150); } else { drive(W / 2 - 150); fight(W / 2 + 150); }
  ctx.strokeStyle = 'rgba(255,255,255,.15)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(W / 2, top + 14); ctx.lineTo(W / 2, top + 160); ctx.stroke();
  text(`TAB: switch hands  ·  C camera  ·  P pause  ·  V sound mixer  ·  M mute  ·  N music`, W / 2, top + 168, 11, '#ffcc80', 'center', 'system-ui, sans-serif');
}
const TITLE_DRIVER_ROW = { x: W / 2 - 250, y: 439, w: 500, h: 40 }; // tap or click: left half previous driver, right half next
function drawTitle() {
  ctx.fillStyle = 'rgba(10,5,20,.45)'; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.translate(W / 2, 110); ctx.rotate(-0.04);
  text('ROAD RASH', 0, 0, 84, '#ffd21f'); ctx.restore();
  ctx.save(); ctx.translate(W / 2, 178); ctx.rotate(-0.04);
  text('RICKSHAW RUMBLE', 0, 0, 38, '#4caf50'); ctx.restore();
  drawControls(222);
  const a = 0.5 + Math.sin(performance.now() / 250) * 0.5;
  ctx.globalAlpha = 0.4 + a * 0.6; text('PRESS ENTER TO RACE', W / 2, 496, 24, '#fff'); ctx.globalAlpha = 1;
  // track selector
  const canL = level > 0, canR = level < unlocked;
  panel(W / 2 - 250, 398, 500, TITLE_DRIVER_ROW.y + TITLE_DRIVER_ROW.h - 398, 0.55);
  text('\u25c0', W / 2 - 232, 420, 16, canL ? '#ffd21f' : 'rgba(255,255,255,.2)');
  text('\u25b6', W / 2 + 232, 420, 16, canR ? '#ffd21f' : 'rgba(255,255,255,.2)');
  text(def.name, W / 2, 412, 16, '#fff');
  const b = titleBest, wins = b.wins ? `  \u00b7  ${b.wins} WIN${b.wins > 1 ? 'S' : ''}` : '';
  text(`${def.styleLabel}${b.bestTime === null ? '' : `  \u00b7  BEST ${fmtTime(b.bestTime)}`}${wins}`, W / 2, 429, 11, '#ffcc80');
  // driver selector: who you race as (their auto, weapon and voice)
  const me = player.driver, row = TITLE_DRIVER_ROW;
  ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(row.x + 14, row.y, row.w - 28, 1);
  text('\u25b2', W / 2 - 232, row.y + 12, 11, '#ffd21f'); text('\u25bc', W / 2 - 232, row.y + 27, 11, '#ffd21f');
  if (me) {
    ctx.drawImage(player.img, W / 2 - 214, row.y + 4, 34, 33);
    text(`YOU: ${me.name}  \u00b7  ${me.cityName}  \u00b7  ${weaponName(me.weapon)}`, W / 2 + 14, row.y + 13, 14, '#fff');
    text(me.tag, W / 2 + 14, row.y + 29, 11, '#ffcc80', 'center', 'system-ui, sans-serif');
  }
  text(`Race ${level + 1} of ${ORDER.length}  \u00b7  \u2190 \u2192 track  \u00b7  \u2191 \u2193 driver  \u00b7  Wallet ${fmtCash(cash)}${round ? `  \u00b7  Tour ${round + 1}` : ''}`, W / 2, 518, 12, '#ffcc80', 'center', 'system-ui, sans-serif');
  text('Engine: kalhan \u00b7 Chennai street: Nielsvdb \u00b7 Dog bark: AleXZavesa \u00b7 Horns: Anton (CC BY 4.0, freesound.org) \u00b7 Voices: AI4Bharat Indic Parler-TTS, Meta MMS-TTS (CC BY-NC 4.0)', W - 8, 534, 8, 'rgba(255,255,255,.45)', 'right', 'system-ui, sans-serif', false);
}
function drawChampion() {
  ctx.fillStyle = 'rgba(10,5,20,.55)'; ctx.fillRect(0, 0, W, H);
  text('🏆', W / 2, 140, 80, '#fff', 'center', 'sans-serif', false);
  text('AUTO KING OF INDIA!', W / 2, 240, 48, '#ffd21f');
  text(`You won all ${ORDER.length} races across India. Wallet: ${fmtCash(cash)}`, W / 2, 300, 18, '#fff', 'center', 'system-ui, sans-serif');
  text('The next tour is tougher. Press ENTER', W / 2, 360, 20, '#ffcc80');
  text('ESC — MAIN MENU', W / 2, 392, 13, '#ddd');
}
function drawResults() {
  ctx.fillStyle = 'rgba(10,5,20,.6)'; ctx.fillRect(0, 0, W, H);
  const r = results;
  text(r.qualified ? 'QUALIFIED!' : 'NOT QUALIFIED', W / 2, 60, 44, r.qualified ? '#66bb6a' : '#ef5350');
  panel(W / 2 - 250, 96, 500, 30 + r.order.length * 28, 0.6);
  r.order.forEach((a, i) => {
    const y = 118 + i * 28, me = a === player;
    if (me) { ctx.fillStyle = 'rgba(255,210,31,.2)'; ctx.fillRect(W / 2 - 244, y - 13, 488, 26); }
    text(ordinal(i + 1), W / 2 - 220, y, 16, i < 3 ? '#ffd21f' : '#fff', 'left');
    ctx.fillStyle = me ? '#1e9e4a' : a.color; ctx.beginPath(); ctx.arc(W / 2 - 150, y, 7, 0, Math.PI * 2); ctx.fill();
    text(me ? 'YOU' : rivalLabel(a), W / 2 - 132, y, 16, me ? '#ffd21f' : '#fff', 'left');
    text(a.finished ? fmtTime(a.time) : '—', W / 2 + 220, y, 16, '#ddd', 'right');
  });
  const by = 140 + r.order.length * 28;
  const s = r.stats, star = on => (on ? ' \u2605' : '');
  const time = s.time === null ? '\u2014' : fmtTime(s.time) + (r.beaten.time ? ' \u2605 NEW BEST' : `  (best ${fmtTime(r.best.bestTime)})`);
  text(`Time ${time}   \u00b7   Drift ${Math.round(s.driftScore)}${star(r.beaten.drift)}   \u00b7   Close passes ${s.passes}${star(r.beaten.passes)}   \u00b7   Jumps ${s.jumps}`, W / 2, by + 4, 14, '#ffcc80', 'center', 'system-ui, sans-serif');
  text(`Prize ${fmtCash(r.prize)}  +  KO ${fmtCash(r.bonus)}  +  Drift ${fmtCash(r.skill.drift)}  +  Lane surf ${fmtCash(r.skill.passes)}  +  Jumps ${fmtCash(r.skill.jumps)}  =  ${fmtCash(r.prize + r.bonus + r.skill.drift + r.skill.passes + r.skill.jumps)}`, W / 2, by + 28, 14, '#a5d6a7', 'center', 'system-ui, sans-serif');
  text(`Wallet: ${fmtCash(cash)}`, W / 2, by + 54, 18, '#fff');
  const a = 0.5 + Math.sin(performance.now() / 250) * 0.5;
  ctx.globalAlpha = 0.4 + a * 0.6;
  text(r.qualified ? (level + 1 >= ORDER.length ? 'ENTER — CLAIM YOUR CROWN' : `ENTER — NEXT: ${RRR.tracks.get(ORDER[level + 1]).name}`) : 'ENTER — TRY AGAIN (TOP 3 NEEDED)', W / 2, by + 90, 20, '#ffd21f');
  ctx.globalAlpha = 1;
  text('ESC — MAIN MENU', W / 2, by + 116, 13, '#ddd');
}
// a pack is broken: engine/registry.js names the track and field, shown in place of the title screen
function drawConfigError() {
  ctx.fillStyle = '#1a0f1f'; ctx.fillRect(0, 0, W, H);
  text('TRACK CONFIG ERROR', W / 2, 120, 36, '#ef5350');
  CONFIG_PROBLEMS.slice(0, 10).forEach((p, i) => text(p, W / 2, 190 + i * 26, 14, '#fff', 'center', 'system-ui, sans-serif'));
  if (CONFIG_PROBLEMS.length > 10) text(`and ${CONFIG_PROBLEMS.length - 10} more`, W / 2, 190 + 10 * 26, 14, '#ffcc80', 'center', 'system-ui, sans-serif');
  if (CONFIG_PROBLEMS.some(p => p.includes('failed to load'))) // a download failed, not a typo: it is the player's problem to retry
    text('Check your connection and reload the page.', W / 2, 190 + (Math.min(CONFIG_PROBLEMS.length, 10) + (CONFIG_PROBLEMS.length > 10 ? 1 : 0)) * 26, 14, '#ffcc80', 'center', 'system-ui, sans-serif');
}
const pauseItemRect = i => ({ x: W / 2 - 170, y: 100 + i * 44, w: 340, h: 36 });
// tell players why they might hear nothing
function drawSoundHint() {
  let t = null;
  if (Sfx.problem) t = '\u26a0 ' + Sfx.problem;
  else if (!Sfx.running) t = '\ud83d\udd0a Tap or press any key to turn on sound';
  else if (Sfx.muted) t = '\ud83d\udd07 Sound muted: press M (or \ud83d\udd0a) to change';
  else if (isIOS && !navigator.audioSession && state === 'title') t = 'iPhone: no sound? Switch off silent mode';
  if (!t) return;
  ctx.font = '13px system-ui, sans-serif'; const w = ctx.measureText(t).width + 24;
  panel(W / 2 - w / 2, state === 'title' ? 8 : 48, w, 26, 0.7);
  text(t, W / 2, (state === 'title' ? 8 : 48) + 13, 13, '#fff', 'center', 'system-ui, sans-serif', false);
}
function drawPaused() {
  ctx.fillStyle = 'rgba(12,6,20,.86)'; ctx.fillRect(0, 0, W, H);
  text('PAUSED', W / 2, 66, 50, '#fff');
  PAUSE_MENU.forEach((m, i) => {
    const r = pauseItemRect(i), sel = i === pauseSel;
    ctx.fillStyle = sel ? '#ffd21f' : 'rgba(255,255,255,.1)'; rr(ctx, r.x, r.y, r.w, r.h, 10); ctx.fill();
    text((sel ? '\u25b6  ' : '') + m.label, W / 2, r.y + r.h / 2 + 1, 18, sel ? '#1a1a1a' : '#fff', 'center', FONT, !sel);
  });
  text('\u2191 \u2193 choose  \u00b7  ENTER select  \u00b7  ESC resume  \u00b7  TAB switch hands', W / 2, 286, 12, '#ffcc80', 'center', 'system-ui, sans-serif');
  drawControls(300);
}
const mixRow = i => ({ x: W / 2 - 250, y: 124 + i * 58, w: 500, h: 50 });
const mixBar = i => { const r = mixRow(i); return { x: r.x + 220, y: r.y + 19, w: 200, h: 14 }; };
const mixDone = { x: W / 2 - 80, y: 124 + MIXER.length * 58 + 6, w: 160, h: 40 };
const inRect = (x, y, r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
function drawMixer() {
  ctx.fillStyle = 'rgba(12,6,20,.9)'; ctx.fillRect(0, 0, W, H);
  text('SOUND MIXER', W / 2, 70, 40, '#ffd21f');
  text(Sfx.muted ? '\ud83d\udd07 muted: press M to unmute' : '\u2191 \u2193 choose  \u00b7  \u2190 \u2192 adjust  \u00b7  or tap the bars', W / 2, 106, 13, Sfx.muted ? '#ff8a80' : '#ffcc80', 'center', 'system-ui, sans-serif');
  MIXER.forEach(([k, label, sub], i) => {
    const r = mixRow(i), b = mixBar(i), sel = i === mixer.sel, v = Sfx.vol[k];
    ctx.fillStyle = sel ? 'rgba(255,210,31,.18)' : 'rgba(255,255,255,.06)'; rr(ctx, r.x, r.y, r.w, r.h, 10); ctx.fill();
    text(label, r.x + 18, r.y + (sub ? 20 : r.h / 2), 16, sel ? '#ffd21f' : '#fff', 'left');
    if (sub) text(sub, r.x + 18, r.y + 38, 11, '#bbb', 'left', 'system-ui, sans-serif');
    ctx.fillStyle = 'rgba(255,255,255,.15)'; rr(ctx, b.x, b.y, b.w, b.h, 7); ctx.fill();
    ctx.fillStyle = sel ? '#ffd21f' : '#8bc34a'; rr(ctx, b.x, b.y, Math.max(b.h, b.w * v), b.h, 7); ctx.fill();
    text(`${Math.round(v * 100)}%`, r.x + r.w - 18, r.y + r.h / 2, 15, '#fff', 'right');
  });
  ctx.fillStyle = '#ffd21f'; rr(ctx, mixDone.x, mixDone.y, mixDone.w, mixDone.h, 10); ctx.fill();
  text('DONE', W / 2, mixDone.y + mixDone.h / 2 + 1, 18, '#1a1a1a', 'center', FONT, false);
}
// mouse / trackpad / taps on the pause menu and the mixer
canvas.addEventListener('click', e => {
  const b = canvas.getBoundingClientRect(), x = (e.clientX - b.left) * W / b.width, y = (e.clientY - b.top) * H / b.height;
  if (mixer) {
    if (inRect(x, y, mixDone)) { mixer = null; return; }
    MIXER.forEach(([k], i) => {
      const bar = mixBar(i);
      if (inRect(x, y, { x: bar.x - 10, y: bar.y - 14, w: bar.w + 20, h: bar.h + 28 })) { mixer.sel = i; Sfx.setVol(k, (x - bar.x) / bar.w); }
      else if (inRect(x, y, mixRow(i))) mixer.sel = i;
    });
    return;
  }
  if (state === 'title' && !paused && inRect(x, y, TITLE_DRIVER_ROW)) { cycleDriver(x < W / 2 ? -1 : 1); return; }
  if (!paused) return;
  PAUSE_MENU.forEach((m, i) => { const r = pauseItemRect(i); if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) runCommand(m.cmd); });
});
canvas.addEventListener('mousemove', e => {
  if (!paused || mixer) return;
  const b = canvas.getBoundingClientRect(), x = (e.clientX - b.left) * W / b.width, y = (e.clientY - b.top) * H / b.height;
  PAUSE_MENU.forEach((m, i) => { const r = pauseItemRect(i); if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) pauseSel = i; });
});
