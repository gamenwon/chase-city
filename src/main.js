import "./style.css";
import { SoundSystem } from "./audio/sound.js";
const audio = new SoundSystem();
import { Simulation } from "./game/simulation.js";
import { getMission } from "./game/missions.js";
import { missionOrder, nextMission } from "./game/catalog.js";
import { getVehicle, VEHICLES, PLAYER_LINEUP, vehicleRatings, VEHICLE_ROLES } from "./game/vehicles.js";
import { Progress } from "./game/progress.js";
import { getMap, mapLayout } from "./world/maps.js";
import { generateCity } from "./world/citygen.js";
import { installAdBridge, PLACEMENTS } from "./platform/ads.js";
import { Input } from "./game/input.js";
import { CityRenderer } from "./render/scene.js";
import { Interface } from "./ui/interface.js";
import { cityBudget } from "./game/city.js";
// V1.9: phones are the main platform. A touch screen or a small screen gets
// the mobile budget (fewer pedestrians/cars, lighter rendering).
const mobile =
  matchMedia("(pointer: coarse)").matches ||
  Math.min(innerWidth, innerHeight) < 600;
const profile = mobile ? "mobile" : "desktop";
// V2.0: missions, saved credits/records, and the rewarded-ad connection.
const progress = new Progress();
// (A car saved from an earlier lineup falls back to the coupe.)
if (!PLAYER_LINEUP.includes(progress.selectedVehicle)) progress.selectVehicle("starter");
const ads = installAdBridge(window);
const order = missionOrder();
// Company evaluation preset (?eval): CITY CHAOS on a fixed city (seed 3
// unless ?seed is given), ?tod=day|night allowed, and a faster wanted
// level so heavy police and the helicopter show up in a short demo. The
// normal game keeps its random cities.
const params = new URLSearchParams(location.search);
const evalMode = params.has("eval");
// (?mission=<id>: the first mission when none was played yet, e.g. for
// tests and links; the last one played still comes back after a reload.)
const missionParam = params.get("mission");
const firstMission = evalMode
  ? "cityChaos"
  : order.includes(progress.data.lastMission)
    ? progress.data.lastMission
    : missionParam && order.includes(missionParam)
      ? missionParam
      : order[0];
// Every map built so far is downtown; a mission on another map would need
// its own renderer (see world/maps.js).
const startMap = getMap(getMission(firstMission).mapId);
const ui = new Interface(),
  sim = new Simulation(mapLayout(startMap.id), {
    city: startMap.city,
    cityProfile: profile,
    mission: firstMission,
    vehicle: progress.selectedVehicle,
    // Development only: ?tod=day or ?tod=night fixes the time of day.
    timeOfDay: import.meta.env.DEV || evalMode ? params.get("tod") : null,
    // V2.1: a new generated city every run; ?seed=N replays one city.
    cityGenerator: generateCity,
    seed: seedParam() ?? (evalMode ? 3 : undefined),
    chaosPace: evalMode ? 2 : 1,
  });
function seedParam() {
  const v = new URLSearchParams(location.search).get("seed");
  return v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) >>> 0 : undefined;
}
// The seed of the city on screen (for reporting a bad map).
function showSeed() {
  document.body.dataset.citySeed = sim.layout.seed;
  console.info(`[CHASE CITY] city seed ${sim.layout.seed} (map ${sim.layout.mapSeed}, attempts ${sim.layout.attempts})`);
}
showSeed();
// Development builds (or ?adtest) show the ad buttons disabled as "not
// connected" so the layout can be checked; production hides them until the
// host registers its ad provider.
const showAdPlaceholders =
  import.meta.env.DEV || new URLSearchParams(location.search).has("adtest");
const session = Math.random().toString(36).slice(2, 8);
const runKey = () => `${session}:${sim.runNumber}`;
let result = null; // { earned, base, doubled } for the run on screen
let recordedRun = null;
let renderer,
  state = "ready";
