// V2.0 player vehicles: driving stats per car and the data a later unlock /
// collection screen needs. Only the starter car is in play now; its numbers
// are exactly the values the game used before V2.0 (CONFIG), so choosing it
// changes nothing about difficulty.
//
//   topSpeed   m/s the car settles at (auto-forward driving)
//   turnRate   rad/s at full steering
//   grip       how fast the car's velocity follows its heading (1/s)
//   durability damage taken is scaled by 100 / durability
//   unlock     how a car is obtained: { type: "starter" } or
//              { type: "credits", cost } (game credits, never app points)
import { CONFIG } from "./config.js";

// Vehicle collection: one place for every per-vehicle number. Each car has
// design ratings (1-5: speed, acceleration, steering, mass, destruction)
// and the gameplay parameters derived from them (see TUNE), plus a few
// hand-set specials. Nothing vehicle-specific lives anywhere else: the
// simulation, city, locations and renderer read these fields.
//
//   topSpeed      m/s the car settles at (auto-forward driving)
//   accel         how fast it gets there (1/s; the classic car: 2)
//   turnRate      rad/s at full steering (turning radius = speed/turnRate)
//   steerResponse how fast the steering follows the input (1/s)
//   grip          how fast the velocity follows the heading (1/s)
//   mass          vs the classic car = 1: pushing, being pushed, jumps
//   impact        vehicle-collision power (police / traffic damage, shove)
//   env           environment-destruction power (props, shops, walls,
//                 pillars, facilities break at lower speeds)
//   retain        share of speed kept when hitting a car (0..1)
//   propRetain    share of the speed lost to a knocked-over prop it keeps
//   knockResist   how little a police car's hit moves it (0..1)
//   breakBlocks   can shove a braced roadblock / cordon car a little
//   climbs        drives up and over smaller cars (monster truck)
//   radius        collision circle (m); visuals may stick out further
//   coinRadius    automatic coin pickup distance (m)
//   roll          body roll in turns (visual), bounce: suspension (visual)
//   engine        { pitch, gain } of the engine sound
//   maxHp         durability (restored): the car's own maximum HP
//   resist        per damage category (durability.js) a multiplier on the
//                 damage a 100 HP car would take: heavy machines shrug off
//                 small cars; nobody is immune to explosions or falls
//   durability    = maxHp (legacy name)
const TUNE = Object.freeze({
  speed: [0, 15.5, 19, 22.5, 26, 29.5],
  accel: [0, 0.9, 1.3, 2.0, 2.7, 3.4],
  turn: [0, 1.25, 1.42, 1.65, 1.9, 2.15],
  respond: [0, 4, 5, 7, 9, 11],
  mass: [0, 0.8, 1.0, 1.35, 1.8, 2.5],
  power: [0, 0.6, 0.9, 1.4, 2.0, 2.7],
});
function build(id, name, description, r, extra = {}) {
  const mass = TUNE.mass[r.mass];
  const stats = {
    topSpeed: TUNE.speed[r.speed],
    accel: TUNE.accel[r.accel],
    turnRate: TUNE.turn[r.steer],
    steerResponse: TUNE.respond[r.steer],
    grip: 10,
    mass,
    impact: TUNE.power[r.destroy],
    env: TUNE.power[r.destroy],
    retain: Math.min(0.75, Math.max(0, (mass - 0.9) * 0.4)),
    propRetain: Math.min(0.85, Math.max(0, (mass - 1) * 0.5)),
    knockResist: Math.min(0.9, Math.max(0, (mass - 0.8) * 0.45)),
    breakBlocks: mass >= 2.4,
    climbs: false,
    radius: CONFIG.radius,
    coinRadius: 2.6,
    roll: 0.045,
    bounce: 0,
    engine: { pitch: 1, gain: 1 },
    ...extra.stats,
  };
  stats.maxHp = extra.maxHp || 100;
  stats.resist = Object.freeze({ civilian: 1, police: 1, wall: 1, heavy: 1, blast: 1, fall: 1, misc: 1, ...(extra.resist || {}) });
  stats.durability = stats.maxHp;
  return Object.freeze({
    id,
    name,
    description,
    ratings: Object.freeze({ ...r }),
    stats: Object.freeze(stats),
    unlock: Object.freeze(extra.unlock || { type: "dev" }),
    model: extra.model || id,
    available: true,
  });
}

