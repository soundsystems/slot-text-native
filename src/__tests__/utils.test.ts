import { describe, expect, it } from "bun:test";
import {
  buildTransitionPlan,
  chromatic,
  getGlyphTiming,
  getWidthTiming,
  normalizeOptions,
  splitGraphemes,
  toRgba,
  withoutMotion,
} from "../utils";

describe("splitGraphemes", () => {
  it("keeps ZWJ emoji sequences in one cell", () => {
    expect(splitGraphemes("a👨‍👩‍👧b")).toEqual(["a", "👨‍👩‍👧", "b"]);
  });

  it("keeps combining marks attached to their base letter", () => {
    expect(splitGraphemes("éx")).toEqual(["é", "x"]);
  });
});

describe("chromatic", () => {
  it("sweeps the hue across the line and wraps past 360", () => {
    const color = chromatic({ from: 60, spread: 320 });
    expect(color(0, 3)).toBe("hsl(60, 92%, 60%)");
    expect(color(2, 3)).toBe("hsl(20, 92%, 60%)");
  });

  it("pins a single glyph to the start of the sweep", () => {
    expect(chromatic()(0, 1)).toBe("hsl(0, 92%, 60%)");
  });
});

describe("getGlyphTiming", () => {
  it("is deterministic for a given index", () => {
    const options = normalizeOptions();
    expect(getGlyphTiming(2, 5, "c", options)).toEqual(
      getGlyphTiming(2, 5, "c", options)
    );
  });

  it("collapses to a single lockstep wave when bounce is zero", () => {
    const options = normalizeOptions({ bounce: 0, duration: 300, stagger: 40 });
    expect(getGlyphTiming(3, 5, "c", options)).toEqual({
      base: 120,
      duration: 300,
      tilt: 0,
    });
  });

  it("pulls tail glyphs into the middle of the wave instead of behind it", () => {
    const options = normalizeOptions({ bounce: 0, duration: 300, stagger: 40 });
    const tail = getGlyphTiming(5, 3, "", options);
    const last = getGlyphTiming(2, 3, "c", options);
    // A glyph rolling out to nothing must not start after the new word lands.
    expect(tail.base).toBeLessThan(last.base + last.duration);
    expect(tail.duration).toBeLessThan(last.duration);
  });
});

describe("getWidthTiming", () => {
  const timing = { base: 100, duration: 300, tilt: 0 };

  it("opens an empty cell before the glyph rolls in", () => {
    expect(getWidthTiming("", "a", timing)).toEqual({
      delay: 100,
      duration: 140,
    });
  });

  it("holds full width until the outgoing glyph has visibly rolled", () => {
    expect(getWidthTiming("a", "", timing)).toEqual({
      delay: 265,
      duration: 180,
    });
  });

  it("resizes alongside the roll for a glyph-to-glyph swap", () => {
    expect(getWidthTiming("a", "b", timing)).toEqual({
      delay: 100,
      duration: 300,
    });
  });
});

describe("buildTransitionPlan", () => {
  it("holds unchanged glyphs static and rolls the rest", () => {
    const plan = buildTransitionPlan("Copy", "Copied");
    expect(plan.entries.map((entry) => entry.animates)).toEqual([
      false,
      false,
      false,
      true,
      true,
      true,
    ]);
    expect(plan.changed).toBe(true);
    expect(plan.maxLen).toBe(6);
  });

  it("rolls every glyph when skipUnchanged is off", () => {
    const plan = buildTransitionPlan("Copy", "Copied", {
      skipUnchanged: false,
    });
    expect(plan.entries.every((entry) => entry.animates)).toBe(true);
  });

  it("reports no change and no duration for identical text", () => {
    const plan = buildTransitionPlan("Copy", "Copy");
    expect(plan.changed).toBe(false);
    expect(plan.total).toBe(0);
  });

  it("marks a zero-duration swap as changed but instant", () => {
    const plan = buildTransitionPlan("Copy", "Paste", { duration: 0 });
    expect(plan.changed).toBe(true);
    expect(plan.total).toBe(0);
    expect(plan.entries.every((entry) => entry.animates)).toBe(false);
  });

  it("covers the slowest glyph, its colour fade and its width close", () => {
    const plan = buildTransitionPlan("ab", "xyz", {
      bounce: 0,
      color: "#ff0000",
      colorFade: 200,
      duration: 300,
      exitOffset: 50,
      stagger: 40,
    });
    // Last glyph: base 80 + exitOffset 50 + duration 300 + fade 200, + tail.
    expect(plan.total).toBe(710);
  });

  it("splits graphemes once and hands the arrays to the renderer", () => {
    const plan = buildTransitionPlan("añ", "año");
    expect(plan.fromChars).toEqual(["a", "ñ"]);
    expect(plan.toChars).toEqual(["a", "ñ", "o"]);
  });
});

describe("buildTransitionPlan alignment", () => {
  it("keeps the ones column still when a number grows a digit", () => {
    const plan = buildTransitionPlan("99", "100", { align: "end" });
    expect(plan.entries.map((entry) => [entry.fromChar, entry.toChar])).toEqual(
      [
        ["", "1"],
        ["9", "0"],
        ["9", "0"],
      ]
    );
  });

  it("keeps the ones column still when a number loses a digit", () => {
    const plan = buildTransitionPlan("100", "99", { align: "end" });
    expect(plan.entries.map((entry) => [entry.fromChar, entry.toChar])).toEqual(
      [
        ["1", ""],
        ["0", "9"],
        ["0", "9"],
      ]
    );
  });

  it("still joins back to the original strings after padding", () => {
    const plan = buildTransitionPlan("99", "100", { align: "end" });
    expect(plan.fromChars.join("")).toBe("99");
    expect(plan.toChars.join("")).toBe("100");
  });

  it("defaults to start alignment, matching the web library", () => {
    const plan = buildTransitionPlan("99", "100");
    expect(plan.entries.map((entry) => [entry.fromChar, entry.toChar])).toEqual(
      [
        ["9", "1"],
        ["9", "0"],
        ["", "0"],
      ]
    );
  });

  it("indexes the chromatic sweep against real glyphs, not padding", () => {
    const plan = buildTransitionPlan("9", "100", {
      align: "end",
      color: (index, total) => `${index}/${total}`,
    });
    expect(plan.entries.map((entry) => entry.tint)).toEqual([
      "0/3",
      "1/3",
      "2/3",
    ]);
  });
});

describe("withoutMotion", () => {
  it("zeroes every timing while preserving behavioural options", () => {
    const reduced = withoutMotion({
      color: "#ff0000",
      duration: 300,
      interrupt: false,
      skipUnchanged: false,
      stagger: 45,
    });
    expect(reduced).toEqual({
      bounce: 0,
      color: "#ff0000",
      colorFade: 0,
      duration: 0,
      exitOffset: 0,
      interrupt: false,
      skipUnchanged: false,
      stagger: 0,
    });
  });
});

describe("toRgba", () => {
  it("unpacks a processed colour into channels once", () => {
    expect(toRgba("#ff0000")).toEqual({ a: 1, b: 0, g: 0, r: 255 });
  });

  it("returns undefined for an absent colour", () => {
    expect(toRgba(undefined)).toBeUndefined();
  });
});
