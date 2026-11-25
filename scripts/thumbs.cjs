// Renders public/vehicles/<id>.webp from the real models (src/dev/thumbs.js)
// in a browser against the dev server: node scripts/thumbs.cjs [url]
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const URL = process.argv[2] || "http://localhost:5175/";
const IDS = ["starter", "mini", "super", "muscle", "suv", "icecream", "monster", "dozer", "armored"];
(async () => {
  // (CHROMIUM=/path/to/chromium to use a preinstalled browser.)
  const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const page = await b.newPage();
  await page.goto(URL);
  await page.waitForSelector("#start");
  const out = path.join(__dirname, "..", "public", "vehicles");
  fs.mkdirSync(out, { recursive: true });
  for (const id of IDS) {
    const url = await page.evaluate(async (id) => (await import("/src/dev/thumbs.js")).renderThumb(id), id);
    fs.writeFileSync(path.join(out, `${id}.webp`), Buffer.from(url.split(",")[1], "base64"));
    console.log(id);
  }
  await b.close();
})();
