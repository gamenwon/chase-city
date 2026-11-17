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
const credits = (n) => `${Math.round(n).toLocaleString("ko-KR")} 크레딧`;
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
      ].map((id) => [id, document.getElementById(id)]),
    );
    try {
      this.best = Number(localStorage.getItem("chase-city-best")) || 0;
    } catch {}
  }
  update(sim, escapeView = null) {
    const e = this.elements;
    e.time.textContent = formatTime(sim.elapsed);
    e.health.textContent = `${Math.ceil(sim.health)}%`;
    e["health-bar"].style.width = `${sim.health}%`;
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
  setWallet(amount) {
    this.elements["wallet-credits"].textContent =
      Math.round(amount).toLocaleString("ko-KR");
  }
  // HUD parts that depend on the mission (set once per mission change).
  setMissionHud(sim, number) {
    const def = sim.mission.definition,
      map = MAPS[def.mapId];
    this.elements["mission-number"].textContent =
      `MISSION / ${String(number).padStart(2, "0")}`;
    this.elements["time-label"].textContent =
      def.type === "chase" ? "도주 시간" : "주행 시간";
    document.body.classList.toggle("no-police", !sim.policeEnabled);
    document.querySelector("#district-name").textContent = map.label;
    document.querySelector("#district-tagline").textContent = map.tagline;
  }
  show(eyebrow, title, message, button) {
    this.overlay.hidden = false;
    document.body.classList.remove("playing");
    this.elements.eyebrow.textContent = eyebrow;
    this.elements.title.textContent = title;
    this.elements.message.textContent = message;
    this.elements["mission-details"].hidden = true;
    this.elements["result-details"].hidden = true;
    this.elements["ad-actions"].hidden = true;
    this.elements["next-mission"].hidden = true;
    this.elements["open-select"].hidden = true;
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
    document.querySelector("#mission-goal").textContent = mission.objective;
    document.querySelector("#mission-limit").textContent = limitText(mission);
    document.querySelector("#mission-reward").textContent =
      `${mission.reward.amount} 크레딧`;
    if (vehicle)
      document.querySelector("#mission-vehicle").textContent = vehicle.name;
  }
  hide() {
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
  }
  // Result screen. `info`: { earned, hasNext, ads: { continue, double } }
  // where each ad state is "hidden", "disabled" or "ready".
  gameover(sim, info = {}) {
    const def = sim.mission.definition;
    if (def.type === "chase") {
      this.best = Math.max(this.best, Math.floor(sim.elapsed));
      try {
        localStorage.setItem("chase-city-best", String(this.best));
      } catch {}
    }
    if (sim.result === "success") {
      this.show(
        def.type === "chase" ? "ESCAPED!" : "MISSION CLEAR!",
        def.type === "chase" ? "도시 탈출 성공!" : `${def.title} 성공!`,
        `${def.title} 완료 · 보상 ${sim.credits} 크레딧 획득`,
        "다시 도전 →",
      );
    } else {
      const titles = {
        arrested: ["BUSTED!", "경찰에게 체포됨"],
        destroyed: ["WRECKED!", "차량 파괴"],
        timeout: ["TIME UP!", "시간 초과"],
      };
      const [eyebrow, title] = titles[sim.result] || ["FAILED", "미션 실패"];
      const why = {
        arrested: "포위에서 빠져나오지 못했습니다.",
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
  showResultDetails(sim, info = {}) {
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
    e["result-earned"].textContent = `+${credits(info.earned ?? sim.credits)}`;
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
