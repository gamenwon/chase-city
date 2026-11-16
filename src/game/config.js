export const CONFIG = Object.freeze({
  worldHalf: 110,
  spacing: 30,
  roadWidth: 11,
  playerSpeed: 24,
  policeSpeed: 22,
  turnRate: 1.75,
  radius: 1.15,
  maxHealth: 100,
  arrestSeconds: 3,
  policeCount: 4,
  maxPolice: 8,
  policeHealth: 100,
  impactCooldown: 0.8,
  wallDamageScale: 1.7,
  pairDamageScale: 2.7,
  minimumImpact: 6,
  barricadeDamageScale: 1.9,
  maxImpactDamage: 60,
  policeRadius: 1.4,
  explosionRadius: 10,
  explosionDamage: 60,
  wreckSeconds: 0.9,
  initialWreckSlots: 16,
  respawnSeconds: 2.5,
  // V1.8 pressure and chain-reaction tuning.
  frontBlockStart: 0,
  frontSprintSpeed: 27.5,
  blockerApproachSpeed: 7,
  flankSprintSpeed: 27.5,
  chainStepSeconds: 0.22,
  chainFalloff: 0.72,
  // V1.8 roadblocks: predicted-route blocks that stop across the road.
  blockMaxGap: 1.8,
  blockMaxCars: 3,
  blockMinAhead: 24,
  blockMaxAhead: 80,
  // Block cars must reach their slots this long before the player does, so
  // they are parked across the road (braked, turned) when it gets there.
  blockEtaSlack: -0.6,
  blockCooldown: 2.5,
  blockLostSeconds: 0.8,
  blockMaxSeconds: 14,
  blockDecel: 15,
  blockHoldEnter: 0.9,
  blockHoldLeave: 1.8,
  // A hard enough police-police impact wrecks both cars at once.
  lethalPairImpact: 14,
  // Below that, a strong knock still stalls both cars briefly.
  stunImpact: 10,
  stunSeconds: 0.8,
  // V1.8 cordon: started when the player has slowed right down.
  cordonStartSpeed: 8,
  cordonRecruitRange: 40,
  cordonEscapeDistance: 9,
  cordonReplanDistance: 6,
  cordonStandoff: 14,
});
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export const angleDelta = (a, b) =>
  Math.atan2(Math.sin(a - b), Math.cos(a - b));
