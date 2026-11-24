import { test, expect } from "@playwright/test";

// V2.0 mission platform in the real game page (city on, device budgets).
const OUT = "test-results/v20";

async function open(page, query = "?debug") {
  await page.goto(`/${query}`);
  await page.waitForFunction(() => window.__CHASE__);
}
// Drive the player through each parcel (the run itself is the real game).
async function collectAll(page) {
  await page.evaluate(() => {
    const s = window.__CHASE__.sim;
    for (const q of s.pickups) {
      Object.assign(s.player, { x: q.x, z: q.z });
      s.previousPlayer = { x: q.x, z: q.z };
      s.update(1 / 60, {});
    }
  });
}

test("mission select: all missions listed in catalog order; choosing one changes briefing, HUD and rules", async ({
  page,
}, info) => {
  await open(page);
  await expect(page.locator("#title")).toHaveText("도시 탈출");
  await expect(page.locator("#mission-limit")).toHaveText("없음");
  await page.locator("#open-select").click();
  await expect(page.locator("#mission-select")).toBeVisible();
  const cards = page.locator(".mission-card");
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toContainText("도시 탈출");
  await expect(cards.nth(1)).toContainText("택배 수거");
  await expect(cards.nth(2)).toContainText("타깃 헌트");
  await expect(cards.nth(1)).toContainText("제한 시간 80초");
  await page.screenshot({ path: `${OUT}/${info.project.name}-select.png` });
  await page.locator('[data-mission="parcels"]').click();
  await expect(page.locator("#mission-select")).toBeHidden();
  await expect(page.locator("#title")).toHaveText("택배 수거");
  await expect(page.locator("#mission-reward")).toHaveText("300 코인");
  await expect(page.locator("#mission-limit")).toHaveText("80초");
  await page.locator("#start").click();
  await expect(page.locator("#overlay")).toBeHidden();
  await page.waitForTimeout(1500);
  const s = await page.evaluate(() => {
    const sim = window.__CHASE__.sim;
    return {
      police: sim.police.length,
      pickups: sim.pickups.length,
      hud: document.querySelector("#mission-progress").textContent,
      number: document.querySelector("#mission-number").textContent,
      heat: getComputedStyle(document.querySelector("#heat")).display,
      arrow: !document.querySelector("#escape-guidance").hidden,
      arrowName: document.querySelector("#escape-name").textContent,
    };
  });
  expect(s.police).toBe(0);
  expect(s.pickups).toBe(5);
  expect(s.hud).toMatch(/^수거 0 \/ 5 · 남은 \d+초$/);
  expect(s.number).toBe("MISSION / 02");
  expect(s.heat).toBe("none");
  expect(s.arrow).toBe(true);
  expect(s.arrowName).toBe("택배");
  await page.screenshot({ path: `${OUT}/${info.project.name}-parcels-play.png` });
});

test("collect mission success: result screen, credits paid once and kept after reload", async ({
  page,
}, info) => {
  await open(page);
  await page.evaluate(() => window.__CHASE__.chooseMission("parcels"));
  await page.locator("#start").click();
  await page.waitForTimeout(600);
  await collectAll(page);
  await expect(page.locator("#eyebrow")).toHaveText("MISSION COMPLETE!");
  await expect(page.locator("#title")).toHaveText("택배 수거 성공!");
  await expect(page.locator("#result-earned")).toHaveText(/^\+300 코인/);
  await expect(page.locator("#wallet-credits")).toHaveText("300");
  await expect(page.locator("#next-mission")).toBeVisible();
  await expect(page.locator("#open-select")).toBeVisible();
  await page.screenshot({ path: `${OUT}/${info.project.name}-clear.png` });
  // Showing the result again cannot pay twice.
  await page.evaluate(() => window.__CHASE__.progress.pay("x", "y", 0));
  expect(await page.evaluate(() => window.__CHASE__.progress.credits)).toBe(300);
  await page.reload();
  await page.waitForFunction(() => window.__CHASE__);
  await expect(page.locator("#wallet-credits")).toHaveText("300");
  // The last mission chosen is offered again.
  await expect(page.locator("#title")).toHaveText("택배 수거");
  const record = await page.evaluate(() =>
    window.__CHASE__.progress.missionRecord("parcels"),
  );
  expect(record.plays).toBe(1);
  expect(record.clears).toBe(1);
});

