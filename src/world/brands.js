// Casual visual pass: shop brands. Every building with a shopfront gets a
// brand (deterministic per city): the name on its fascia sign, the colours
// of its signs and neon, how its shop reacts when smashed (storefronts.js
// type), and, for some, a giant 3D advertising sculpture on the roof. The
// same signs serve day and night (painted by day, lit neon at night).
//
// type: plain | goods | electric | diner | bottles | cafe | fruit | flower
//       | market | fireworks (see storefronts.js)
export const BRANDS = {
  burger: { name: "BURGER", bg: "#d62f2a", fg: "#ffd23a", neon: 0xff5a3a, type: "diner", sculpture: "burger", food: true },
  pizza: { name: "PIZZA", bg: "#1f7a3a", fg: "#fff4d6", neon: 0xff8a2a, type: "diner", sculpture: "pizza", food: true },
  hotdog: { name: "HOT DOG", bg: "#f5c01a", fg: "#c8202a", neon: 0xffd23a, type: "diner", sculpture: "hotdog", food: true },
  coffee: { name: "COFFEE", bg: "#5a3420", fg: "#ffe9c8", neon: 0xffb36a, type: "cafe", sculpture: "coffee", food: true },
  cafe: { name: "CAFE", bg: "#127a78", fg: "#ffffff", neon: 0x3ae8d8, type: "cafe", sculpture: "coffee", food: true },
  donut: { name: "DONUT", bg: "#e0367a", fg: "#ffffff", neon: 0xff5fb8, type: "cafe", sculpture: "donut", food: true },
  icecream: { name: "ICE CREAM", bg: "#7ad8c0", fg: "#c8205a", neon: 0x7affe0, type: "cafe", sculpture: "icecream", food: true },
  fruit: { name: "FRUIT", bg: "#f0781e", fg: "#ffffff", neon: 0xffa02a, type: "fruit", sculpture: "apple" },
  flowers: { name: "FLOWERS", bg: "#b84ac8", fg: "#ffffff", neon: 0xff7af0, type: "flower" },
  mart: { name: "24 MART", bg: "#f4f4f0", fg: "#d62f2a", neon: 0xff3a3a, type: "market" },
  market: { name: "MARKET", bg: "#2f7d4f", fg: "#ffe14a", neon: 0x5aff7a, type: "market" },
  game: { name: "GAME", bg: "#2a3fd0", fg: "#ffffff", neon: 0x8a6aff, type: "electric" },
  cinema: { name: "CINEMA", bg: "#8a1424", fg: "#ffd23a", neon: 0xffc83a, type: "plain" },
  electro: { name: "ELECTRO", bg: "#1a2a5a", fg: "#4ae8ff", neon: 0x4ae8ff, type: "electric" },
  bbq: { name: "BBQ GRILL", bg: "#3a2a24", fg: "#ff8a2a", neon: 0xff6a2a, type: "bottles", food: true },
  sushi: { name: "SUSHI", bg: "#f4f1ea", fg: "#c8202a", neon: 0xff4a6a, type: "diner", food: true },
  noodle: { name: "NOODLE", bg: "#f5c01a", fg: "#1a1a1a", neon: 0xffe04a, type: "diner", food: true },
  bakery: { name: "BAKERY", bg: "#e8a33a", fg: "#5a3420", neon: 0xffc070, type: "goods", food: true },
  books: { name: "BOOKS", bg: "#2457c5", fg: "#ffffff", neon: 0x5a9aff, type: "goods" },
  pharmacy: { name: "PHARMACY", bg: "#2fa36b", fg: "#ffffff", neon: 0x4aff9a, type: "goods" },
  laundry: { name: "LAUNDRY", bg: "#9fd8ff", fg: "#1a3f94", neon: 0x9fe0ff, type: "plain" },
  toys: { name: "TOYS", bg: "#ff7a1a", fg: "#2457c5", neon: 0xffa040, type: "goods" },
  fireworks: { name: "FIREWORKS", bg: "#1a1a1a", fg: "#ffd23a", neon: 0xff3ad0, type: "fireworks", sculpture: "rocket" },
};
export const BRAND_KEYS = Object.keys(BRANDS);
// Small words for the extra little signs (window neon, hanging boards).
export const SMALL_SIGNS = ["OPEN", "SALE", "24H", "HOT", "NEW", "BAR", "EAT", "WOW"];
// Digital billboard ad frames (render/ads canvas).
export const ADS = [
  { title: "SUPER COLA", sub: "ICE COLD!", bg: "#d62f2a", fg: "#ffffff" },
  { title: "CHASE FM", sub: "98.7 TURBO HITS", bg: "#2a3fd0", fg: "#ffd23a" },
  { title: "MEGA SALE", sub: "50% OFF", bg: "#f5c01a", fg: "#1a1a1a" },
  { title: "GO FAST", sub: "TURBO TYRES", bg: "#1a1a1a", fg: "#4ae8ff" },
];