function pause() {
  if (state === "running") {
    state = "paused";
    input.clear();
    audio.setRunning(false);
    ui.showPause();
  } else if (state === "paused") {
    state = "running";
    audio.unlock();
    audio.setRunning(true);
    ui.hide();
  }
}
const input = new Input(pause);
try {
  renderer = new CityRenderer(document.querySelector("#game"), sim.layout, {
    mobile,
    theme: startMap.theme,
    // Material test pass (render/pbr.js): ?gfx=pbr starts with it on; the
    // G key switches it at any time (before/after in the same frame).
    // (Evaluation test build: on by default, ?gfx=off starts without.)
    gfx: params.get("gfx") !== "off",
  });
  sim.cameraRig = renderer.cameraRig;
  // The facility locations and their destruction (render/scene.js).
  renderer.attachLocations(sim);
  sim.cameraRig.update(sim.player, 0);
} catch (error) {
  document.querySelector("#message").textContent =
    "3D 그래픽을 시작할 수 없습니다. WebGL을 지원하는 브라우저에서 다시 시도하세요.";
  ui.start.disabled = true;
  console.error(error);
}
function missionNumber(id = sim.missionId) {
  return order.indexOf(id) + 1 || 1;
}
function briefing() {
  ui.setMissionHud(sim, missionNumber());
  ui.setWallet(progress.credits);
  ui.showMission(sim, {
    vehicle: getVehicle(progress.selectedVehicle),
    number: missionNumber(),
  });
}
// Switch to (or restart) a mission and show its briefing. Never while a run
// is being played.
function chooseMission(id) {
  if (!renderer || state === "running") return;
  payCoins(); // (a run left mid-way keeps what it collected)
  document.body.classList.remove("busted");
  sim.reset(id, progress.selectedVehicle);
  renderer.setLayout(sim.layout);
  renderer.attachLocations(sim);
  showSeed();
  renderer.reset();
  audio.reset();
  state = "ready";
  result = null;
  input.clear();
  progress.setLastMission(id);
  ui.hideSelect();
  briefing();
}
// Fullscreen (phones): the Fullscreen API where the browser has it
// (Android Chrome / Samsung Internet / most Android WebViews that allow it,
// iPad Safari); iPhone Safari has no fullscreen for pages, so there the
// way is "홈 화면에 추가" (the manifest opens it without browser bars).
// Inside another app's frame (e.g. a preview viewer) fullscreen is only
// possible if that frame allows it. START on a phone asks for fullscreen
// once (a tap is needed); the settings button switches it any time.
// Turning the phone keeps the run (only the size changes).
const fsButton = document.querySelector("#fullscreen-toggle");
const fsHint = document.querySelector("#fullscreen-hint");
const fsRoot = document.documentElement;
const fsKey = "chase-city-fullscreen";
const standalone =
  matchMedia("(display-mode: fullscreen), (display-mode: standalone)").matches || navigator.standalone === true;
