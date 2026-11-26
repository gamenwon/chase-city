import { CONFIG } from "../game/config.js";
import { MISSIONS } from "../game/missions.js";
import { tallyRows } from "../game/tally.js";
import { MAPS } from "../world/maps.js";
export const formatTime = (t) =>
  `${Math.floor(t / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(t % 60)
    .toString()
    .padStart(2, "0")}`;
const credits = (n) => `${Math.round(n).toLocaleString("ko-KR")} 코인`;
const TYPE_TAGS = {
  chase: "CHASE · 추격",
  collect: "COLLECT · 수집",
  carry: "CARRY · 운반",
  stealth: "STEALTH · 잠입",
  evade: "EVADE · 회피",
};
const limitText = (m) =>
  m.timeLimit === null ? "없음" : `${m.timeLimit}초`;
export class Interface {
  constructor() {
    this.overlay = document.querySelector("#overlay");
    this.start = document.querySelector("#start");
    this.best = 0;
    this.elements = Object.fromEntries(
      [
        "time",
        "time-label",
        "coins",
        "health",
        "health-bar",
        "arrest",
        "arrest-bar",
        "mission-progress",
        "mission-number",
        "eyebrow",
        "title",
        "message",
        "mission-details",
        "result-details",
        "result-time",
        "result-destroyed",
        "result-earned",
        "wallet-credits",
        "ad-actions",
        "ad-continue",
        "ad-double",
        "ad-note",
        "next-mission",
        "open-select",
        "mission-select",
        "mission-list",
        "chaos-result",
        "result-vehicle",
      ].map((id) => [id, document.getElementById(id)]),
    );
    try {
      this.best = Number(localStorage.getItem("chase-city-best")) || 0;
    } catch {}
  }
  update(sim, escapeView = null) {
    const e = this.elements;
    e.time.textContent = formatTime(sim.elapsed);
    // Durability gauge: green, yellow, orange, red (a slow pulse when
    // critical).
    const hp = Math.max(0, sim.health);
    e.health.textContent = `${Math.ceil(hp)}%`;
    e["health-bar"].style.width = `${hp}%`;
    const state = hp > 60 ? "ok" : hp > 30 ? "dmg" : hp > 10 ? "low" : "crit";
    if (state !== this.hpState) {
      this.hpState = state;
      const box = document.querySelector("#hp-box");
      if (box) box.dataset.state = state;
    }
    // Coins this run.
    const coins = sim.runCoins || 0;
    if (coins !== this.shownCoins) {
      e.coins.textContent = String(coins);
      const box = e.coins.parentElement;
      box.classList.remove("bump");
      void box.offsetWidth;
      if (coins > (this.shownCoins ?? 0)) box.classList.add("bump");
      this.shownCoins = coins;
    }
    e["arrest-bar"].style.width =
      `${(sim.arrest / CONFIG.arrestSeconds) * 100}%`;
    e.arrest.textContent =
      sim.arrest > 0.1
        ? "포위 위험! 열린 방향으로 탈출하세요"
        : "경찰을 따돌리세요";
    document.querySelector("#speed strong").textContent = Math.round(
      sim.started && !sim.result
        ? Math.hypot(sim.player.vx, sim.player.vz) * 3.6
        : 0,
    );
    e["mission-progress"].textContent = sim.mission.definition.hud(sim);
    this.targetBar(sim);
    // Arrest countdown: shown the moment the arrest timer runs (cordon
    // closed, or police cars holding the car stuck), whole seconds left.
    const counting = sim.started && !sim.result && sim.arrest > 0;
    const box = document.getElementById("arrest-countdown");
    if (box.hidden === counting) box.hidden = !counting;
    if (counting) {
      const left = Math.max(1, Math.ceil(CONFIG.arrestSeconds - sim.arrest - 1e-9));
      const count = document.getElementById("arrest-count");
      if (count.textContent !== String(left)) count.textContent = left;
      document.getElementById("arrest-why").textContent = sim.pin?.trapped
        ? "경찰차에 막혔습니다 · 빠져나가세요"
        : "포위됐습니다 · 열린 쪽으로 빠져나가세요";
      document.getElementById("arrest-count-bar").style.width =
        `${(1 - sim.arrest / CONFIG.arrestSeconds) * 100}%`;
    }
    const notice = document.querySelector("#notice");
    if (sim.escape.phase === "open" && sim.elapsed - sim.escape.openedAt < 4)
      notice.textContent = "ESCAPE ROUTE OPEN!";
    else if (sim.barricadeWarning)
      notice.textContent = `${Math.max(1, Math.ceil(sim.barricadeWarning.time - sim.elapsed))}초 후 전방 도로 통제 · 다른 도로로 우회하세요`;
    else notice.textContent = "";
    const guidance = document.querySelector("#escape-guidance");
    guidance.hidden = !escapeView;
    if (escapeView) {
      document.querySelector("#escape-arrow").style.transform =
        `rotate(${escapeView.angle}deg)`;
      document.querySelector("#escape-distance").textContent =
        `${Math.ceil(escapeView.distance)} m`;
      document.querySelector("#escape-name").textContent = escapeView.name;
    }
  }
  // TARGET HUNT: the target's durability as a bar under the mission card
  // (red, shrinking, flashes on a hit). Built once, hidden otherwise.
  targetBar(sim) {
    const t = sim.target;
    let box = this.targetBox;
    if (!t) {
      if (box) box.hidden = true;
      return;
    }
    if (!box) {
      box = this.targetBox = document.createElement("div");
      box.id = "target-hud";
      box.innerHTML = '<span>TARGET</span><div class="bar"><i></i></div>';
      document.getElementById("mission-hud").append(box);
      const style = document.createElement("style");
      style.textContent = `#target-hud{margin-top:7px;display:flex;align-items:center;gap:8px}
#target-hud span{font:700 9px monospace;letter-spacing:2px;color:#ff6b7a}
#target-hud .bar{flex:1;min-width:110px;height:8px;background:#ffffff26;border:1px solid #ff4b5c;border-radius:2px;overflow:hidden}
#target-hud i{display:block;height:100%;background:linear-gradient(90deg,#ff4b5c,#ffb03a);transition:width .15s}
#target-hud.hit .bar{box-shadow:0 0 0 2px #fff6}`;
      document.head.append(style);
      this.targetFill = box.querySelector("i");
      this.lastTargetHits = 0;
    }
    box.hidden = false;
    this.targetFill.style.width = `${Math.max(0, t.health)}%`;
    if (t.hits !== this.lastTargetHits) {
      this.lastTargetHits = t.hits;
      box.classList.add("hit");
      clearTimeout(this.hitTimer);
      this.hitTimer = setTimeout(() => box.classList.remove("hit"), 160);
    }
  }
  // CITY CHAOS HUD: wanted stars (1-5), parcels carried, a short
  // combo / callout line under the top bar, and the screen-edge markers.
  // Built once; hidden outside CITY CHAOS.
  chaosHud(sim, marks = []) {
    const c = sim.chaos;
    document.body.classList.toggle("chaos", !!c);
    if (!this.chaosEls) {
      const carry = document.createElement("span");
      carry.id = "chaos-carry";
      document.getElementById("mission-hud").append(carry);
      const pop = document.createElement("div");
      pop.id = "chaos-pop";
      pop.setAttribute("aria-live", "polite");
      const box = document.createElement("div");
      box.id = "chaos-marks";
      box.setAttribute("aria-hidden", "true");
      const chips = Array.from({ length: 4 }, () => {
        const m = document.createElement("div");
        m.className = "cmark";
        m.innerHTML = "<i></i><b></b>";
        box.append(m);
        return m;
      });
      document.body.append(pop, box);
      this.chaosEls = { carry, pop, box, chips, stars: document.querySelector("#heat b"), popKey: "" };
    }
    const E = this.chaosEls;
    if (!c) {
      E.carry.hidden = true;
      E.pop.hidden = true;
      E.box.hidden = true;
      if (E.starsSet) {
        E.stars.textContent = "★ ★ ★";
        E.starsSet = false;
      }
      return;
    }
    const stars = "★".repeat(c.level) + "☆".repeat(5 - c.level);
    if (E.stars.textContent !== stars) E.stars.textContent = stars;
    E.starsSet = true;
    E.stars.classList.toggle("up", sim.elapsed - c.levelUpAt < 1.5);
    E.carry.hidden = c.carried <= 0;
    const carryText = `택배 ${c.carried}`;
    if (E.carry.textContent !== carryText) E.carry.textContent = carryText;
    // One line at a time: the running combo, else the latest callout.
    const now = sim.elapsed, k = c.combo;
    let text = "", kind = "";
    if (k.count >= 2 && now <= k.until) {
      text = `${k.label} ×${k.count}`;
      kind = k.count >= 10 ? "big" : "combo";
    } else {
      const f = c.feed[c.feed.length - 1];
      if (f && now - f.time < 1.8) (text = f.text), (kind = f.kind);
    }
    E.pop.hidden = !text || !!sim.result;
    if (text && E.popKey !== text) {
      E.popKey = text;
      E.pop.textContent = text;
      E.pop.className = kind;
      E.pop.style.animation = "none";
      void E.pop.offsetWidth;
      E.pop.style.animation = "";
    }
    E.box.hidden = !!sim.result;
    // (Markers that would overlap are stacked apart.)
    const W = innerWidth, H = innerHeight, placed = [];
    E.chips.forEach((m, i) => {
      const q = marks[i];
      m.hidden = !q;
      if (!q) return;
      let x = Math.min(0.95, Math.max(0.05, q.sx)) * W, y = Math.min(0.9, Math.max(0.26, q.sy)) * H;
      for (let n = 0; n < 4 && placed.some((o) => Math.hypot(o.x - x, o.y - y) < 46); n++) y += y > H * 0.6 ? -48 : 48;
      placed.push({ x, y });
      m.style.left = `${x.toFixed(0)}px`;
      m.style.top = `${y.toFixed(0)}px`;
      m.style.setProperty("--c", q.color);
      m.dataset.kind = q.kind;
      m.firstChild.style.transform = `rotate(${q.angle.toFixed(0)}deg)`;
      const label = `${q.distance}m`;
      if (m.lastChild.textContent !== label) m.lastChild.textContent = label;
    });
  }
  setWallet(amount) {
    this.elements["wallet-credits"].textContent =
      Math.round(amount).toLocaleString("ko-KR");
  }
  // HUD parts that depend on the mission (set once per mission change).
  setMissionHud(sim, number) {
    const def = sim.mission.definition,
      map = MAPS[def.mapId];
    this.elements["mission-number"].textContent =
      def.type === "chaos" ? "CITY CHAOS" : `MISSION / ${String(number).padStart(2, "0")}`;
    this.elements["time-label"].textContent =
      def.type === "chase" ? "도주 시간" : "주행 시간";
    document.body.classList.toggle("no-police", !sim.policeEnabled);
    document.querySelector("#district-name").textContent = map.label;
    document.querySelector("#district-tagline").textContent = map.tagline;
  }
  show(eyebrow, title, message, button) {
    this.overlay.hidden = false;
    this.overlay.classList.remove("chaos-res");
    document.body.classList.remove("playing");
    this.elements.eyebrow.textContent = eyebrow;
    this.elements.title.textContent = title;
    this.elements.message.textContent = message;
    this.elements["mission-details"].hidden = true;
    this.elements["result-details"].hidden = true;
    this.elements["ad-actions"].hidden = true;
    this.elements["next-mission"].hidden = true;
    this.elements["open-select"].hidden = true;
    this.elements["chaos-result"].hidden = true;
    this.elements["result-vehicle"].hidden = true;
    document.getElementById("pause-exit").hidden = true;
    // Settings (fullscreen, sound, PIP, materials, FPS): briefing and pause.
    const settings = document.getElementById("settings");
    if (settings) settings.hidden = true;
    this.confirmExit(false);
    this.start.textContent = button;
    this.start.focus({ preventScroll: true });
  }
  showMission(sim, { vehicle, number = 1 } = {}) {
    const mission = sim.mission.definition;
    this.show(
      `MISSION ${String(number).padStart(2, "0")} · ${MAPS[mission.mapId].name}`,
      mission.title,
      mission.objective,
      "START →",
    );
    this.elements["mission-details"].hidden = false;
    this.elements["open-select"].hidden = false;
    document.getElementById("settings").hidden = false;
    document.querySelector("#mission-goal").textContent = mission.objective;
    document.querySelector("#mission-limit").textContent = limitText(mission);
    document.querySelector("#mission-reward").textContent =
      mission.type === "chaos" ? "점수 · 코인(수집·파괴·타깃)" : `${mission.reward.amount} 코인`;
    if (vehicle)
      document.querySelector("#mission-vehicle").textContent = vehicle.name;
  }
  // Developer vehicle picker (briefing only): a card per car with its
  // design ratings; onPick(id) is called with the chosen car.
  showVehiclePicker(list, current, onPick) {
    const box = document.querySelector("#vehicle-picker"), grid = document.querySelector("#vehicle-grid");
    if (!box || !grid) return;
    const labels = [["speed", "속도"], ["accel", "가속"], ["handling", "조향"], ["mass", "중량"], ["destroy", "파괴"], ["durability", "내구"]];
    grid.innerHTML = "";
    for (const v of list) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "vp-card" + (v.id === current ? " current" : "");
      b.setAttribute("role", "option");
      b.setAttribute("aria-selected", String(v.id === current));
      const bars = labels
        .map(([k, n]) => `<span class="vp-row"><small>${n}</small><i>${"<b></b>".repeat(v.ratings[k])}${"<u></u>".repeat(5 - v.ratings[k])}</i></span>`)
        .join("");
      // The car's picture (pre-rendered from its real model,
      // scripts/thumbs.cjs), name, what it is good at, its ratings.
      b.innerHTML = `<img src="${import.meta.env.BASE_URL}vehicles/${v.id}.webp" alt="" width="240" height="150" loading="lazy" decoding="async"><strong>${v.name}</strong><em>${v.role || ""}</em>${bars}`;
      b.addEventListener("click", () => onPick(v.id));
      grid.appendChild(b);
    }
    box.hidden = false;
  }
  hideVehiclePicker() {
    const box = document.querySelector("#vehicle-picker");
    if (box) box.hidden = true;
  }
  hide() {
    this.hideVehiclePicker();
    this.overlay.hidden = true;
    document.body.classList.add("playing");
  }
  showPause() {
    this.show(
      "TAKE A BREATHER",
      "잠시 정차 중.",
      "준비되면 다시 도시로 돌아가세요.",
      "계속 달리기 →",
    );
    // Leave the run for the mission select (after a confirmation).
    document.getElementById("pause-exit").hidden = false;
    document.getElementById("settings").hidden = false;
  }
  // The "Return to Mission Select?" confirmation over the pause popup.
  confirmExit(open) {
    const box = document.getElementById("exit-confirm");
    if (!box) return;
    box.hidden = !open;
    this.overlay.classList.toggle("confirming", open);
    if (open) document.getElementById("exit-cancel").focus({ preventScroll: true });
  }
  // Result screen. `info`: { earned, hasNext, ads: { continue, double } }
  // where each ad state is "hidden", "disabled" or "ready".
  gameover(sim, info = {}) {
    const def = sim.mission.definition;
    if (def.type === "chaos") return this.chaosResult(sim, info);
    if (def.type === "chase") {
      this.best = Math.max(this.best, Math.floor(sim.elapsed));
      try {
        localStorage.setItem("chase-city-best", String(this.best));
      } catch {}
    }
    if (sim.result === "success") {
      this.show(
        def.type === "chase" ? "ESCAPED!" : "MISSION COMPLETE!",
        def.type === "chase" ? "도시 탈출 성공!" : `${def.title} 성공!`,
        `${def.title} 완료 · 보상 ${sim.credits} 코인 획득`,
        "다시 도전 →",
      );
    } else {
      const titles = {
        arrested: ["BUSTED!", "경찰에게 체포됨"],
        destroyed: ["WRECKED!", "차량 파괴"],
        timeout: ["TIME OUT!", "시간 초과"],
      };
      const [eyebrow, title] = titles[sim.result] || ["FAILED", "미션 실패"];
      const why = {
        arrested: sim.pin?.trapped
          ? "경찰차에 막혀 빠져나오지 못했습니다."
          : "포위에서 빠져나오지 못했습니다.",
        destroyed: "차량 내구도가 모두 소진됐습니다.",
        timeout: "제한 시간 안에 목표를 채우지 못했습니다.",
      }[sim.result];
      const detail =
        def.type === "chase"
          ? `도주 ${formatTime(sim.elapsed)} · 최고 기록 ${formatTime(this.best)}`
          : `${def.progressLabel} ${sim.mission.progress} / ${def.target}${def.unit}`;
      this.show(eyebrow, title, `${why} ${detail}`, "RESTART →");
    }
    this.showResultDetails(sim, info);
  }
  // CITY CHAOS result: BUSTED / WRECKED, the score (and personal best),
  // what the run did. RETRY, vehicle select, mission select.
  chaosResult(sim, info = {}) {
    const c = sim.chaos, e = this.elements;
    const busted = sim.result === "arrested";
    const why = busted
      ? sim.pin?.trapped ? "경찰차에 막혀 빠져나오지 못했습니다." : "포위에서 빠져나오지 못했습니다."
      : "차량 내구도가 모두 소진됐습니다.";
    this.show(busted ? "BUSTED!" : "WRECKED!", busted ? "체포됨" : "차량 파괴", why, "RETRY →");
    e["chaos-result"].hidden = false;
    this.overlay.classList.add("chaos-res");
    const set = (id, v) => (document.getElementById(id).textContent = v);
    set("cr-score", c.score.toLocaleString("en-US"));
    const best = info.previousBest ?? 0;
    document.getElementById("cr-best").hidden = !(c.score > best);
    set("cr-prev", best > 0 ? `최고 기록 ${Math.max(best, c.score).toLocaleString("en-US")}` : "첫 기록");
    set("cr-time", formatTime(sim.elapsed));
    set("cr-wanted", "★".repeat(c.maxLevel));
    set("cr-combo", c.combo.best >= 2 ? `×${c.combo.best}` : "-");
    set("cr-police", c.counts.police);
    set("cr-civilian", c.counts.civilian);
    set("cr-facilities", c.counts.facilities);
    set("cr-targets", c.counts.targets);
    set("cr-parcels", `${c.counts.parcels} · ${c.delivered || 0}`);
    // (No parcels in this CITY CHAOS build: the row is left out.)
    document.getElementById("cr-parcels").parentElement.hidden = !sim.pickups.length && !c.counts.parcels;
    set("cr-coins", `+${(info.earned ?? sim.runCoins).toLocaleString("ko-KR")}`);
    e["open-select"].hidden = false;
    e["result-vehicle"].hidden = false;
    this.setAds(info.ads || {});
  }
  showResultDetails(sim, info = {}) {
    if (sim.mission.definition.type === "chaos") return this.chaosResult(sim, info);
    const e = this.elements;
    e["result-details"].hidden = false;
    e["result-time"].textContent = formatTime(sim.elapsed);
    const rows = tallyRows(sim.tally);
    e["result-destroyed"].replaceChildren(
      ...(rows.length
        ? rows.map((r) => {
            const li = document.createElement("li");
            li.textContent = r.text;
            li.dataset.kind = r.kind;
            return li;
          })
        : [
            Object.assign(document.createElement("li"), {
              className: "none",
              textContent: "없음",
            }),
          ]),
    );
    e["result-earned"].textContent = `+${credits(info.earned ?? sim.credits)}` + (sim.runCoins ? ` (주행·파괴 ${sim.runCoins})` : "");
    e["next-mission"].hidden = !info.hasNext;
    e["open-select"].hidden = false;
    this.setAds(info.ads || {});
  }
  // Ad buttons: "hidden" (no ad system), "disabled" (development view of a
  // not-yet-connected placement), "ready", or "used".
  setAds({ continue: cont = "hidden", double: dbl = "hidden", note = "" }) {
    const e = this.elements;
    const apply = (button, state, readyText, usedText) => {
      button.hidden = state === "hidden";
      button.disabled = state !== "ready";
      button.dataset.state = state;
      if (state === "used") button.firstChild.textContent = usedText;
      else if (state === "disabled")
        button.firstChild.textContent = "광고 미연동 · ";
      else button.firstChild.textContent = readyText;
    };
    apply(e["ad-continue"], cont, "광고 보고 이어하기 ", "이어하기 사용함 ");
    apply(e["ad-double"], dbl, "광고 보고 보상 2배", "보상 2배 받음");
    if (dbl === "disabled")
      e["ad-double"].firstChild.textContent = "광고 미연동 · 보상 2배";
    if (cont === "disabled")
      e["ad-continue"].firstChild.textContent = "광고 미연동 · 이어하기 ";
    e["ad-actions"].hidden = cont === "hidden" && dbl === "hidden";
    e["ad-note"].textContent = note;
  }
  // Mission select list. `entries`: [{ id, number, record }] in display
  // order; `onPick(id)` when one is chosen.
  showSelect(entries, currentId, onPick) {
    const list = this.elements["mission-list"];
    list.replaceChildren(
      ...entries.map(({ id, number, record }) => {
        const m = MISSIONS[id];
        const li = document.createElement("li");
        const b = document.createElement("button");
        b.className = "mission-card";
        b.dataset.mission = id;
        if (id === currentId) b.setAttribute("aria-current", "true");
        const tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = `${String(number).padStart(2, "0")} · ${TYPE_TAGS[m.type] || m.type.toUpperCase()}`;
        const title = document.createElement("strong");
        title.textContent = m.title;
        const reward = document.createElement("span");
        reward.className = "reward";
        reward.textContent = `+${m.reward.amount}`;
        const meta = document.createElement("span");
        meta.className = "meta";
        meta.textContent = [
          MAPS[m.mapId].name,
          `제한 시간 ${limitText(m)}`,
          record?.clears
            ? `클리어 ${record.clears}회`
            : record?.plays
              ? `도전 ${record.plays}회`
              : "처음 도전",
        ].join(" · ");
        b.append(tag, reward, title, meta);
        b.addEventListener("click", () => onPick(id));
        li.append(b);
        return li;
      }),
    );
    this.elements["mission-select"].hidden = false;
    list.querySelector("[aria-current]")?.focus({ preventScroll: true });
  }
  hideSelect() {
    this.elements["mission-select"].hidden = true;
  }
}