test("chase result lists what the player destroyed, from real events, each object once; next mission and retry work", async ({
  page,
}, info) => {
  await open(page);
  await page.locator("#start").click();
  await page.waitForTimeout(400);
  const counts = await page.evaluate(async () => {
    const { PROPS } = await import("/src/game/city.js");
    const s = window.__CHASE__.sim;
    const hit = (prop, speed) => {
      const road = Math.round(prop.z / 30) * 30,
        side = Math.sign(prop.z - road);
      const gap = 1.15 + PROPS[prop.kind].r + 0.25;
      Object.assign(s.player, {
        x: prop.x,
        z: prop.z - side * gap,
        angle: side > 0 ? Math.PI : 0,
        vx: 0,
        vz: side * speed,
        speed,
      });
      s.previousPlayer = { x: s.player.x, z: s.player.z };
      for (let i = 0; i < 40; i++) s.update(1 / 60, {});
      s.health = 100;
      s.hitCooldown = 0;
    };
    const pick = (kind, n) =>
      s.city.props
        .filter(
          (p) =>
            p.kind === kind &&
            p.angle === Math.PI / 2 &&
            p.state === "stand" &&
            Math.abs(p.x) < 70 &&
            Math.abs(p.z) < 70,
        )
        .slice(0, n);
    const cans = pick("trash", 3);
    for (const q of cans) hit(q, 9);
    // The same cans again while lying on the road: no new count.
    for (const q of cans) hit(q, 9);
    for (const q of pick("tree", 1)) hit(q, 20);
    const result = { tally: { ...s.tally.counts }, city: { ...s.city.stats } };
    s.health = 0;
    s.hitCooldown = 0;
    return result;
  });
  expect(counts.tally.trash).toBe(3);
  expect(counts.tally.tree).toBe(1);
  expect(counts.tally.trash).toBe(counts.city.trashKnocked);
  expect(counts.tally.tree).toBe(counts.city.treesDown);
  await expect(page.locator("#eyebrow")).toHaveText("WRECKED!");
  await expect(page.locator("#result-destroyed li")).toHaveText([
    "쓰레기통 3개",
    "가로수 1그루",
  ]);
  await expect(page.locator("#result-earned")).toHaveText(/^\+\d+ 코인/);
  await expect(page.locator("#start")).toHaveText("RESTART →");
  await page.screenshot({ path: `${OUT}/${info.project.name}-wrecked.png` });
  // Next mission -> its briefing (not started yet).
  await page.locator("#next-mission").click();
  await expect(page.locator("#title")).toHaveText("택배 수거");
  await expect(page.locator("#start")).toHaveText("START →");
  expect(await page.evaluate(() => window.__CHASE__.state)).toBe("ready");
  // Back to the chase through the list, then retry straight from a result.
  await page.locator("#open-select").click();
  await page.locator('[data-mission="survival60"]').click();
  await page.locator("#start").click();
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    window.__CHASE__.sim.health = 0;
  });
  await expect(page.locator("#eyebrow")).toHaveText("WRECKED!");
  await expect(page.locator("#result-destroyed li")).toHaveText(["없음"]);
  await page.locator("#start").click();
  await expect(page.locator("#overlay")).toBeHidden();
  const after = await page.evaluate(() => ({
    m: window.__CHASE__.sim.missionId,
    t: window.__CHASE__.sim.tally.total,
    police: window.__CHASE__.sim.police.length,
  }));
  expect(after).toEqual({ m: "survival60", t: 0, police: 4 });
});

test("ads without an ad system: shown only as disabled 'not connected' in development, never reward, retry still works", async ({
  page,
}, info) => {
  await open(page);
  await page.locator("#start").click();
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    window.__CHASE__.sim.health = 0;
  });
  await expect(page.locator("#eyebrow")).toHaveText("WRECKED!");
  const cont = page.locator("#ad-continue");
  await expect(cont).toBeVisible();
  await expect(cont).toBeDisabled();
  await expect(cont).toContainText("광고 미연동");
  await expect(page.locator("#ad-note")).toContainText("개발용");
  await expect(page.locator("#ad-double")).toBeHidden();
  await cont.click({ force: true });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__CHASE__.sim.result)).toBe(
    "destroyed",
  );
  await page.locator("#start").click();
  await expect(page.locator("#overlay")).toBeHidden();
  expect(await page.evaluate(() => window.__CHASE__.state)).toBe("running");
});

