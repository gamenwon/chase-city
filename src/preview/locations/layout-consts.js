// Location block centres. The preview page (locations.html) uses the fixed
// downtown spots below; the game's generated city moves them per run with
// setLocations() before building the city or its locations (one city is
// live at a time, so every module reads the same shared objects).
export const DEFAULT_LOCATIONS = Object.freeze({
  gas: { x: -45, z: -45 },
  court: { x: 45, z: 45 },
  park: { x: 15, z: -45 },
  gasDepot: { x: -45, z: 45 },
});
export const GAS = { ...DEFAULT_LOCATIONS.gas };
export const COURT = { ...DEFAULT_LOCATIONS.court };
export const PARK = { ...DEFAULT_LOCATIONS.park };
export const GASDEPOT = { ...DEFAULT_LOCATIONS.gasDepot };
export function setLocations(loc = DEFAULT_LOCATIONS) {
  Object.assign(GAS, loc.gas);
  Object.assign(COURT, loc.court);
  Object.assign(PARK, loc.park);
  Object.assign(GASDEPOT, loc.gasDepot);
}
