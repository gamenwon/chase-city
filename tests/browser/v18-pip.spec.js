import { test, expect } from "@playwright/test";

// V1.8 driver's-view PIP: default per device, toggles (button, V key,
// remembered), stays clear of the HUD and touch controls, really draws the
// bonnet view, and its cost is measured ON vs OFF on the real frame loop.
const HUD = [
  ".brand",
  ".stats",
  "#heat",
  "#mission-hud",
  "#speed",
  ".district",
  "#touch .steering",
  "#escape-guidance",
];

async function rects(page) {
  return page.evaluate((selectors) => {
    const box = (sel) => {
      const e = document.querySelector(sel);
      if (!e) return null;
      const b = e.getBoundingClientRect();
      return b.width && b.height
        ? { l: b.left, t: b.top, r: b.right, b: b.bottom }
        : null;
    };
    return {
      pip: box("#pip"),
      hud: Object.fromEntries(selectors.map((s) => [s, box(s)])),
      viewport: { w: innerWidth, h: innerHeight },
    };
  }, HUD);
}
const overlaps = (a, b) =>
  !!(a && b) && !(b.r <= a.l || b.l >= a.r || b.b <= a.t || b.t >= a.b);

// Mean and 95th percentile frame interval, and time spent drawing, over a
// window of real requestAnimationFrame frames.
async function sampleFrames(page, seconds) {
  return page.evaluate(async (seconds) => {
    const r = window.__CHASE__.renderer;
    const draw = [];
    const original = r.render.bind(r);
    r.render = (...args) => {
      const t = performance.now();
      original(...args);
      draw.push(performance.now() - t);
    };
    const intervals = [];
    await new Promise((done) => {
      let last = performance.now();
      const start = last;
      const tick = (now) => {
        intervals.push(now - last);
        last = now;
        if (now - start < seconds * 1000) requestAnimationFrame(tick);
        else done();
      };
      requestAnimationFrame(tick);
    });
    r.render = original;
    const stats = (xs) => {
      const sorted = [...xs].sort((a, b) => a - b);
      return {
        mean: +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2),
        p95: +sorted[Math.floor(sorted.length * 0.95)].toFixed(2),
      };
    };
    return {
      frames: intervals.length,
      fps: +(1000 / stats(intervals).mean).toFixed(1),
      interval: stats(intervals),
      draw: stats(draw),
      pipPassMs: +r.bonnet.lastPassMs.toFixed(2),
      mainDrawCalls: r.lastMainCalls,
      pipDrawCalls: r.pipEnabled ? r.bonnet.lastPassCalls : 0,
    };
  }, seconds);
}

