import { afterEach, describe, expect, it, jest } from "bun:test";
import type { ReactElement } from "react";
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from "react-test-renderer";
import { SlotText } from "../slot-text";

const MAX_ACTIVE_ROLLS = 16;

const hostType = (node: ReactTestInstance) => node.type as unknown as string;

// The roll counter is module-global by design, so every renderer here must be
// unmounted between tests — unmount destroys the machine, which settles and
// releases the label's slot.
const mounted: ReactTestRenderer[] = [];

const render = (element: ReactElement) => {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(element);
  });
  mounted.push(renderer as ReactTestRenderer);
  return renderer as ReactTestRenderer;
};

const measure = (renderer: ReactTestRenderer) => {
  act(() => {
    for (const sizer of renderer.root.findAll(
      (node) => typeof node.props?.onLayout === "function"
    )) {
      sizer.props.onLayout({
        nativeEvent: { layout: { height: 20, width: 10 } },
      });
    }
    jest.advanceTimersByTime(1);
  });
};

const rollingLabels = (renderer: ReactTestRenderer) =>
  renderer.root.findAll((node) => hostType(node) === "AnimatedView").length;

const settledLabels = (renderer: ReactTestRenderer) =>
  renderer.root
    .findAll(
      (node) =>
        hostType(node) === "Text" && typeof node.props?.onLayout !== "function"
    )
    .map((node) => node.props.children as string);

function Wall({ count, text }: { count: number; text: string }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <SlotText key={index} text={text} warmupChars="ab" />
      ))}
    </>
  );
}

afterEach(() => {
  act(() => {
    for (const renderer of mounted) {
      renderer.unmount();
    }
  });
  mounted.length = 0;
  jest.useRealTimers();
});

describe("simultaneous roll cap", () => {
  it("rolls up to the cap and publishes the rest instantly", () => {
    jest.useFakeTimers();
    const total = MAX_ACTIVE_ROLLS + 4;
    const renderer = render(<Wall count={total} text="a" />);
    measure(renderer);

    act(() => {
      renderer.update(<Wall count={total} text="b" />);
    });

    // A screen-wide retarget costs a bounded number of visible rolls...
    expect(rollingLabels(renderer)).toBe(MAX_ACTIVE_ROLLS);
    // ...and every label still shows the new text, rolled or not.
    const settled = settledLabels(renderer);
    expect(settled).toHaveLength(total - MAX_ACTIVE_ROLLS);
    expect(settled.every((label) => label === "b")).toBe(true);
  });

  it("stays under the cap without starving later rolls", () => {
    jest.useFakeTimers();
    const renderer = render(<Wall count={MAX_ACTIVE_ROLLS + 4} text="a" />);
    measure(renderer);

    act(() => {
      renderer.update(<Wall count={MAX_ACTIVE_ROLLS + 4} text="b" />);
    });
    expect(rollingLabels(renderer)).toBe(MAX_ACTIVE_ROLLS);

    // Let every roll settle, which hands all the slots back.
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(rollingLabels(renderer)).toBe(0);

    act(() => {
      renderer.update(<Wall count={MAX_ACTIVE_ROLLS + 4} text="a" />);
    });
    expect(rollingLabels(renderer)).toBe(MAX_ACTIVE_ROLLS);
  });

  it("does not consume a slot for a label with nothing to animate", () => {
    jest.useFakeTimers();
    const renderer = render(<Wall count={MAX_ACTIVE_ROLLS} text="a" />);
    measure(renderer);

    // Re-asserting the same text is not a roll, so it must not hold a slot.
    act(() => {
      renderer.update(<Wall count={MAX_ACTIVE_ROLLS} text="a" />);
    });

    const solo = render(<SlotText text="a" warmupChars="b" />);
    measure(solo);
    act(() => {
      solo.update(<SlotText text="b" warmupChars="b" />);
    });

    expect(rollingLabels(solo)).toBe(1);
  });

  it("releases the slot when a rolling label unmounts", () => {
    jest.useFakeTimers();
    const wall = render(<Wall count={MAX_ACTIVE_ROLLS} text="a" />);
    measure(wall);
    act(() => {
      wall.update(<Wall count={MAX_ACTIVE_ROLLS} text="b" />);
    });
    expect(rollingLabels(wall)).toBe(MAX_ACTIVE_ROLLS);

    // Tearing the wall down mid-roll must hand every slot back, or the cap
    // would leak and permanently disable animation for the rest of the app.
    act(() => {
      wall.unmount();
    });

    const solo = render(<SlotText text="a" warmupChars="b" />);
    measure(solo);
    act(() => {
      solo.update(<SlotText text="b" warmupChars="b" />);
    });

    expect(rollingLabels(solo)).toBe(1);
  });
});
