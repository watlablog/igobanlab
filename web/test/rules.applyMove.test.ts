import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/state";
import { applyMove } from "../src/game/rules";
import { InvalidMoveError } from "../src/types/models";

describe("applyMove", () => {
  it("places a stone and flips turn", () => {
    const state = createInitialState(9);
    const next = applyMove(state, { x: 4, y: 4 });

    expect(next).not.toBeInstanceOf(Error);
    if (next instanceof Error) return;

    expect(next.grid[4 + 4 * 9]).toBe(1);
    expect(next.toPlay).toBe("W");
    expect(next.moves).toEqual([{ x: 4, y: 4 }]);
    expect(next.history.length).toBe(1);
  });

  it("rejects occupied points", () => {
    const state = createInitialState(9);
    const first = applyMove(state, { x: 0, y: 0 });
    if (first instanceof Error) throw first;

    const result = applyMove(first, { x: 0, y: 0 });
    expect(result).toBeInstanceOf(InvalidMoveError);
    if (result instanceof InvalidMoveError) {
      expect(result.code).toBe("POINT_OCCUPIED");
    }
  });

  it("rejects suicide", () => {
    const state = createInitialState(3);
    state.toPlay = "B";

    // Board before move:
    // . W .
    // W . W
    // . W .
    // Black tries center and has no liberties without capture.
    state.grid[1] = 2;
    state.grid[3] = 2;
    state.grid[5] = 2;
    state.grid[7] = 2;

    const result = applyMove(state, { x: 1, y: 1 });
    expect(result).toBeInstanceOf(InvalidMoveError);
    if (result instanceof InvalidMoveError) {
      expect(result.code).toBe("SUICIDE");
    }
  });
});
