// V2.0 player progress: game credits, mission records, cars.
//
// Game credits are an in-game currency only. They are NOT point-app points:
// nothing here pays out, converts or reports points. If the app ever grants
// points for play, that must be a separate, server-verified path; this file
// must not be used for it.
//
// Stored in the browser (localStorage) as one versioned JSON object. Storage
// can be missing or blocked (private mode, previews): every read and write is
// guarded, and the game then simply keeps progress for the session.

const KEY = "chase-city-progress";
export const PROGRESS_VERSION = 1;

export function emptyProgress() {
  return {
    version: PROGRESS_VERSION,
    credits: 0,
    missions: {}, // id -> { plays, clears, bestTime }
    vehicles: { owned: ["starter"], selected: "starter" },
    lastMission: null,
    // Run ids already paid, so a reward is granted once even if the result
    // screen is shown again (last few only).
    paidRuns: [],
  };
}

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
  };
}

export class Progress {
  constructor(storage) {
    this.storage = storage;
    if (!this.storage)
      try {
        this.storage = globalThis.localStorage;
        this.storage.getItem(KEY);
      } catch {
        this.storage = null;
      }
    this.storage ||= memoryStorage();
    this.data = this.load();
  }
  load() {
    try {
      const raw = this.storage.getItem(KEY);
      const saved = raw ? JSON.parse(raw) : null;
      if (saved?.version === PROGRESS_VERSION)
        return { ...emptyProgress(), ...saved };
    } catch {}
    return emptyProgress();
  }
  save() {
    try {
      this.storage.setItem(KEY, JSON.stringify(this.data));
    } catch {}
  }
  get credits() {
    return this.data.credits;
  }
  get selectedVehicle() {
    return this.data.vehicles.selected;
  }
  setLastMission(id) {
    this.data.lastMission = id;
    this.save();
  }
  // Record a finished run and pay its credits once. `runKey` identifies the
  // run (e.g. "<session>:<runNumber>"); a second call for the same run with
  // the same `part` adds nothing. `part` lets one run pay twice on purpose
  // (base reward, then the ad double) without paying either twice.
  pay(runKey, part, amount) {
    const key = `${runKey}:${part}`;
    if (!(amount > 0) || this.data.paidRuns.includes(key)) return 0;
    this.data.paidRuns.push(key);
    if (this.data.paidRuns.length > 20) this.data.paidRuns.shift();
    this.data.credits += amount;
    this.save();
    return amount;
  }
  recordRun(missionId, { success, time }) {
    const r = (this.data.missions[missionId] ||= {
      plays: 0,
      clears: 0,
      bestTime: null,
    });
    r.plays++;
    if (success) {
      r.clears++;
      if (r.bestTime === null || time < r.bestTime) r.bestTime = time;
    }
    this.save();
    return r;
  }
  missionRecord(missionId) {
    return this.data.missions[missionId] || null;
  }
}
