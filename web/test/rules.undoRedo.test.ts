import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/state";
import { applyMove, applyPass, redo, undo } from "../src/game/rules";

describe("undo / redo / pass", () => {
  it("pass toggles turn and records move", () => {
    const state = createInitialState(9);
    const next = applyPass(state);

    expect(next.toPlay).toBe("W");
    expect(next.moves).toEqual([{ pass: true }]);
    expect(next.history.length).toBe(1);
  });

  it("undo and redo preserve board and captures", () => {
    const base = createInitialState(3);
    base.toPlay = "B";

    // . B .
    // B W B
    // . . .
    base.grid[1] = 1;
    base.grid[3] = 1;
    base.grid[4] = 2;
    base.grid[5] = 1;

    const afterCapture = applyMove(base, { x: 1, y: 2 });
    if (afterCapture instanceof Error) throw afterCapture;

    const undone = undo(afterCapture);
    expect(undone.grid[4]).toBe(2);
    expect(undone.grid[7]).toBe(0);
    expect(undone.captures.B).toBe(0);

    const redone = redo(undone);
    expect(redone.grid[4]).toBe(0);
    expect(redone.grid[7]).toBe(1);
    expect(redone.captures.B).toBe(1);
  });
});