test("ads with a host ad system: continue once after failure, double reward after success (test double for the host SDK)", async ({
  page,
}) => {
  await open(page);
  // Stand-in for the company ad module, registered through the public hook.
  await page.evaluate(() => {
    window.__adCalls = [];
    window.ChaseCityAds.register({
      isReady: () => true,
      showRewarded: async (placement) => {
        window.__adCalls.push(placement);
        return { rewarded: true };
      },
    });
  });
  await page.locator("#start").click();
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    window.__CHASE__.sim.health = 0;
  });
  await expect(page.locator("#eyebrow")).toHaveText("WRECKED!");
  const cont = page.locator("#ad-continue");
  await expect(cont).toBeEnabled();
  await expect(cont).toContainText("광고 보고 이어하기");
  await cont.click();
  await expect(page.locator("#overlay")).toBeHidden();
  let s = await page.evaluate(() => ({
    state: window.__CHASE__.state,
    health: window.__CHASE__.sim.health,
    result: window.__CHASE__.sim.result,
    calls: window.__adCalls,
  }));
  expect(s).toEqual({
    state: "running",
    health: 60,
    result: null,
    calls: ["mission_fail_continue"],
  });
  // Second failure in the same run: continue is used up.
  await page.evaluate(() => {
    const sim = window.__CHASE__.sim;
    sim.hitCooldown = 0;
    sim.health = 0;
  });
  await expect(page.locator("#eyebrow")).toHaveText("WRECKED!");
  await expect(cont).toBeDisabled();
  await expect(cont).toContainText("사용함");
  // Success with the double reward.
  await page.evaluate(() => window.__CHASE__.chooseMission("parcels"));
  await page.locator("#start").click();
  await page.waitForTimeout(300);
  await collectAll(page);
  await expect(page.locator("#result-earned")).toHaveText(/^\+300 코인/);
  const dbl = page.locator("#ad-double");
  await expect(dbl).toBeEnabled();
  await dbl.click();
  await expect(page.locator("#result-earned")).toHaveText(/^\+600 코인/);
  await expect(page.locator("#wallet-credits")).toHaveText("600");
  await expect(dbl).toBeDisabled();
  await dbl.click({ force: true });
  await expect(page.locator("#wallet-credits")).toHaveText("600");
  // A provider that closes without reward pays nothing.
  await page.evaluate(() =>
    window.ChaseCityAds.register({
      isReady: () => true,
      showRewarded: async () => ({ rewarded: false }),
    }),
  );
  await page.locator("#start").click();
  await page.waitForTimeout(300);
  await collectAll(page);
  await expect(page.locator("#wallet-credits")).toHaveText("900");
  await page.locator("#ad-double").click();
  await page.waitForTimeout(300);
  await expect(page.locator("#wallet-credits")).toHaveText("900");
  await expect(page.locator("#result-earned")).toHaveText(/^\+300 코인/);
});

test("the host can reorder missions (setting, no code change)", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.CHASE_CITY_CONFIG = { missionOrder: ["parcels", "survival60"] };
  });
  await open(page);
  await expect(page.locator("#title")).toHaveText("택배 수거");
  await page.locator("#open-select").click();
  await expect(page.locator(".mission-card").nth(0)).toContainText("택배 수거");
  await expect(page.locator(".mission-card").nth(1)).toContainText("도시 탈출");
});

test("phone portrait: menus fit, tap targets are big enough, no sideways scroll", async ({
  page,
}, info) => {
  await open(page);
  const check = async (label) => {
    const r = await page.evaluate(() => {
      const visible = [...document.querySelectorAll("button")].filter(
        (b) => b.offsetParent && b.getBoundingClientRect().width > 0,
      );
      return {
        scrollX: document.documentElement.scrollWidth - innerWidth,
        small: visible
          .filter((b) => b.closest(".overlay"))
          .map((b) => [b.id || b.className, b.getBoundingClientRect().height])
          .filter(([, h]) => h < 40),
      };
    });
    expect(r.scrollX, label).toBeLessThanOrEqual(0);
    expect(r.small, label).toEqual([]);
  };
  await check("briefing");
  await page.locator("#open-select").click();
  await check("select");
  await page.locator('[data-mission="survival60"]').click();
  await page.locator("#start").click();
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    window.__CHASE__.sim.health = 0;
  });
  await expect(page.locator("#eyebrow")).toHaveText("WRECKED!");
  await check("result");
  // Primary and secondary result buttons are on screen without scrolling.
  for (const id of ["#start", "#next-mission", "#open-select"]) {
    const box = await page.locator(id).boundingBox();
    const vh = page.viewportSize().height;
    expect(box.y + box.height, id).toBeLessThanOrEqual(vh);
  }
  await page.screenshot({ path: `${OUT}/${info.project.name}-result-fit.png` });
});
