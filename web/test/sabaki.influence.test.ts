import { describe, expect, it } from "vitest";
import {
  applyDeadstoneThreshold,
  buildDeadStoneMap,
  calculateInfluenceScores,
  countDeadStones,
  normalizeOwnershipMap,
  toSignMap
} from "../src/app/sabakiInfluence";

describe("sabakiInfluence", () => {
  it("converts grid stones into sabaki sign map", () => {
    const signMap = toSignMap(3, [1, 2, 0, 0, 1, 2, 2, 0, 1]);

    expect(signMap).toEqual([
      [1, -1, 0],
      [0, 1, -1],
      [-1, 0, 1]
    ]);
  });

  it("removes dead stones when probability crosses threshold", () => {
    const signMap = [
      [1, -1, 0],
      [1, -1, 0],
      [0, 0, 0]
    ];
    const probability = [
      [-0.8, 0.9, 0],
      [0.2, -0.4, 0],
      [0, 0, 0]
    ];

    expect(applyDeadstoneThreshold(signMap, probability, 0.65)).toEqual([
      [0, 0, 0],
      [1, -1, 0],
      [0, 0, 0]
    ]);
  });

  it("builds dead stone map and counts black/white dead stones", () => {
    const signMap = [
      [1, -1, 0],
      [1, -1, 1],
      [0, 0, 0]
    ];
    const probability = [
      [-0.8, 0.9, 0],
      [0.2, -0.4, -0.8],
      [0, 0, 0]
    ];

    const deadStoneMap = buildDeadStoneMap(signMap, probability, 0.65);
    expect(deadStoneMap).toEqual([
      [1, -1, 0],
      [0, 0, 1],
      [0, 0, 0]
    ]);
    expect(countDeadStones(deadStoneMap)).toEqual({ B: 2, W: 1 });
  });

  it("calculates influence scores from ownership and captures", () => {
    const ownership = [
      [0.5, -0.2],
      [0.7, -0.9]
    ];
    const occupancy = [
      [0, 0],
      [1, 0]
    ];

    const score = calculateInfluenceScores(ownership, occupancy, 6.5, 2, 1);

    expect(score.blackScore).toBeCloseTo(2.5, 6);
    expect(score.whiteScore).toBeCloseTo(8.6, 6);
    expect(score.scoreLead).toBeCloseTo(-6.1, 6);
  });

  it("normalizes ownership map shape and clamps values", () => {
    const map = normalizeOwnershipMap(
      [
        [1.5, -1.4],
        [Number.NaN]
      ],
      2
    );

    expect(map).toEqual([
      [1, -1],
      [0, 0]
    ]);
  });
});
