// V2.0 rewarded-ad connection point.
//
// The company's existing in-game ad system plugs in here; the game itself
// ships no ad SDK and never pretends an ad was watched. Until a provider is
// registered every placement reports "unavailable": the ad buttons stay
// hidden (or, in development, shown disabled as "광고 미연동"), and retry /
// next mission / mission select work exactly as without ads.
//
// Provider contract (implemented by the host app's ad module):
//   {
//     isReady(placement): boolean            // an ad can be shown now
//     showRewarded(placement): Promise<{ rewarded: boolean }>
//                                            // resolves after the ad closes;
//                                            // rewarded only if the SDK says
//                                            // the viewer earned the reward
//   }
// Register it before or after the game loads:
//   window.ChaseCityAds.register(provider)
// or set window.CHASE_CITY_AD_PROVIDER = provider before the game script.

export const PLACEMENTS = Object.freeze({
  continue: "mission_fail_continue", // fail -> watch -> continue once
  doubleReward: "mission_success_double", // success -> watch -> reward x2
});

export class AdBridge {
  constructor(provider = null) {
    this.provider = null;
    this.busy = false;
    this.listeners = new Set();
    if (provider) this.register(provider);
  }
  register(provider) {
    const valid =
      provider &&
      typeof provider.isReady === "function" &&
      typeof provider.showRewarded === "function";
    this.provider = valid ? provider : null;
    for (const fn of this.listeners) fn();
    return valid;
  }
  onChange(fn) {
    this.listeners.add(fn);
  }
  // "unavailable" (no provider), "loading" (provider, no ad ready yet),
  // "ready", or "busy" (an ad is on screen).
  status(placement) {
    if (!this.provider) return "unavailable";
    if (this.busy) return "busy";
    try {
      return this.provider.isReady(placement) ? "ready" : "loading";
    } catch {
      return "loading";
    }
  }
  // Resolves { rewarded, reason }. Never rewards without the provider saying
  // so; errors and closes count as not rewarded.
  async showRewarded(placement) {
    if (this.status(placement) !== "ready")
      return { rewarded: false, reason: this.status(placement) };
    this.busy = true;
    try {
      const out = await this.provider.showRewarded(placement);
      return { rewarded: out?.rewarded === true, reason: "closed" };
    } catch (error) {
      return { rewarded: false, reason: "error", error };
    } finally {
      this.busy = false;
    }
  }
}

// The page-wide bridge and the host hook.
export function installAdBridge(win = globalThis) {
  const bridge = new AdBridge(win.CHASE_CITY_AD_PROVIDER || null);
  win.ChaseCityAds = Object.freeze({
    register: (provider) => bridge.register(provider),
    placements: PLACEMENTS,
  });
  return bridge;
}
