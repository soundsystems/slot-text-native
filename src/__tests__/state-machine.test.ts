import { afterEach, describe, expect, it, jest } from "bun:test";
import {
  SlotTextMachine,
  type SlotTextMachineDelegate,
} from "../state-machine";
import type { TransitionPlan } from "../types";

const PAINT_GRACE_MS = 400;

const createHarness = (transitionDuration: number | undefined = 100) => {
  const settled: string[] = [];
  const transitions: [string, string][] = [];
  const plans: TransitionPlan[] = [];
  const delegate: SlotTextMachineDelegate = {
    settle(text) {
      settled.push(text);
    },
    startTransition(fromText, toText, plan) {
      transitions.push([fromText, toText]);
      plans.push(plan);
      return transitionDuration;
    },
  };

  return {
    machine: new SlotTextMachine("A", { duration: 0 }, delegate),
    plans,
    settled,
    transitions,
  };
};

afterEach(() => {
  jest.useRealTimers();
});

describe("SlotTextMachine", () => {
  it("keeps the latest requested value when it matches the running target", () => {
    jest.useFakeTimers();
    const { machine, settled, transitions } = createHarness();

    machine.set("B", { interrupt: false });
    machine.set("C", { interrupt: false });
    machine.set("B", { interrupt: false });
    machine.notePainted();
    jest.advanceTimersByTime(200);

    expect(machine.value).toBe("B");
    expect(transitions).toEqual([["A", "B"]]);
    expect(settled).toEqual(["B"]);
  });

  it("does not cut a running roll when the same target is re-asserted with interrupt", () => {
    jest.useFakeTimers();
    const { machine, settled, transitions } = createHarness();

    machine.set("B");
    machine.notePainted();
    jest.advanceTimersByTime(50);
    machine.set("B");
    jest.advanceTimersByTime(49);

    // The roll is still running; a same-target set must not settle it early.
    expect(settled).toEqual([]);

    jest.advanceTimersByTime(1);
    expect(machine.value).toBe("B");
    expect(transitions).toEqual([["A", "B"]]);
    expect(settled).toEqual(["B"]);
  });

  it("plays a queued non-interrupting roll once the current one lands", () => {
    jest.useFakeTimers();
    const { machine, settled, transitions } = createHarness();

    machine.set("B", { interrupt: false });
    machine.notePainted();
    machine.set("C", { interrupt: false });
    // Only the latest queued request survives a burst.
    machine.set("D", { interrupt: false });
    expect(transitions).toEqual([["A", "B"]]);

    jest.advanceTimersByTime(100);
    expect(settled).toEqual(["B"]);
    expect(transitions).toEqual([
      ["A", "B"],
      ["B", "D"],
    ]);
  });

  it("snaps an interrupted roll to its target before starting the next", () => {
    jest.useFakeTimers();
    const { machine, settled, transitions } = createHarness();

    machine.set("B");
    machine.notePainted();
    jest.advanceTimersByTime(50);
    machine.set("C");

    // "B" is published even though its roll never finished, so the next roll
    // starts from a settled baseline instead of a half-swapped word.
    expect(settled).toEqual(["B"]);
    expect(transitions).toEqual([
      ["A", "B"],
      ["B", "C"],
    ]);
  });

  it("anchors the settle countdown to the paint signal", () => {
    jest.useFakeTimers();
    const { machine, settled } = createHarness();

    machine.set("B");
    // Paint lands late (e.g. a busy JS thread); the countdown restarts there.
    jest.advanceTimersByTime(300);
    machine.notePainted();
    jest.advanceTimersByTime(99);
    expect(settled).toEqual([]);
    jest.advanceTimersByTime(1);
    expect(settled).toEqual(["B"]);
  });

  it("settles via the grace fallback when the roll never paints", () => {
    jest.useFakeTimers();
    const { machine, settled } = createHarness();

    machine.set("B");
    jest.advanceTimersByTime(100 + PAINT_GRACE_MS - 1);
    expect(settled).toEqual([]);
    jest.advanceTimersByTime(1);
    expect(settled).toEqual(["B"]);
  });

  it("settles immediately when the renderer declines to animate", () => {
    jest.useFakeTimers();
    const { machine, settled } = createHarness(0);

    machine.set("B");
    expect(settled).toEqual(["B"]);
    expect(machine.value).toBe("B");
  });

  it("builds the transition plan exactly once per roll", () => {
    jest.useFakeTimers();
    const { machine, plans } = createHarness();

    machine.set("B", { duration: 300 });
    expect(plans).toHaveLength(1);
    expect(plans[0]?.fromChars).toEqual(["A"]);
    expect(plans[0]?.toChars).toEqual(["B"]);
  });

  it("starts the flash dwell after the entry transition settles", () => {
    jest.useFakeTimers();
    const { machine, transitions } = createHarness();

    machine.flash("B", { revertAfter: 50 });
    machine.notePainted();
    jest.advanceTimersByTime(100);

    expect(machine.value).toBe("B");
    expect(transitions).toEqual([["A", "B"]]);

    jest.advanceTimersByTime(49);
    expect(machine.value).toBe("B");

    jest.advanceTimersByTime(1);
    expect(machine.value).toBe("A");
    expect(transitions).toEqual([
      ["A", "B"],
      ["B", "A"],
    ]);
  });

  it("reverts to the original label after a burst of flashes", () => {
    jest.useFakeTimers();
    const { machine, transitions } = createHarness();

    machine.flash("B", { revertAfter: 50 });
    machine.notePainted();
    jest.advanceTimersByTime(100);
    // A second flash mid-dwell restarts the timer and still reverts to "A".
    machine.flash("C", { revertAfter: 50 });
    machine.notePainted();
    jest.advanceTimersByTime(150);
    machine.notePainted();
    jest.advanceTimersByTime(100);

    expect(machine.value).toBe("A");
    expect(transitions.at(-1)).toEqual(["C", "A"]);
  });

  it("cancels a pending flash revert when set() wins the race", () => {
    jest.useFakeTimers();
    const { machine, transitions } = createHarness();

    machine.flash("B", { revertAfter: 50 });
    machine.notePainted();
    jest.advanceTimersByTime(100);
    machine.set("Z");
    machine.notePainted();
    jest.advanceTimersByTime(500);

    expect(machine.value).toBe("Z");
    expect(transitions).toEqual([
      ["A", "B"],
      ["B", "Z"],
    ]);
  });

  it("ignores every command after destroy and settles on the last value", () => {
    jest.useFakeTimers();
    const { machine, settled, transitions } = createHarness();

    machine.set("B");
    machine.notePainted();
    machine.destroy();
    expect(settled).toEqual(["B"]);

    machine.set("C");
    machine.flash("D");
    jest.advanceTimersByTime(1000);
    expect(machine.value).toBe("B");
    expect(transitions).toEqual([["A", "B"]]);
  });
});
