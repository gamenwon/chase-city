// V2.0 destruction record for the mission result screen.
//
// Counted from real game events as they happen (city events arrive through
// sim.onCityEvent), only what the player destroyed, and each object at most once: the key is the kind
// plus the object's own id, so a trash can kicked again while lying on the
// road, or a wreck that comes back into range, is never counted twice.

// Display order and Korean labels (with the counter word) per kind.
export const DESTRUCTIBLES = Object.freeze({
  trash: { label: "쓰레기통", unit: "개" },
  sign: { label: "표지판", unit: "개" },
  lamp: { label: "가로등", unit: "개" },
  tree: { label: "가로수", unit: "그루" },
  traffic: { label: "일반 차량", unit: "대" },
});

export function createTally() {
  return { seen: new Set(), counts: {}, total: 0, log: [] };
}

function add(tally, kind, id, time) {
  const key = `${kind}:${id}`;
  if (tally.seen.has(key)) return false;
  tally.seen.add(key);
  tally.counts[kind] = (tally.counts[kind] || 0) + 1;
  tally.total++;
  tally.log.push({ kind, id, time });
  return true;
}

// One city event (see city.js event()). Returns true if it added a count.
export function recordCityEvent(tally, e) {
  if (!e.byPlayer || e.targetId === undefined) return false;
  if (e.type === "prop" && e.action === "break" && DESTRUCTIBLES[e.kind])
    return add(tally, e.kind, e.targetId, e.time);
  if (e.type === "traffic" && e.action === "wreck")
    return add(tally, "traffic", e.targetId, e.time);
  return false;
}

// Rows for the result screen, in display order, only kinds with a count.
export function tallyRows(tally) {
  return Object.entries(DESTRUCTIBLES)
    .filter(([kind]) => tally.counts[kind])
    .map(([kind, d]) => ({
      kind,
      label: d.label,
      count: tally.counts[kind],
      text: `${d.label} ${tally.counts[kind]}${d.unit}`,
    }));
}
