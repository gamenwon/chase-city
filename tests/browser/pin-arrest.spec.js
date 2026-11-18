import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

// Pin arrest in the real game page: a moment recorded on the code before the
// fix (the player boxed in by parked police cars, never arrested while the
// speedometer still showed the throttle speed) is put into the running game.
// The game then runs on its own frame loop with the throttle on and no
// steering. Expected: the car does not move, the 3-2-1 countdown shows,
// BUSTED. A recorded moment where a way out existed must not be arrested.
const OUT = "test-results/pin";

async function stage(page, name) {
  await page.goto("/?debug");
  await page.waitForFunction(() => window.__CHASE__);
  await page.locator("#start").click();
  await expect(page.locator("#overlay")).toBeHidden();
  await page.waitForTimeout(300);
  return page.evaluate(async (name) => {
    const { makePolice } = await import("/src/game/police.js");
    const fx = await (await fetch(`/tests/fixtures/${name}.json`)).json();
    const s = window.__CHASE__.sim;
    s.reinforcementsEnabled = false;
    s.barricadesEnabled = false;
    s.barricades = [];
    s.staticSolids.push(...fx.extraSolids);
    const byId = new Map(s.city.props.map((q) => [q.id, q]));
    for (const q of fx.props) Object.assign(byId.get(q.id) || {}, q);
    s.city.grid = new Map();
    for (const q of s.city.props) {
      const k = s.city.key(q.x, q.z);
      if (!s.city.grid.has(k)) s.city.grid.set(k, []);
      s.city.grid.get(k).push(q);
    }
    s.city.parking = [];
    s.city.pedestrians = [];
    s.city.traffic = fx.traffic.map((t) => ({
      lane: { axis: "x", line: 0, dir: 1 },
      cruise: 0,
      timer: 999,
      ...t,
      state: t.state === "wreck" ? "wreck" : "yield",
    }));
    s.refreshNavigation();
    Object.assign(s.player, fx.player);
    s.previousPlayer = { x: s.player.x, z: s.player.z };
    // The police as recorded, staying where they stood.
    s.police = fx.police.map((c) =>
      Object.assign(makePolice(c.id, c.generation), c, { stunTimer: 1e9 }),
    );
    s.cordon = null;
    s.roadblock = null;
    s.cordonCooldownUntil = Infinity;
    s.roadblockCooldownUntil = Infinity;
    s.openEscape = () => {};
    s.arrest = 0;
    s.motionSamples = [];
    s.pin.samples = [];
    // Record what the player sees, every animation frame.
    const log = (window.__pinLog = []);
    const t0 = s.elapsed;
    const start = { x: s.player.x, z: s.player.z };
    const watch = () => {
      const box = document.getElementById("arrest-countdown");
      log.push({
        t: +(s.elapsed - t0).toFixed(3),
        moved: +Math.hypot(s.player.x - start.x, s.player.z - start.z).toFixed(3),
        speedo: Number(document.querySelector("#speed strong").textContent),
        countdown: box.hidden ? null : document.getElementById("arrest-count").textContent,
        why: box.hidden ? null : document.getElementById("arrest-why").textContent,
        arrest: +s.arrest.toFixed(3),
        pin: s.pin.reason,
        result: s.result,
      });
      if (!s.result || log.at(-2)?.result !== s.result) requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
    return { source: fx.source, oldRule: fx.oldRule };
  }, name);
}

// pinned-1100-roads-5 is not used: the full game gets out by knocking the
// lamp beside it over (see tests/pin-arrest.test.js).
for (const name of ["pinned-1100-evasive-11", "pinned-390-roads-9"])
  test(`boxed in by police (${name}): throttle on but no movement -> 3-2-1 countdown -> BUSTED`, async ({
    page,
  }, info) => {
    test.setTimeout(240000);
    const meta = await stage(page, name);
    expect(meta.oldRule.cordonSealed).toBe(false);
    // Countdown visible at "3", then "1", then BUSTED.
    await expect(page.locator("#arrest-countdown")).toBeVisible({ timeout: 90000 });
    await expect(page.locator("#arrest-count")).toHaveText("3");
    await expect(page.locator("#arrest-why")).toContainText("경찰차에 막혔습니다");
    await page.screenshot({ path: `${OUT}/${info.project.name}-${name}-countdown3.png` });
    await expect(page.locator("#arrest-count")).toHaveText("1", { timeout: 60000 });
    await page.screenshot({ path: `${OUT}/${info.project.name}-${name}-countdown1.png` });
    await expect(page.locator("#eyebrow")).toHaveText("BUSTED!", { timeout: 60000 });
    await page.screenshot({ path: `${OUT}/${info.project.name}-${name}-busted.png` });
    const log = await page.evaluate(() => window.__pinLog);
    mkdirSync(OUT, { recursive: true });
    writeFileSync(
      `${OUT}/${info.project.name}-${name}-log.json`,
      JSON.stringify(log),
    );
    // Stuck while "driving": the whole time before the countdown the car
    // moved under a metre, while the speedometer showed a speed.
    const before = log.filter((r) => r.countdown === null && !r.result);
    expect(before.length).toBeGreaterThan(5);
    expect(Math.max(...before.map((r) => r.moved))).toBeLessThan(1);
    const counting = log.filter((r) => r.countdown !== null);
    expect(new Set(counting.map((r) => r.countdown))).toEqual(new Set(["3", "2", "1"]));
    // It counted down without restarting (game seconds).
    const span = counting.at(-1).t - counting[0].t;
    expect(span).toBeGreaterThan(2.7);
    expect(span).toBeLessThan(3.3);
    for (let i = 1; i < counting.length; i++)
      expect(counting[i].arrest).toBeGreaterThanOrEqual(counting[i - 1].arrest);
    // Pinned after 2-3 s of no movement.
    expect(counting[0].t).toBeGreaterThanOrEqual(2);
    expect(counting[0].t).toBeLessThan(3.6);
    expect(log.at(-1).result).toBe("arrested");
    info.annotations.push({
      type: "speedometer",
      description: `max shown while stuck ${Math.max(...before.map((r) => r.speedo))} km/h, moved ${Math.max(...before.map((r) => r.moved))} m`,
    });
  });

test("stuck but a real way out exists (stuck-open-1100-roads-8): no countdown, no arrest", async ({
  page,
}, info) => {
  test.setTimeout(240000);
  await stage(page, "stuck-open-1100-roads-8");
  await page.waitForFunction(
    () => (window.__pinLog.at(-1)?.t ?? 0) >= 9,
    null,
    { timeout: 180000 },
  );
  const log = await page.evaluate(() => window.__pinLog);
  expect(log.every((r) => r.countdown === null && r.result === null)).toBe(true);
  await page.screenshot({ path: `${OUT}/${info.project.name}-stuck-open.png` });
});
