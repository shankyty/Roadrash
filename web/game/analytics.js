'use strict';
// Page-view analytics, device details, error reporting and saved settings.
// ------------------------------------------------------------------ analytics
// GoatCounter (no cookies, no personal data). Only on the published website, so local
// testing and the Mac app (file://) are never counted. Dashboard: roadrash-shankyty.goatcounter.com
const GOATCOUNTER = 'https://roadrash-shankyty.goatcounter.com/count';
const analyticsOn = /^https?:$/.test(location.protocol) && !/^(localhost|127\.|\[::1\]|.*\.localhost$)/.test(location.hostname);
const pendingEvents = [];
// custom events show up in the dashboard as paths like "race-start/delhi"; queued until count.js loads
function trackEvent(event, title) {
  if (!analyticsOn) return;
  const send = () => { try { window.goatcounter.count({ path: event, title: title || event, event: true }); } catch (e) { /* never break the game */ } };
  if (window.goatcounter && window.goatcounter.count) send(); else pendingEvents.push(send);
}
// which device, OS and browser this visit used, as one combined event: device/<kind>/<os>/<browser>
function deviceSummary() {
  const ua = navigator.userAgent || '', touch = navigator.maxTouchPoints > 1;
  const os = /iPhone|iPod/.test(ua) ? 'iOS' : /iPad/.test(ua) || (/Macintosh/.test(ua) && touch) ? 'iPadOS' : /Android/.test(ua) ? 'Android'
    : /CrOS/.test(ua) ? 'ChromeOS' : /Windows/.test(ua) ? 'Windows' : /Macintosh|Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Other';
  const browser = /WhatsApp/i.test(ua) ? 'WhatsApp-in-app' : /Instagram/.test(ua) ? 'Instagram-in-app' : /FBAN|FBAV|FB_IAB/.test(ua) ? 'Facebook-in-app'
    : /SamsungBrowser/.test(ua) ? 'Samsung-Internet' : /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Firefox|FxiOS/.test(ua) ? 'Firefox'
    : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Other';
  const short = Math.min(screen.width, screen.height);
  const kind = os === 'iPadOS' || (touch && short >= 600) ? 'tablet' : touch && short < 600 ? 'phone' : 'computer';
  return `device/${kind}/${os}/${browser}`;
}
// Problems on players' devices are reported to the dashboard, grouped as
//   error/<kind>/<problem>/<OS-browser>
// with the details needed to reproduce them in the title (version, game state, OS/browser versions,
// screen, audio state, stack). Nothing personal is sent. Also logged to the console.
const GAME_VERSION = '3.16.0';
// 3D quality tier: mobile browsers < laptop/desktop browsers < the Mac app. 'smooth' (phones and tablets,
// when 3D is forced there with ?3d) keeps the frame rate up with fewer polygons and a lower resolution; 'high' for computer browsers; 'ultra'
// in the Mac app (loaded from file://): finest models, detail kept farther away, full Retina resolution.
// ?quality=smooth|high|ultra overrides it.
// phones and tablets (incl. iPadOS, which reports itself as a Mac with touch) play the 2D game; ?3d forces 3D there
const IS_MOBILE = (() => { const ua = navigator.userAgent || ''; return /Android|iPhone|iPad|iPod|Mobile/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1); })();
const QUALITY = (() => {
  const asked = new URLSearchParams(location.search).get('quality');
  if (['smooth', 'high', 'ultra'].includes(asked)) return asked;
  if (location.protocol === 'file:') return 'ultra';
  return IS_MOBILE ? 'smooth' : 'high';
})();
const safe = (f, fallback = '?') => { try { const v = f(); return v === undefined ? fallback : v; } catch (e) { return fallback; } };
function envDetails() {
  const ua = navigator.userAgent || '';
  const osVer = (ua.match(/Mac OS X (\d+[_.]\d+)/) || ua.match(/OS (\d+[_.]\d+)/) || ua.match(/Android (\d+(?:\.\d+)?)/) || ua.match(/Windows NT (\d+\.\d+)/) || ua.match(/CrOS \S+ ([\d.]+)/) || [])[1];
  const brVer = (ua.match(/(?:SamsungBrowser|CriOS|FxiOS|EdgA?|OPR|Firefox|Chrome|Version)\/(\d+(?:\.\d+)?)/) || [])[1];
  const a = safe(() => Sfx.ctx, null);
  return [
    `v${GAME_VERSION}`,
    safe(() => `${state}${paused ? '(paused)' : ''} on ${def.city.id}/${def.id}`),
    `${deviceSummary().replace('device/', '').replace(/\//g, ' ')} · os ${(osVer || '?').replace('_', '.')} · browser ${brVer || '?'}`,
    `screen ${screen.width}x${screen.height}@${Math.round(devicePixelRatio * 10) / 10}x quality=${QUALITY}`,
    a ? `audio=${a.state} ${a.sampleRate}Hz` : 'audio=none',
    `worklet=${'AudioWorkletNode' in window ? 'yes' : 'no'} iOS-session=${navigator.audioSession ? 'yes' : 'no'}`,
    `muted=${safe(() => Sfx.muted)} vol=${safe(() => JSON.stringify(Sfx.vol))}`,
    `${Math.round(performance.now() / 1000)}s after load`,
  ].join(' · ');
}
// Which part of the game an error came from: the first stack frame whose function belongs to a component.
const AUDIO_METHODS = 'loadHorns|hornClip|loadAnimals|playAt|spot|outAt|mooAt|barkAt|mooFrom|barkFrom|updateAnimals|ensureVoices|updateVehicles|honkAt|hornTone|kindOf|init|fallbackEngine|loadSamples|startEngine|setEngine|applyVol|setVol|toggleMute|tone|noise|horn|hit|whoosh|crash|splash|rain|thunder|filtered|bump|moo|bark|yelp|grunt|beep|ko|cash|ensure|setCity|toggle|tick|env|osc|drum|note|decode|stopAll|shopsNearby|unlockAudio';
const COMPONENTS = [
  ['audio', new RegExp(`^(?:Sfx|Music|Ambience|Object)?\\.?(?:${AUDIO_METHODS})$|^(?:Sfx|Music|Ambience|TwoStroke)`)],
  ['traffic', /^(updateDog|startChase|updateTraffic|driveTraffic|honk)$/],
  ['rivals-combat', /^(updateRivals|resolveAttack|startAttack|curse|splash|mudScreen|drawScreenMud)$/],
  ['player-physics', /^(updatePlayer|crashPlayer|checkCollisions|endDrift|updateClosePasses|hitKerb|takeOff|landPlayer|settleLanding)$/],
  ['hawkers', /^(updateHawkers)$/],
  ['race-rules', /^(?:RaceStats\.|Records\.)?(checkFinish|buildResults|advanceAfterResults|setupRace|currentRank|resetPlayer|updateAttract|closePass|breakChain|advance|bonuses|summary|submit)$/],
  ['config', /^(?:Registry\.|RRR\.)?(register|check|checkMerged|deepFreeze|validate|resolve|resolveDef)$/],
  ['traffic', /^(?:TrafficSpawner\.)?(spawn|deck|busLook|roadSpot|addVehicle|addCow|addDog|spawnTraffic)$/],
  ['track', /^(?:TrackBuilder\.)?(build|loadTrack|addRoad|addSegment|lastY|layPieces|layoutLanes|layoutJunctions|placeScenery|placeSigns|placeFootpath|settleRoadside|findSegment|attractSetup)$/],
  ['sprites', /^(?:Object\.)?(make[A-Z]\w*|buildSharedSprites|flipped|litWindows|fillerBlocks|trees|waterBand|cutOut|archPath|onion|far|near)$/],
  ['ui', /^(draw(?:HUD|Title|Results|Paused|Mixer|Controls|Countdown|Champion|Bubbles|Popups|Messages|SoundHint)|text|panel|bar|keycap)$/],
  ['renderer', /^(render|drawSegment|drawBackground|drawSprite|drawTuk|drawAttack|drawNeon|drawNeonStrips|drawPlayer|project|poly)$/],
  ['input', /^(onPress|keyDown|keyUp|runCommand|toggleLayout|openPause|openMixer)$/],
  ['voices', /^(?:Object\.|Voice\.|VoiceClips\.)?(sayLine|stopVoices|loadClips|playClip|place|updateClips|stopClips)$/],
  ['analytics', /^(trackEvent|deviceSummary|envDetails)$/],
  ['weather', /^(updateWeather|boltPath|drawBolt|drawRain)$/],
  ['game-loop', /^(update|step|frame)$/],
];
function componentOf(err) {
  const stack = String(err && err.stack || '');
  for (const line of stack.split('\n')) {
    // Chrome/Edge: "at fnName (file:1:2)" · Safari/Firefox: "fnName@file:1:2"
    const m = line.match(/^\s*at\s+(?:async\s+)?([\w$.<>]+)\s*\(/) || line.match(/^\s*([\w$.<>]+)@/);
    if (!m) continue;
    const fn = m[1].replace(/^(?:Object|window)\./, '');
    for (const [name, re] of COMPONENTS) if (re.test(fn) || re.test(m[1])) return name;
  }
  return null;
}
// run one component's per-frame work; if it throws, report it (once) and keep the rest of the game going
function guard(component, fn) {
  try { return fn(); } catch (err) { reportProblem(componentOf(err) || component, err && err.message, err, `guard:${component}`); }
}
function guardDraw(component, fn) {
  ctx.save();
  try { fn(); } catch (err) { reportProblem(componentOf(err) || component, err && err.message, err, `guard:${component}`); }
  ctx.restore(); ctx.globalAlpha = 1;
}
const reportedErrors = new Set();
function reportProblem(kind, message, err, where) {
  message = String(message || (err && err.message) || 'unknown').replace(/\s+/g, ' ').trim();
  const key = `${kind}:${message}`;
  if (reportedErrors.has(key) || reportedErrors.size >= 8) return;
  reportedErrors.add(key);
  const slug = message.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'unknown';
  const who = deviceSummary().split('/').slice(2).join('-'); // e.g. iOS-Safari
  const stack = err && err.stack ? String(err.stack).split('\n').slice(0, 4).map(l => l.trim().replace(/https?:\/\/[^\s)]*\//g, '')).join(' ← ') : '';
  const title = [message, where && `at ${where}`, envDetails(), stack].filter(Boolean).join(' · ').slice(0, 900);
  try { console.warn('[RoadRash]', `error/${kind}/${slug}`, title); } catch (e) { /* ignore */ }
  trackEvent(`error/${kind}/${slug}/${who}`, title);
}
addEventListener('error', e => reportProblem(componentOf(e.error) || 'js', e.message, e.error, `${(e.filename || '').split('/').pop()}:${e.lineno || 0}:${e.colno || 0}`));
addEventListener('unhandledrejection', e => reportProblem(componentOf(e.reason) || 'promise', e.reason && e.reason.message || e.reason, e.reason));
if (analyticsOn) {
  const tag = document.createElement('script');
  tag.async = true; tag.src = '//gc.zgo.at/count.js'; tag.dataset.goatcounter = GOATCOUNTER;
  tag.onload = () => { const wait = setInterval(() => { if (window.goatcounter && window.goatcounter.count) { clearInterval(wait); pendingEvents.splice(0).forEach(f => f()); } }, 100); };
  document.head.appendChild(tag);
  // like GoatCounter's own page view, only count the device once the page is actually shown
  const deviceOnce = () => { if (document.visibilityState === 'visible') { document.removeEventListener('visibilitychange', deviceOnce); trackEvent(deviceSummary(), 'Device · OS · browser'); } };
  if (document.visibilityState === 'visible') deviceOnce(); else document.addEventListener('visibilitychange', deviceOnce);
}

const store = {
  get(k, d) { try { const v = localStorage.getItem('rrr_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('rrr_' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
};
