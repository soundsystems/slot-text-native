import type { FlashOptions, SlotOptions, TransitionPlan } from "./types";
import { buildTransitionPlan, normalizeOptions } from "./utils";

interface RunningTransition {
  onSettled?: () => void;
  painted: boolean;
  pending?: QueuedTransition;
  target: string;
  total: number;
}

// Extra settle-timer slack for the gap between startTransition and the roll's
// first committed frame (glyph measurement plus any JS-thread congestion).
// notePainted() re-anchors the countdown to the actual paint, so this only
// bounds how long an unpainted transition may hold the machine open.
const PAINT_GRACE_MS = 400;

interface QueuedTransition {
  onSettled?: () => void;
  options?: SlotOptions;
  text: string;
}

export interface SlotTextMachineDelegate {
  settle: (text: string) => void;
  /**
   * Render the roll. The plan is built once, here, and handed over — the
   * renderer must never recompute it. Return the duration the renderer will
   * actually take, or 0 to decline the animation entirely.
   */
  startTransition: (
    fromText: string,
    toText: string,
    plan: TransitionPlan
  ) => number | undefined;
}

export class SlotTextMachine {
  #baseOptions: SlotOptions;
  readonly #delegate: SlotTextMachineDelegate;
  #destroyed = false;
  #restingText: string | undefined;
  #revertTimeout: ReturnType<typeof setTimeout> | undefined;
  #running: RunningTransition | undefined;
  #settleTimeout: ReturnType<typeof setTimeout> | undefined;
  #settledText: string;
  #value: string;

  constructor(
    initialText: string,
    baseOptions: SlotOptions,
    delegate: SlotTextMachineDelegate
  ) {
    this.#baseOptions = baseOptions;
    this.#delegate = delegate;
    this.#settledText = initialText;
    this.#value = initialText;
  }

  get value() {
    return this.#value;
  }

  setBaseOptions(options: SlotOptions = {}) {
    this.#baseOptions = options;
  }

  set(text: string, options: SlotOptions = {}) {
    if (this.#destroyed) {
      return;
    }

    this.#clearRevert();
    this.#restingText = undefined;
    this.#animateTo(text, options);
  }

  flash(text: string, { revertAfter = 1400, enter, exit }: FlashOptions = {}) {
    if (this.#destroyed) {
      return;
    }

    if (this.#restingText === undefined) {
      this.#restingText = this.#value;
    }

    this.#clearRevert();
    this.#animateTo(
      text,
      {
        interrupt: false,
        ...enter,
      },
      () => {
        this.#revertTimeout = setTimeout(() => {
          const back = this.#restingText ?? this.#settledText;
          this.#restingText = undefined;
          this.#revertTimeout = undefined;
          this.#animateTo(back, {
            interrupt: false,
            ...exit,
          });
        }, revertAfter);
      }
    );
  }

  destroy() {
    this.#destroyed = true;
    this.#clearRevert();
    this.#clearSettle();
    this.#running = undefined;
    this.#settledText = this.#value;
    this.#delegate.settle(this.#value);
  }

  #animateTo(text: string, options: SlotOptions = {}, onSettled?: () => void) {
    const merged = {
      ...this.#baseOptions,
      ...options,
    };
    const normalized = normalizeOptions(merged);

    // Re-asserting the running target must never cut the roll short: parent
    // re-renders can re-fire set() with the same text mid-transition, and
    // interrupt semantics only apply when the destination actually changes.
    if (this.#running && text === this.#running.target) {
      this.#running.pending = undefined;
      this.#running.onSettled = onSettled;
      this.#value = text;
      return;
    }

    if (this.#running && !normalized.interrupt) {
      this.#running.onSettled = undefined;
      this.#running.pending = { onSettled, options, text };
      this.#value = text;
      return;
    }

    if (this.#running) {
      this.#clearSettle();
      this.#settledText = this.#running.target;
      this.#delegate.settle(this.#settledText);
      this.#running = undefined;
    }

    this.#value = text;

    if (this.#settledText === text && normalized.skipUnchanged) {
      this.#delegate.settle(text);
      onSettled?.();
      return;
    }

    const fromText = this.#settledText;
    // Built once and handed to the renderer. Nothing downstream re-splits the
    // graphemes or re-derives the per-glyph timings.
    const plan = buildTransitionPlan(fromText, text, normalized);
    this.#running = { onSettled, painted: false, target: text, total: 0 };
    const delegateDuration = this.#delegate.startTransition(
      fromText,
      text,
      plan
    );
    // A delegate returning exactly 0 declined to animate (e.g. nothing to
    // show): settle immediately instead of waiting out the plan.
    const total =
      delegateDuration === 0 ? 0 : Math.max(delegateDuration ?? 0, plan.total);

    if (total <= 0) {
      this.#finishTransition();
      return;
    }

    this.#running.total = total;
    this.#settleTimeout = setTimeout(() => {
      this.#finishTransition();
    }, total + PAINT_GRACE_MS);
  }

  /**
   * Signal that the running transition's roll has committed its first frame.
   * Re-anchors the settle countdown to the paint so slow measurement or a
   * busy JS thread cannot swallow the visible animation window.
   */
  notePainted() {
    const running = this.#running;
    if (this.#destroyed || !running || running.painted) {
      return;
    }
    running.painted = true;
    this.#clearSettle();
    this.#settleTimeout = setTimeout(() => {
      this.#finishTransition();
    }, running.total);
  }

  #finishTransition() {
    const running = this.#running;

    if (!running) {
      return;
    }

    this.#clearSettle();
    this.#settledText = running.target;
    this.#running = undefined;
    this.#delegate.settle(running.target);

    if (running.pending) {
      this.#animateTo(
        running.pending.text,
        running.pending.options,
        running.pending.onSettled
      );
      return;
    }

    running.onSettled?.();
  }

  #clearRevert() {
    if (this.#revertTimeout) {
      clearTimeout(this.#revertTimeout);
      this.#revertTimeout = undefined;
    }
  }

  #clearSettle() {
    if (this.#settleTimeout) {
      clearTimeout(this.#settleTimeout);
      this.#settleTimeout = undefined;
    }
  }
}