test("V1.8 bonnet-view PIP: device default, toggles, HUD-safe layout, real drawing and ON/OFF cost", async ({
  page,
}, info) => {
  test.setTimeout(600000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?debug&mission=survival60");
  const mobile = info.project.name.includes("iphone");
  const toggle = page.locator("#pip-toggle");
  // Desktop starts with the PIP on, phones and touch screens with it off.
  await expect(toggle).toHaveAttribute(
    "aria-pressed",
    mobile ? "false" : "true",
  );
  await page.evaluate(() => {
    const r = window.__CHASE__.renderer;
    r.renderer.setPixelRatio(0.5);
    r.renderer.setSize(innerWidth, innerHeight);
    r.renderer.shadowMap.autoUpdate = false;
  });
  // Not shown on the briefing screen, only while driving.
  expect((await rects(page)).pip).toBe(null);
  await page.locator("#start").click();
  await page.waitForFunction(() => window.__CHASE__.sim.elapsed > 1);
  if (mobile) await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await page.waitForFunction(() => window.__CHASE__.renderer.bonnet.rect);
  const layout = await rects(page);
  expect(layout.pip).not.toBe(null);
  // Inside the screen and clear of every HUD element and touch control.
  expect(layout.pip.l).toBeGreaterThanOrEqual(0);
  expect(layout.pip.r).toBeLessThanOrEqual(layout.viewport.w);
  for (const [sel, box] of Object.entries(layout.hud))
    expect(overlaps(layout.pip, box), `PIP overlaps ${sel}`).toBe(false);

  // The frame really shows the bonnet view: its pixels change when the PIP
  // is switched off and the top view shows through instead.
  const clip = {
    x: layout.pip.l + 4,
    y: layout.pip.t + 14,
    width: layout.pip.r - layout.pip.l - 8,
    height: layout.pip.b - layout.pip.t - 18,
  };
  await page.locator("#pause").click();
  await page.evaluate(() => {
    const { sim, renderer } = window.__CHASE__;
    document.body.classList.add("playing");
    renderer.render(sim, 0, false);
  });
  const on = await page.screenshot({ clip, timeout: 120000 });
  await page.evaluate(() => {
    const { sim, renderer } = window.__CHASE__;
    renderer.setPip(false);
    renderer.render(sim, 0, false);
  });
  const off = await page.screenshot({ clip, timeout: 120000 });
  expect(Buffer.compare(on, off)).not.toBe(0);
  await page.evaluate(() => window.__CHASE__.renderer.setPip(true));
  await page.locator("#start").click();

  // Keyboard V toggles too, and the choice survives a reload.
  await page.keyboard.press("v");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  expect(
    await page.evaluate(() => document.body.classList.contains("pip-on")),
  ).toBe(false);

  // Cost, two ways. (1) The same frozen scene drawn with the PIP OFF and ON,
  // alternated so warm-up and scene changes cannot bias either side.
  // (2) Live driving in alternating 2-second windows.
  await page.keyboard.press("v");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await page.locator("#pause").click();
  const frozen = await page.evaluate(async () => {
    const { sim, renderer } = window.__CHASE__;
    document.body.classList.add("playing");
    const result = { off: [], on: [] };
    for (let round = 0; round < 6; round++) {
      const pip = round % 2 === 1;
      renderer.setPip(pip);
      for (let i = 0; i < 40; i++) {
        const t = performance.now();
        renderer.render(sim, 0, false);
        renderer.renderer.getContext().finish();
        (pip ? result.on : result.off).push(performance.now() - t);
      }
    }
    renderer.setPip(true);
    const mean = (xs) =>
      +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2);
    return {
      frames: result.on.length + result.off.length,
      offMs: mean(result.off),
      onMs: mean(result.on),
      mainDrawCalls: renderer.lastMainCalls,
      pipDrawCalls: renderer.bonnet.lastPassCalls,
    };
  });
  await page.locator("#start").click();
  const live = { off: [], on: [] };
  for (let round = 0; round < 4; round++) {
    const pip = round % 2 === 1;
    await page.evaluate((pip) => {
      const toggle = document.querySelector("#pip-toggle");
      if ((toggle.getAttribute("aria-pressed") === "true") !== pip)
        toggle.click();
    }, pip);
    (pip ? live.on : live.off).push(await sampleFrames(page, 2));
  }
  const avg = (rows, pick) =>
    +(rows.reduce((a, r) => a + pick(r), 0) / rows.length).toFixed(2);
  const offStats = {
    fps: avg(live.off, (r) => r.fps),
    drawMs: avg(live.off, (r) => r.draw.mean),
    intervalP95: avg(live.off, (r) => r.interval.p95),
  };
  const onStats = {
    fps: avg(live.on, (r) => r.fps),
    drawMs: avg(live.on, (r) => r.draw.mean),
    intervalP95: avg(live.on, (r) => r.interval.p95),
    pipPassMs: avg(live.on, (r) => r.pipPassMs),
  };
  expect(onStats.pipPassMs).toBeGreaterThan(0);
  expect(frozen.pipDrawCalls).toBeGreaterThan(0);
  await page.screenshot({
    path: `test-results/v1.8-${info.project.name}-pip.png`,
    timeout: 120000,
  });

  await page.reload();
  await expect(page.locator("#pip-toggle")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await info.attach("v18-pip-performance", {
    body: JSON.stringify(
      {
        project: info.project.name,
        viewport: layout.viewport,
        pipFrame: layout.pip,
        note: "Software GL (SwiftShader), internal resolution 0.5: compare ON vs OFF only, not absolute FPS.",
        frozenScene: frozen,
        live: { off: offStats, on: onStats, windows: live },
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
  expect(errors).toEqual([]);
});