const fsSupported = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
const inFrame = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();
const isFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
function showFullscreen() {
  if (!fsButton) return;
  const on = standalone || isFullscreen();
  fsButton.textContent = standalone ? "전체 화면 (앱 실행 중)" : on ? "전체 화면 ON" : "전체 화면 OFF";
  fsButton.setAttribute("aria-pressed", String(on));
  fsButton.disabled = standalone;
  let hint = "";
  if (!standalone && !fsSupported)
    hint = /iPhone|iPod/.test(navigator.userAgent)
      ? "iPhone 브라우저는 웹 전체 화면을 지원하지 않습니다. Safari 공유 → '홈 화면에 추가'로 실행하면 주소창 없이 플레이할 수 있습니다."
      : inFrame
        ? "다른 앱 화면 안에서 열려 전체 화면이 막혀 있습니다. 게임 주소를 브라우저에서 직접 열어 주세요."
        : "이 브라우저는 전체 화면을 지원하지 않습니다.";
  if (fsHint) {
    fsHint.textContent = hint;
    fsHint.hidden = !hint;
  }
}
async function enterFullscreen() {
  if (standalone || !fsSupported || isFullscreen()) return;
  try {
    if (fsRoot.requestFullscreen) await fsRoot.requestFullscreen({ navigationUI: "hide" });
    else if (fsRoot.webkitRequestFullscreen) fsRoot.webkitRequestFullscreen();
  } catch {}
}
function exitFullscreen() {
  try {
    if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
    else document.webkitExitFullscreen?.();
  } catch {}
}
function rememberFullscreen(on) {
  try {
    localStorage.setItem(fsKey, on ? "on" : "off");
  } catch {}
}
fsButton?.addEventListener("click", () => {
  if (isFullscreen()) {
    rememberFullscreen(false);
    exitFullscreen();
  } else {
    rememberFullscreen(true);
    enterFullscreen();
  }
});
for (const type of ["fullscreenchange", "webkitfullscreenchange"]) document.addEventListener(type, showFullscreen);
showFullscreen();
function fullscreenOnStart() {
  if (!mobile) return;
  let pref = null;
  try {
    pref = localStorage.getItem(fsKey);
  } catch {}
  if (pref !== "off") enterFullscreen();
}
ui.start.addEventListener("click", () => {
  fullscreenOnStart();
  if (!renderer) return;
  document.body.classList.remove("busted");
  if (state === "over") {
    sim.reset();
    renderer.setLayout(sim.layout);
    renderer.attachLocations(sim);
    showSeed();
    renderer.reset();
    audio.reset();
    state = "ready";
    result = null;
    input.clear();
    ui.setMissionHud(sim, missionNumber());
  }
  audio.unlock();
  if (state === "ready") {
    sim.start();
    audio.reset();
  }
  audio.setRunning(true);
  state = "running";
  input.clear();
  ui.hide();
});
// Developer vehicle selection: any car of the collection (or the classic
// car), only between runs (never while one is being played); the mission
// restarts with it.
// (Also from the CITY CHAOS result screen.)
document.querySelector("#result-vehicle")?.addEventListener("click", () => document.querySelector("#pick-vehicle")?.click());
document.querySelector("#pick-vehicle")?.addEventListener("click", () => {
  if (state !== "ready" && state !== "over") return; // (not from a paused run)
  const list = PLAYER_LINEUP.map((id) => ({ id, name: VEHICLES[id].name, role: VEHICLE_ROLES[id], ratings: vehicleRatings(VEHICLES[id]) }));
  ui.showVehiclePicker(list, progress.selectedVehicle, (id) => {
    if (state !== "ready" && state !== "over") return;
    progress.selectVehicle(id);
    const missionId = sim.missionId;
    state = "ready";
    chooseMission(missionId);
  });
});
// Pause popup: MISSION SELECT ends the run (after a confirmation) and goes
// to the mission list. CANCEL goes back to the pause popup (still paused).
document.querySelector("#pause-exit").addEventListener("click", () => {
  if (state === "paused") ui.confirmExit(true);
});
document.querySelector("#exit-cancel").addEventListener("click", () => {
  ui.confirmExit(false);
  ui.start.focus({ preventScroll: true });
});
document.querySelector("#exit-ok").addEventListener("click", () => {
  if (state !== "paused") return;
  ui.confirmExit(false);
  // The same clean switch as choosing a mission: coins picked up so far are
  // paid once, the simulation, AI, timers and gameplay audio stop and the
  // city is rebuilt for the briefing; no run is recorded.
  audio.setRunning(false);
  chooseMission(sim.missionId);
  document.querySelector("#open-select").click();
});
document.querySelector("#next-mission").addEventListener("click", () => {
  const next = nextMission(sim.missionId, order);
  if (next) chooseMission(next);
});
document.querySelector("#open-select").addEventListener("click", () => {
  if (state === "running") return;
  ui.showSelect(
    order.map((id, i) => ({
      id,
      number: i + 1,
      record: progress.missionRecord(id),
    })),
    sim.missionId,
    (id) => {
      // The same mission while its briefing is up: just close the list.
      if (id === sim.missionId && state === "ready") ui.hideSelect();
      else chooseMission(id);
    },
  );
});
document.querySelector("#close-select").addEventListener("click", () => {
  ui.hideSelect();
  ui.start.focus({ preventScroll: true });
});
// ---- rewarded ads (only through the host's ad system) ----
function adState(placement, allowed) {
  if (!allowed) return "hidden";
  const status = ads.status(placement);
  if (status === "unavailable") return showAdPlaceholders ? "disabled" : "hidden";
  return status === "ready" ? "ready" : "disabled";
}
function refreshAds() {
  if (state !== "over" || !result) return;
  const failed = sim.result && sim.result !== "success";
  const canContinue =
    failed &&
    !sim.mission.continued &&
    sim.mission.definition.continueOn.includes(sim.result);
  const canDouble = sim.result === "success" && result.base > 0;
  const cont = sim.mission.continued && failed ? "used" : adState(PLACEMENTS.continue, canContinue);
  const dbl = result.doubled ? "used" : adState(PLACEMENTS.doubleReward, canDouble);
  ui.setAds({
    continue: cont,
    double: dbl,
    note:
      ads.status(PLACEMENTS.continue) === "unavailable" &&
      (cont === "disabled" || dbl === "disabled")
        ? "개발용 표시: 광고 시스템 연결 전에는 동작하지 않습니다."
        : "",
  });
}
ads.onChange(refreshAds);
document.querySelector("#ad-continue").addEventListener("click", async () => {
  if (state !== "over") return;
  const run = sim.runNumber;
  const { rewarded } = await ads.showRewarded(PLACEMENTS.continue);
  if (!rewarded || run !== sim.runNumber || state !== "over") return refreshAds();
  if (!sim.revive()) return refreshAds();
  document.body.classList.remove("busted");
  state = "running";
  result = null;
  input.clear();
  audio.unlock();
  audio.setRunning(true);
  ui.hide();
});
document.querySelector("#ad-double").addEventListener("click", async () => {
  if (state !== "over" || !result || result.doubled) return;
  const shown = result;
  const { rewarded } = await ads.showRewarded(PLACEMENTS.doubleReward);
  if (!rewarded || shown !== result) return refreshAds();
  const extra = progress.pay(runKey(), "ad-double", shown.base);
  shown.doubled = true;
  shown.earned += extra;
  ui.setWallet(progress.credits);
  ui.showResultDetails(sim, resultInfo());
  refreshAds();
});
function resultInfo() {
  return {
    earned: result.earned,
    previousBest: result.previousBest,
    hasNext: !!nextMission(sim.missionId, order),
  };
}
// Coins picked up and earned by destruction this run go into the saved
// balance when the run ends (success or failure), once: what was already
// paid for this run (before a continue) is not paid again.
let coinPaid = { run: null, amount: 0 };
function payCoins() {
  if (!sim.runCoins) return 0;
  const already = coinPaid.run === runKey() ? coinPaid.amount : 0;
  const due = sim.runCoins - already;
  if (due <= 0) return 0;
  const paid = progress.pay(runKey(), `coins-${already}`, due);
  coinPaid = { run: runKey(), amount: already + paid };
  return paid;
}
// A run just ended: pay the reward once, record it, show the result.
function finishRun() {
  const success = sim.result === "success";
  const base = success ? sim.credits : 0;
  const coins = payCoins();
  const earned = progress.pay(runKey(), "base", base) + coins;
  progress.recordRun(sim.missionId, {
    success,
    time: sim.elapsed,
    repeat: recordedRun === runKey(),
  });
  // CITY CHAOS: the personal best score (once per run).
  let previousBest = 0;
  if (sim.chaos) {
    const record = progress.missionRecord(sim.missionId);
    previousBest = record?.bestScore || 0;
    if (recordedRun !== runKey()) progress.recordScore(sim.missionId, sim.chaos.score, { time: Math.round(sim.elapsed), wanted: sim.chaos.maxLevel, vehicle: sim.vehicleId });
  }
  recordedRun = runKey();
  result = { base, earned, doubled: false, previousBest };
  ui.setWallet(progress.credits);
  ui.gameover(sim, resultInfo());
  refreshAds();
}
document.querySelector("#pause").addEventListener("click", pause);
const mute = document.querySelector("#mute");
mute.addEventListener("click", () => {
  audio.setMuted(!audio.muted);
  if (!audio.muted && state === "running") audio.unlock();
  mute.textContent = audio.muted ? "소리 OFF" : "소리 ON";
  mute.setAttribute("aria-pressed", String(audio.muted));
});
// V1.8 driver's-view PIP: on by default on desktop, off on phones and
// touch screens (small screen, battery). The viewer's choice is remembered.
const pipToggle = document.querySelector("#pip-toggle");
const pipKey = "chase-city-pip";
function readPipChoice() {
  try {
    const saved = localStorage.getItem(pipKey);
    if (saved === "on" || saved === "off") return saved === "on";
  } catch {}
  return !(matchMedia("(pointer: coarse)").matches || innerWidth < 700);
}
function setPip(enabled, remember = false) {
  renderer?.setPip(enabled);
  document.body.classList.toggle("pip-on", enabled);
  pipToggle.setAttribute("aria-pressed", String(enabled));
  pipToggle.title = enabled ? "운전자 시점 끄기 (V)" : "운전자 시점 켜기 (V)";
  if (remember)
    try {
      localStorage.setItem(pipKey, enabled ? "on" : "off");
    } catch {}
}
setPip(readPipChoice());
pipToggle.addEventListener("click", () => setPip(!renderer?.pipEnabled, true));
window.addEventListener("keydown", (e) => {
  if (e.code === "KeyV" && !e.repeat) setPip(!renderer?.pipEnabled, true);
  if (e.code === "KeyG" && !e.repeat && renderer) toggleGfx();
});
// Material test pass switch (HUD button and G): before/after in place.
const gfxButton = document.querySelector("#gfx-toggle");
function showGfx() {
  if (!gfxButton || !renderer) return;
  gfxButton.textContent = renderer.gfx.on ? "재질 ON" : "재질 OFF";
  gfxButton.setAttribute("aria-pressed", String(renderer.gfx.on));
}
function toggleGfx() {
  renderer.setGfx(!renderer.gfx.on);
  showGfx();
}
gfxButton?.addEventListener("click", () => renderer && toggleGfx());
showGfx();
document.addEventListener("visibilitychange", () => {
  if (document.hidden && state === "running") pause();
});
window.addEventListener("blur", () => {
  if (state === "running") pause();
});
let last = 0,
  accumulator = 0;