const COMMERCIAL = ["burger", "pizza", "hotdog", "coffee", "cafe", "donut", "icecream", "fruit", "mart", "market", "game", "cinema", "electro", "bbq", "sushi", "noodle", "flowers"];
const LOCAL = ["bakery", "books", "pharmacy", "laundry", "toys", "flowers", "fruit", "coffee", "noodle", "mart"];
// Brands whose shops prefer their sculpture (one each of these first).
const SCULPTED = ["burger", "donut", "pizza", "coffee", "icecream", "hotdog", "fruit"];

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0) / 4294967296);
}

// Brands, sculptures, rooftop billboards for a generated city (in place
// on its buildings). Deterministic for the layout.
export function assignBrands(buildings, seed = 1, avoid = []) {
  const R = rng(seed * 2654435761 + 97);
  const shops = buildings.filter((b) => !b.destructible && b.street?.some(Boolean));
  const far = (b, list, d) => list.every((o) => Math.hypot(o.x - b.x, o.z - b.z) > d);
  for (const b of shops) {
    if (b.brand) continue;
    if (b.diner) {
      b.brand = b.shopType === "bottles" ? "bbq" : ["burger", "pizza", "hotdog"][Math.floor(R() * 3)];
      continue;
    }
    const list = b.district === "commercial" ? COMMERCIAL : LOCAL;
    b.brand = list[Math.floor(R() * list.length)];
  }
  // One fireworks shop: a low commercial building away from the gas depot.
  const low = shops.filter((b) => b.district === "commercial" && b.h <= 13 && !b.diner && far(b, avoid, 30));
  if (low.length) {
    const f = low[Math.floor(R() * low.length)];
    f.brand = "fireworks";
    f.sculpture = "rocket";
  }
  // Giant sculptures: on commercial roofs (low enough to be seen from the
  // chase camera), about one shop in four, spread out; the first of each
  // kind before repeats.
  const placed = shops.filter((b) => b.sculpture);
  // (Commercial roofs first; low local shops too where the city has few.)
  const order = [
    ...shops.filter((b) => !b.sculpture && b.h <= 15 && (b.district === "commercial" || b.diner)).sort(() => R() - 0.5),
    ...shops.filter((b) => !b.sculpture && b.h <= 12 && b.district !== "commercial" && !b.diner).sort(() => R() - 0.5),
  ];
  const want = Math.min(16, Math.round(shops.length / 3.5));
  for (const pass of [0, 1])
    for (const b of order) {
      if (placed.length >= want) break;
      if (b.sculpture || !far(b, placed, pass ? 16 : 26)) continue;
      let kind = BRANDS[b.brand].sculpture;
      if (!kind) {
        // A brand without one takes a food brand that has one.
        const k = SCULPTED[placed.length % SCULPTED.length];
        b.brand = k;
        kind = BRANDS[k].sculpture;
      }
      if (!pass && placed.some((o) => o.sculpture === kind) && placed.length < SCULPTED.length) continue;
      b.sculpture = kind;
      placed.push(b);
    }
  // Rooftop billboards on taller commercial buildings without a sculpture;
  // some are animated digital screens.
  let boards = 0, digital = 0;
  for (const b of shops) {
    if (b.sculpture || b.district !== "commercial" || b.h < 10 || R() > 0.45 || boards >= 14) continue;
    b.billboard = digital < 5 && R() < 0.5 ? "digital" : "painted";
    if (b.billboard === "digital") digital++;
    boards++;
  }
  return { shops: shops.length, sculptures: placed.length, boards, digital };
}
