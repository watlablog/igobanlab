import { describe, expect, it } from "vitest";
import {
  buildMoveAnalysisRequest,
  buildScoreAnalysisRequest,
  summarizeOwnership
} from "../src/app/analysis";
import type { GameState } from "../src/types/models";

const sampleState: GameState = {
  boardSize: 19,
  komi: 6.5,
  handicap: 2,
  toPlay: "W",
  grid: new Int8Array(19 * 19),
  captures: { B: 1, W: 2 },
  moves: [{ x: 3, y: 3 }, { pass: true }],
  history: [],
  future: [],
  lastMove: { pass: true }
};

describe("analysis helpers", () => {
  it("builds score analysis request from game state", () => {
    const request = buildScoreAnalysisRequest(sampleState);
    expect(request.boardSize).toBe(19);
    expect(request.handicap).toBe(2);
    expect(request.rules).toBe("japanese");
    expect(request.maxVisits).toBe(12);
    expect(request.includeOwnership).toBe(false);
    expect(request.moves).toEqual([{ x: 3, y: 3 }, { pass: true }]);
  });

  it("builds move analysis request with topN", () => {
    const request = buildMoveAnalysisRequest(sampleState);
    expect(request.includeOwnership).toBe(false);
    expect(request.topN).toBe(3);
  });

  it("allows overriding score analysis options", () => {
    const request = buildScoreAnalysisRequest(sampleState, {
      includeOwnership: true,
      maxVisits: 8
    });
    expect(request.includeOwnership).toBe(true);
    expect(request.maxVisits).toBe(8);
  });

  it("summarizes ownership counts", () => {
    const summary = summarizeOwnership([
      [1, 1, 0],
      [-1, 0, -1],
      [0, 1, -1]
    ]);
    expect(summary).toEqual({ black: 3, white: 3, neutral: 3 });
  });
});
