import "./style.css";
import { SoundSystem } from "./audio/sound.js";
const audio = new SoundSystem();
import { createLayout } from "./world/layout.js";
import { Simulation } from "./game/simulation.js";
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
const ui = new Interface(),
  sim = new Simulation(createLayout(), {
    city: true,
    cityProfile: profile,
  });
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
  });
  sim.cameraRig = renderer.cameraRig;
  sim.cameraRig.update(sim.player, 0);
} catch (error) {
  document.querySelector("#message").textContent =
    "3D 그래픽을 시작할 수 없습니다. WebGL을 지원하는 브라우저에서 다시 시도하세요.";
  ui.start.disabled = true;
  console.error(error);
}
ui.start.addEventListener("click", () => {
  if (!renderer) return;
  document.body.classList.remove("busted");
  if (state === "over") {
    sim.reset();
    renderer.reset();
    audio.reset();
    state = "ready";
    input.clear();
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
});
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
function frame(ms) {
  requestAnimationFrame(frame);
  const dt = Math.min((ms - last) / 1000, 0.1);
  if (state === "running" && last) govern(ms - last);
  last = ms;
  if (state === "running") {
    accumulator += dt;
    while (accumulator >= 1 / 60) {
      sim.update(1 / 60, input);
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
            if (state === "over" && sim.runNumber === run) ui.gameover(sim);
          }, 900);
        } else ui.gameover(sim);
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
  ui.update(sim, renderer?.roadEvents.view);
  renderer?.render(
    sim,
    state === "running" || state === "ready" ? dt : 0,
    state === "running",
  );
}
if (renderer) ui.showMission(sim);
requestAnimationFrame(frame);
// Opt-in diagnostics for automated local tests; never enabled by normal play.
if (import.meta.env.DEV && new URLSearchParams(location.search).has("debug"))
  window.__CHASE__ = {
    sim,
    input,
    renderer,
    audio,
    perf,
    get state() {
      return state;
    },
  };
