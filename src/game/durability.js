// Player vehicle durability (restored). Each car has its own maximum HP
// and resistances (vehicles.js: maxHp, resist); everything that can hurt
// the player goes through hurt() with a category, so the damage rules live
// in one place:
//
//   prop      signs, chairs, lamps, trees, stalls, small props    0
//   shop      a storefront smashed                                0-1
//   civilian  a civilian car hit                                  1-3
//   police    a police car hit (head-on at speed: heavy, 5-8)     2-4
//   wall      a building wall at speed                            3-5
//   heavy     a falling container / sculpture / beam, a statue    4-6
//   blast     an explosion (distance, strength)                   5-10
//   fall      a bridge span coming down, a fall off a deck        8-12
//
// (HP for a 100 HP car; each car's resistance scales its category, so a
// bulldozer barely notices a civilian car; damage is in HP, the HUD shows
// the share of the car's own maximum.)
//
// Protection against unfair stacking:
//   - a minimum impact speed per category (scraping does nothing);
//   - a cooldown per source (the same car, wall or blast hurts once per
//     DAMAGE.cooldown: staying in contact never drains HP every frame);
//   - each explosion event hurts once;
//   - at most DAMAGE.windowCap HP (before resistance) within
//     DAMAGE.window seconds, so overlapping chain-reaction blasts are
//     dangerous but never an instant wreck.
export const DAMAGE = Object.freeze({
  cooldown: 1.2,
  window: 0.8,
  windowCap: 14,
  min: { civilian: 7, police: 6, wall: 14 },
  base: {
    civilian: (closing) => 1 + Math.min(2, (closing - 7) / 7),
    // (closing: relative speed; a ram of the player's own at 20 m/s or more
    // into a police car is a heavy head-on: hurtPolice.)
    police: (closing) => (closing < 10 ? 1 : 2 + Math.min(2, (closing - 10) / 7)),
    wall: (impact) => 3 + Math.min(2, (impact - 14) / 6),
  },
  received: 0.6, // a police car ramming the player hurts this much less
  // Repair pickups (repairs.js) and the share they restore.
  repair: 0.25,
});

export function resetDurability(sim) {
  const s = sim.vehicle?.stats || {};
  sim.maxHp = s.maxHp || 100;
  sim.hp = sim.maxHp;
  sim.health = 100;
  sim.damageLog = []; // { t, base } within the window
  sim.damageKeys = new Map(); // source -> last time
  sim.damageStats = { taken: 0, byKind: {}, blocked: 0, repairs: 0, repaired: 0 };
}

// Hurt the player: kind (see above), base HP for a 100 HP car, key: the
// source (for the per-source cooldown), or null.
export function hurt(sim, kind, base, key = null) {
  if (!sim.hp || sim.result || !(base > 0)) return 0;
  const now = sim.elapsed;
  if (key != null) {
    const last = sim.damageKeys.get(key);
    if (last != null && now - last < DAMAGE.cooldown) {
      sim.damageStats.blocked++;
      return 0;
    }
    sim.damageKeys.set(key, now);
    if (sim.damageKeys.size > 200) sim.damageKeys.clear();
  }
  sim.damageLog = sim.damageLog.filter((d) => now - d.t < DAMAGE.window);
  const used = sim.damageLog.reduce((a, d) => a + d.base, 0);
  const allowed = Math.max(0, DAMAGE.windowCap - used);
  if (allowed <= 0) {
    sim.damageStats.blocked++;
    return 0;
  }
  base = Math.min(base, allowed);
  sim.damageLog.push({ t: now, base });
  const resist = sim.vehicle?.stats.resist?.[kind] ?? 1;
  const hp = base * resist;
  sim.hp = Math.max(0, sim.hp - hp);
  sim.health = (sim.hp / sim.maxHp) * 100;
  sim.collisions++;
  sim.lastHitAt = now;
  sim.damageStats.taken += hp;
  sim.damageStats.byKind[kind] = (sim.damageStats.byKind[kind] || 0) + hp;
  return hp;
}
// Impact-based categories: below the threshold nothing happens.
export function hurtImpact(sim, kind, speed, key) {
  if (speed < (DAMAGE.min[kind] ?? 0)) return 0;
  return hurt(sim, kind, DAMAGE.base[kind](speed), key);
}
// A police car contact: the player's own head-on ram at speed is heavy
// (5-8); being rammed hurts less than ramming.
export function hurtPolice(sim, closing, ownHit, key) {
  if (closing < DAMAGE.min.police) return 0;
  let base = ownHit >= 20 ? 5 + Math.min(3, (ownHit - 20) / 5) : DAMAGE.base.police(closing);
  if (ownHit < closing * 0.5) base *= DAMAGE.received;
  return hurt(sim, "police", base, key);
}
export function heal(sim, share) {
  const before = sim.hp;
  sim.hp = Math.min(sim.maxHp, sim.hp + sim.maxHp * share);
  sim.health = (sim.hp / sim.maxHp) * 100;
  sim.damageStats.repairs++;
  sim.damageStats.repaired += sim.hp - before;
  return sim.hp - before;
}
