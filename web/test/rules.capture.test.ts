import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/state";
import { applyMove } from "../src/game/rules";

describe("capture rules", () => {
  it("captures a single surrounded stone", () => {
    const state = createInitialState(3);
    state.toPlay = "B";

    // . B .
    // B W B
    // . . .
    state.grid[1] = 1;
    state.grid[3] = 1;
    state.grid[4] = 2;
    state.grid[5] = 1;

    const next = applyMove(state, { x: 1, y: 2 });
    expect(next).not.toBeInstanceOf(Error);
    if (next instanceof Error) return;

    expect(next.grid[4]).toBe(0);
    expect(next.grid[7]).toBe(1);
    expect(next.captures.B).toBe(1);
    expect(next.captures.W).toBe(0);
  });

  it("captures two separate groups in one move", () => {
    const state = createInitialState(3);
    state.toPlay = "B";

    // B W B
    // . . .
    // B W B
    // B plays center to capture both W stones.
    state.grid[0] = 1;
    state.grid[1] = 2;
    state.grid[2] = 1;
    state.grid[6] = 1;
    state.grid[7] = 2;
    state.grid[8] = 1;

    const next = applyMove(state, { x: 1, y: 1 });
    expect(next).not.toBeInstanceOf(Error);
    if (next instanceof Error) return;

    expect(next.grid[1]).toBe(0);
    expect(next.grid[7]).toBe(0);
    expect(next.grid[4]).toBe(1);
    expect(next.captures.B).toBe(2);
  });
});
