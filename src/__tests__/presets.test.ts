import { describe, expect, it } from "bun:test";
import { presets } from "../presets";
import { normalizeOptions } from "../utils";

describe("presets", () => {
  it("normalizes cleanly against the option defaults", () => {
    for (const [name, options] of Object.entries(presets)) {
      const normalized = normalizeOptions(options);
      expect(normalized.duration, name).toBeGreaterThan(0);
      expect(normalized.stagger, name).toBeGreaterThanOrEqual(0);
      expect(normalized.bounce, name).toBeGreaterThanOrEqual(0);
      expect(normalized.exitOffset, name).toBeGreaterThanOrEqual(0);
    }
  });

  it("keeps the odometer preset end-aligned", () => {
    expect(presets.odometer.align).toBe("end");
  });

  it("gives the jackpot preset a chromatic sweep and a full re-roll", () => {
    expect(typeof presets.jackpot.color).toBe("function");
    expect(presets.jackpot.skipUnchanged).toBe(false);
  });

  it("keeps calm the quietest and jackpot the showiest", () => {
    const bounces = Object.values(presets).map(
      (options) => options.bounce ?? 0
    );
    expect(Math.min(...bounces)).toBe(presets.calm.bounce);
    expect(Math.max(...bounces)).toBe(presets.jackpot.bounce);
  });
});
