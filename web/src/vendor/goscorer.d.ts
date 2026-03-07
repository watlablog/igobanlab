export const EMPTY: 0;
export const BLACK: 1;
export const WHITE: 2;

export type LocScore = {
  isTerritoryFor: 0 | 1 | 2;
  belongsToSekiGroup: 0 | 1 | 2;
};

export function territoryScoring(stones: number[][], markedDead?: boolean[][]): LocScore[][];

export function finalTerritoryScore(
  stones: number[][],
  markedDead?: boolean[][],
  blackCaptures?: number,
  whiteCaptures?: number,
  komi?: number
): { black: number; white: number };
