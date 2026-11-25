import { test, expect } from "@playwright/test";

// CITY CHAOS in the real game page: everything at once, the HUD, the
// result screen, the vehicle select pictures, and the other missions left
// as they were.
async function open(page, query = "?debug&seed=3") {
  await page.goto(`/${query}`);
  await page.waitForFunction(() => window.__CHASE__);
}

test("CITY CHAOS: police, target, parcels, coins at once; parcel delivered while chased; HUD; result screen", async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.__CHASE__.chooseMission("cityChaos"));
  await expect(page.locator("#title")).toHaveText("CITY CHAOS");
  await page.locator("#start").click();
  await page.waitForTimeout(600);
  const s0 = await page.evaluate(() => {
    const { sim } = window.__CHASE__;
    return { police: sim.police.filter((c) => c.state === "active").length, target: sim.target?.state, parcels: sim.pickups.filter((q) => !q.taken).length, coins: sim.coins.length, level: sim.chaos.level };
  });
  expect(s0.police).toBeGreaterThan(0);
  expect(["waiting", "fleeing"]).toContain(s0.target);
  expect(s0.parcels).toBeGreaterThan(0);
  expect(s0.coins).toBeGreaterThan(20);
  await expect(page.locator("#mission-number")).toHaveText("CITY CHAOS");
  await expect(page.locator("#heat b")).toHaveText("★☆☆☆☆");
  // Pick up a parcel: the carried counter and a drop-off appear.
  await page.evaluate(() => {
    const { sim } = window.__CHASE__;
    sim.arrest = 0;
    const q = sim.pickups.find((x) => !x.taken);
    Object.assign(sim.player, { x: q.x, z: q.z });
    sim.previousPlayer = { x: q.x, z: q.z };
  });
  await expect(page.locator("#chaos-carry")).toHaveText("택배 1");
  // Deliver it: the run goes on, the city is the same city.
  const before = await page.evaluate(() => {
    const { sim } = window.__CHASE__;
    sim.arrest = 0;
    const d = sim.chaos.delivery;
    Object.assign(sim.player, { x: d.x, z: d.z });
    sim.previousPlayer = { x: d.x, z: d.z };
    return { seed: sim.layout.seed, run: sim.runNumber };
  });
  await expect(page.locator("#chaos-carry")).toBeHidden();
  const after = await page.evaluate(() => {
    const { sim } = window.__CHASE__;
    return { seed: sim.layout.seed, run: sim.runNumber, deliveries: sim.chaos.counts.deliveries, result: sim.result };
  });
  expect(after).toEqual({ ...before, deliveries: 1, result: null });
  // BUSTED: the result screen sums it up.
  await page.evaluate(() => (window.__CHASE__.sim.arrest = 99));
  await expect(page.locator("#eyebrow")).toHaveText("BUSTED!");
  await expect(page.locator("#chaos-result")).toBeVisible();
  await expect(page.locator("#cr-parcels")).toHaveText(/^1 · 1$/);
  await expect(page.locator("#start")).toHaveText("RETRY →");
  await expect(page.locator("#result-vehicle")).toBeVisible();
  await expect(page.locator("#open-select")).toBeVisible();
});

test("vehicle select shows the real model pictures, durability and the selected car", async ({ page }) => {
  await open(page);
  await page.locator("#pick-vehicle").click();
  const cards = page.locator(".vp-card");
  await expect(cards).toHaveCount(9);
  const imgs = await page.evaluate(async () => {
    const list = [...document.querySelectorAll(".vp-card img")];
    await Promise.all(list.map((i) => (i.complete ? null : new Promise((r) => (i.onload = i.onerror = r)))));
    return list.map((i) => i.naturalWidth);
  });
  expect(imgs.every((w) => w > 100)).toBe(true);
  await expect(cards.first().locator(".vp-row small").last()).toHaveText("내구");
  await expect(page.locator(".vp-card.current")).toHaveCount(1);
});

test("other missions stay as they were (no CITY CHAOS HUD or systems)", async ({ page }) => {
  await open(page);
  for (const id of ["survival60", "parcels", "targetHunt"]) {
    await page.evaluate((id) => window.__CHASE__.chooseMission(id), id);
    await page.locator("#start").click();
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({ chaos: !!window.__CHASE__.sim.chaos, body: document.body.classList.contains("chaos"), stars: document.querySelector("#heat b").textContent }));
    expect(r).toEqual({ chaos: false, body: false, stars: "★ ★ ★" });
    await page.keyboard.press("p");
  }
});

test("pause popup: MISSION SELECT asks first, CANCEL stays paused, CONFIRM ends the run and opens the mission list", async ({ page }) => {
  await open(page);
  for (const id of ["cityChaos", "parcels"]) {
    await page.evaluate((id) => window.__CHASE__.chooseMission(id), id);
    await page.locator("#start").click();
    await page.waitForTimeout(800);
    await page.evaluate(() => (window.__CHASE__.sim.runCoins += 5));
    await page.keyboard.press("p");
    await expect(page.locator("#pause-exit")).toBeVisible();
    await expect(page.locator("#start")).toBeVisible(); // resume kept
    await page.locator("#pause-exit").click();
    await expect(page.locator("#exit-confirm")).toBeVisible();
    await expect(page.locator("#exit-title")).toHaveText("Return to Mission Select?");
    await page.locator("#exit-cancel").click();
    await expect(page.locator("#exit-confirm")).toBeHidden();
    expect(await page.evaluate(() => window.__CHASE__.state)).toBe("paused");
    const wallet = await page.evaluate(() => window.__CHASE__.progress.credits);
    const t = await page.evaluate(() => window.__CHASE__.sim.elapsed);
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.__CHASE__.sim.elapsed)).toBe(t); // still paused
    await page.locator("#pause-exit").click();
    await page.locator("#exit-ok").click();
    await expect(page.locator("#mission-select")).toBeVisible();
    const r = await page.evaluate(() => ({ state: window.__CHASE__.state, started: window.__CHASE__.sim.started, elapsed: window.__CHASE__.sim.elapsed, credits: window.__CHASE__.progress.credits }));
    expect(r.state).toBe("ready");
    expect(r.started).toBe(false);
    expect(r.elapsed).toBe(0);
    expect(r.credits).toBeGreaterThanOrEqual(wallet + 5); // coins kept, once
    await page.locator("#close-select").click();
  }
});