export const VEHICLES = Object.freeze({
  starter: Object.freeze({
    id: "starter",
    name: "쿠페",
    description: "기본 차량. 모든 미션의 기준 성능.",
    ratings: Object.freeze({ speed: 3, accel: 3, steer: 3, mass: 2, destroy: 2, durability: 2 }),
    stats: Object.freeze({
      topSpeed: CONFIG.playerSpeed,
      accel: 2,
      turnRate: CONFIG.turnRate,
      steerResponse: 7,
      grip: 10,
      mass: 1,
      impact: 1,
      env: 1,
      retain: 0,
      propRetain: 0,
      knockResist: 0.1,
      breakBlocks: false,
      climbs: false,
      radius: CONFIG.radius,
      coinRadius: 2.6,
      roll: 0.045,
      bounce: 0,
      engine: Object.freeze({ pitch: 1, gain: 1 }),
      maxHp: 100,
      resist: Object.freeze({ civilian: 1, police: 1, wall: 1, heavy: 1, blast: 1, fall: 1, misc: 1 }),
      durability: 100,
    }),
    unlock: Object.freeze({ type: "starter" }),
    model: "classic",
    available: true,
  }),
  mini: build("mini", "미니카", "민첩한 조향, 빠른 가속. 가볍고 좁은 길에 강하지만 부딪히면 잘 밀린다.", { speed: 3, accel: 4, steer: 5, mass: 1, destroy: 1 , durability: 2}, {
    maxHp: 100,
    resist: { civilian: 1.2 },
    // (Smaller than the rest, and narrow enough to slip past a barricade
    // over the pavement: slipsBarricade.)
    stats: { radius: 0.69, slipsBarricade: true, grip: 13, roll: 0.03, engine: { pitch: 1.45, gain: 0.8 } },
  }),
  super: build("super", "슈퍼카", "최고 속도와 가속. 추격과 탈출에 강하고, 큰 충돌에서는 속도를 많이 잃는다.", { speed: 5, accel: 5, steer: 4, mass: 1, destroy: 2 , durability: 2}, {
    maxHp: 100,
    resist: { wall: 1.1 },
    stats: { grip: 12, retain: 0, roll: 0.02, engine: { pitch: 1.25, gain: 1.1 } },
  }),
  muscle: build("muscle", "머슬카", "속도와 파괴력의 균형. 묵직한 충돌.", { speed: 4, accel: 4, steer: 3, mass: 3, destroy: 3 , durability: 3}, {
    maxHp: 130,
    resist: {},
    stats: { grip: 9, roll: 0.05, engine: { pitch: 0.72, gain: 1.35 } },
  }),
  suv: build("suv", "오프로드 SUV", "무겁고 안정적. 경찰차를 밀어내고 작은 장애물에 속도를 덜 잃는다.", { speed: 3, accel: 3, steer: 3, mass: 4, destroy: 4 , durability: 4}, {
    maxHp: 160,
    resist: { civilian: 0.7, police: 0.9 },
    stats: { grip: 11, propRetain: 0.65, roll: 0.035, bounce: 0.06, engine: { pitch: 0.8, gain: 1.1 } },
  }),
  icecream: build("icecream", "아이스크림 트럭", "개성 있는 주행. 코인을 더 넓은 범위에서 끌어모으고, 차체가 크게 출렁인다.", { speed: 3, accel: 3, steer: 3, mass: 3, destroy: 3 , durability: 3}, {
    maxHp: 130,
    resist: {},
    stats: { grip: 8, coinRadius: 4.2, roll: 0.1, bounce: 0.08, jingle: true, engine: { pitch: 1.1, gain: 0.9 } },
  }),
  monster: build("monster", "몬스터 트럭", "압도적인 차량 파괴. 작은 차를 타고 넘어 짓누르고 뒤집는다. 회전 반경이 크다.", { speed: 3, accel: 3, steer: 2, mass: 5, destroy: 5 , durability: 4}, {
    maxHp: 170,
    resist: { civilian: 0.4, police: 0.8 },
    // (climbs: over small cars, barricades, and off the elevated road.)
    stats: { climbs: true, impact: 3.2, env: 2.2, grip: 8, propRetain: 0.75, roll: 0.07, bounce: 0.12, turnRate: 1.3, engine: { pitch: 0.6, gain: 1.4 } },
  }),
  dozer: build("dozer", "불도저", "시설물 파괴 특화. 가장 느리지만 무엇이든 밀어내고 부순다.", { speed: 2, accel: 2, steer: 2, mass: 5, destroy: 5 , durability: 5}, {
    maxHp: 200,
    resist: { civilian: 0.5, police: 0.9, wall: 0.8 },
    stats: { impact: 2.0, env: 3.4, grip: 14, propRetain: 0.9, retain: 0.6, roll: 0.015, engine: { pitch: 0.5, gain: 1.2 } },
  }),
  armored: build("armored", "장갑 트럭", "높은 중량과 충돌 안정성. 충돌해도 속도를 지키고 검문 차단을 밀어낸다.", { speed: 3, accel: 2, steer: 2, mass: 5, destroy: 4 , durability: 5}, {
    maxHp: 220,
    resist: {},
    stats: { retain: 0.7, knockResist: 0.9, impact: 2.2, env: 1.8, grip: 10, roll: 0.02, engine: { pitch: 0.65, gain: 1.15 } },
  }),
  // V2.0 data-only sample (not in the collection).
  boxy: Object.freeze({
    id: "boxy",
    name: "박스 미니",
    description: "짧고 단단한 박스카. 느리지만 잘 버틴다.",
    ratings: Object.freeze({ speed: 2, accel: 2, steer: 2, mass: 3, destroy: 2 }),
    stats: Object.freeze({ topSpeed: 22, accel: 2, turnRate: 1.9, steerResponse: 7, grip: 11, mass: 1.25, impact: 1.1, env: 1.1, retain: 0.1, propRetain: 0.1, knockResist: 0.2, breakBlocks: false, climbs: false, radius: CONFIG.radius, coinRadius: 2.6, roll: 0.045, bounce: 0, engine: Object.freeze({ pitch: 1, gain: 1 }), durability: 125 }),
    unlock: Object.freeze({ type: "credits", cost: 3000 }),
    model: "boxy",
    available: false,
  }),
});
// The collection, in lineup order.
export const COLLECTION = ["mini", "super", "muscle", "suv", "icecream", "monster", "dozer", "armored"];
// The selectable lineup of the evaluation build (cartoon redesign): five
// cars. The others stay configured for later.
export const PLAYER_LINEUP = Object.freeze(["starter", "super", "mini", "monster", "armored"]);

export const DEFAULT_VEHICLE = "starter";

export function getVehicle(id = DEFAULT_VEHICLE) {
  return VEHICLES[id] || VEHICLES[DEFAULT_VEHICLE];
}

// Ratings 1-5 for a car card: the design ratings.
export function vehicleRatings(vehicle) {
  const r = vehicle.ratings || { speed: 3, accel: 3, steer: 3, mass: 2, destroy: 2 };
  return { speed: r.speed, accel: r.accel, handling: r.steer, mass: r.mass, destroy: r.destroy, durability: r.durability ?? 2 };
}

// One-line specialization for the vehicle select cards.
export const VEHICLE_ROLES = Object.freeze({
  starter: "균형형 · 기본 차량",
  mini: "조향·가속 특화 · 좁은 길",
  super: "최고 속도 · 추격과 탈출",
  muscle: "속도와 파괴력의 균형",
  suv: "경찰차 밀어내기 · 안정성",
  icecream: "넓은 코인 흡수 · 멜로디",
  monster: "차량 타고 넘기 · 뒤집기",
  dozer: "시설 파괴 최강 · 가장 느림",
  armored: "최고 내구 · 충돌에도 속도 유지",
});