// V1.9 frame-rate governor: aim for 30+ FPS. If frames run slow for a while
// the city budget (pedestrians, traffic, parked cars) is cut and, on phones,
// the render resolution drops a step; when there is headroom again it is
// slowly given back. Gameplay (police, physics) is never changed.
const perf = {
  profile,
  level: 1,
  frameMs: 16.7,
  slowFor: 0,
  fastFor: 0,
  pixelRatio: renderer ? renderer.renderer.getPixelRatio() : 1,
  changes: [],
};
function govern(dtMs) {
  perf.frameMs += (Math.min(dtMs, 100) - perf.frameMs) * 0.1;
  perf.slowFor = perf.frameMs > 33.4 ? perf.slowFor + dtMs / 1000 : 0;
  perf.fastFor = perf.frameMs < 22 ? perf.fastFor + dtMs / 1000 : 0;
  let level = perf.level;
  if (perf.slowFor > 1.5 && level > 0.4) level = Math.max(0.4, level - 0.2);
  else if (perf.fastFor > 6 && level < 1) level = Math.min(1, level + 0.1);
  else return;
  perf.slowFor = perf.fastFor = 0;
  perf.level = level;
  sim.cityBudget = cityBudget(profile, level);
  if (sim.city) sim.city.budget = sim.cityBudget;
  if (renderer && mobile) {
    const ratio = Math.min(devicePixelRatio, level < 0.7 ? 1 : 1.5);
    if (ratio !== perf.pixelRatio) {
      perf.pixelRatio = ratio;
      renderer.renderer.setPixelRatio(ratio);
      renderer.resize();
    }
  }
  perf.changes.push({
    at: Math.round(performance.now()),
    level,
    fps: Math.round(1000 / perf.frameMs),
  });
}
// Developer FPS display (mobile testing): ?fps, or "FPS 표시" in the pause
// menu (remembered). Shows the frame rate over the last half second, the
// average and worst frame time, the render size and pixel ratio, the
// orientation, draw calls and triangles, and the frame-rate governor's
// level. Measuring costs nothing when it is off.
const fpsBox = document.querySelector("#fps");
const fpsButton = document.querySelector("#fps-toggle");
const fpsKey = "chase-city-fps";
const fpsMeter = { on: false, frames: 0, sum: 0, worst: 0, since: 0 };
function setFps(on, remember = false) {
  fpsMeter.on = on;
  if (fpsBox) fpsBox.hidden = !on;
  if (fpsButton) {
    fpsButton.textContent = on ? "FPS 표시 ON" : "FPS 표시 OFF";
    fpsButton.setAttribute("aria-pressed", String(on));
  }
  if (remember)
    try {
      localStorage.setItem(fpsKey, on ? "on" : "off");
    } catch {}
}
setFps(
  params.has("fps") ||
    (() => {
      try {
        return localStorage.getItem(fpsKey) === "on";
      } catch {
        return false;
      }
    })(),
);
fpsButton?.addEventListener("click", () => setFps(!fpsMeter.on, true));
// Weather (test build): auto (the run picks day or night, as before),
// day, night, snow (day), rain (day). Remembered; ?weather=... for links.
// Only the look changes (car handling stays as it is for now).
const wxKey = "chase-city-weather";
const wxModes = ["auto", "day", "night", "snow", "rain"];
const wxStartFixed = sim.fixedTimeOfDay;
function setWeather(mode, remember = false) {
  if (!wxModes.includes(mode)) mode = "auto";
  const tod = mode === "night" ? "night" : mode === "auto" ? null : "day";
  sim.fixedTimeOfDay = tod ?? wxStartFixed;
  if (tod) sim.timeOfDay = tod;
  renderer?.setWeather(mode === "snow" || mode === "rain" ? mode : "clear");
  for (const b of document.querySelectorAll("[data-wx]")) b.setAttribute("aria-pressed", String(b.dataset.wx === mode));
  if (remember)
    try {
      localStorage.setItem(wxKey, mode);
    } catch {}
}
for (const b of document.querySelectorAll("[data-wx]")) b.addEventListener("click", () => setWeather(b.dataset.wx, true));
setWeather(
  params.get("weather") ||
    (() => {
      try {
        return localStorage.getItem(wxKey) || "auto";
      } catch {
        return "auto";
      }
    })(),
);
function meterFps(ms, dtMs) {
  if (!fpsMeter.on || !fpsBox) return;
  if (dtMs > 0 && dtMs < 1000) {
    fpsMeter.frames++;
    fpsMeter.sum += dtMs;
    fpsMeter.worst = Math.max(fpsMeter.worst, dtMs);
  }
  if (ms - fpsMeter.since < 500) return;
  const fps = fpsMeter.frames ? (1000 * fpsMeter.frames) / fpsMeter.sum : 0;
  const r = renderer?.renderer, info = r?.info.render, ratio = r?.getPixelRatio() ?? 1;
  fpsBox.textContent =
    `FPS ${fps.toFixed(0)}  avg ${(fpsMeter.sum / Math.max(1, fpsMeter.frames)).toFixed(1)}ms  max ${fpsMeter.worst.toFixed(0)}ms\n` +
    `${innerWidth}x${innerHeight} ${innerWidth < innerHeight ? "세로" : "가로"}  dpr ${devicePixelRatio.toFixed(2)} → ${ratio.toFixed(2)}\n` +
    `draw ${info?.calls ?? "-"}  tri ${info ? (info.triangles / 1000).toFixed(0) + "k" : "-"}  lvl ${perf.level.toFixed(1)}  ${profile}${renderer?.gfx?.on ? "  재질" : ""}`;
  fpsBox.className = fps < 25 ? "bad" : fps < 45 ? "slow" : "";
  fpsMeter.frames = fpsMeter.sum = fpsMeter.worst = 0;
  fpsMeter.since = ms;
}
function frame(ms) {
  requestAnimationFrame(frame);
  meterFps(ms, ms - last);
  const dt = Math.min((ms - last) / 1000, 0.1);
  if (state === "running" && last) govern(ms - last);
  last = ms;
  if (state === "running") {
    accumulator += dt;
    while (accumulator >= 1 / 60) {
      sim.update(1 / 60, input);
      renderer?.locations?.step(sim, 1 / 60);
      accumulator -= 1 / 60;
      if (sim.result) {
        state = "over";
        audio.finish(sim.result === "success");
        if (sim.result === "arrested") {
          // BUSTED: hold the frozen scene of officers covering the boxed-in
          // car for a moment, with the lights flashing, before the result.
          const run = sim.runNumber;
          document.body.classList.add("busted");
          setTimeout(() => {
            if (state === "over" && sim.runNumber === run && sim.result)
              finishRun();
          }, 900);
        } else finishRun();
        break;
      }
    }
  } else accumulator = 0;
  if (state === "running") {
    audio.update(sim);
    if (sim.escape.phase === "open" && audio.escapeRun !== sim.runNumber) {
      audio.escapeRun = sim.runNumber;
      audio.voice("tone", 1, 784);
      audio.voice("tone", 1, 1046, 0.15);
    }
  }
  if (state === "running") {
    const taken = sim.pickups.filter((q) => q.taken).length;
    if (taken > (frame.taken || 0)) audio.voice("tone", 1, 988);
    frame.taken = taken;
  } else frame.taken = 0;
  ui.update(sim, renderer?.guidanceView);
  ui.chaosHud(sim, renderer?.chaosMarks);
  if (state === "running" || state === "ready") renderer?.locations?.render(state === "running" ? dt : 0, sim);
  renderer?.render(
    sim,
    state === "running" || state === "ready" ? dt : 0,
    state === "running",
  );
}
if (renderer) briefing();
requestAnimationFrame(frame);
// Opt-in diagnostics for automated local tests; never enabled by normal play.
if (import.meta.env.DEV && new URLSearchParams(location.search).has("debug"))
  window.__CHASE__ = {
    sim,
    input,
    renderer,
    audio,
    perf,
    progress,
    ads,
    ui,
    chooseMission,
    get state() {
      return state;
    },
  };
