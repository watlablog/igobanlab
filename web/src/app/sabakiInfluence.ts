export const DEADSTONE_ITERATIONS = 24;
export const DEADSTONE_THRESHOLD = 0.65;

export const SABAKI_INFLUENCE_OPTIONS = {
  maxDistance: 6,
  minRadiance: 2
} as const;

export const clampOwnershipValue = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (value > 1) return 1;
  if (value < -1) return -1;
  return value;
};

export const toSignMap = (boardSize: number, stones: number[]): number[][] =>
  Array.from({ length: boardSize }, (_, y) =>
    Array.from({ length: boardSize }, (_, x) => {
      const stone = stones[y * boardSize + x] ?? 0;
      if (stone === 1) return 1;
      if (stone === 2) return -1;
      return 0;
    })
  );

export const normalizeOwnershipMap = (ownership: number[][], boardSize: number): number[][] =>
  Array.from({ length: boardSize }, (_, y) =>
    Array.from({ length: boardSize }, (_, x) => clampOwnershipValue(ownership[y]?.[x] ?? 0))
  );

export const buildDeadStoneMap = (
  signMap: number[][],
  probabilityMap: number[][],
  threshold = DEADSTONE_THRESHOLD
): Array<Array<-1 | 0 | 1>> =>
  signMap.map((row, y) =>
    row.map((sign, x) => {
      if (sign === 0) return 0;
      const probability = clampOwnershipValue(probabilityMap[y]?.[x] ?? 0);
      if (sign * probability <= -threshold) {
        return sign > 0 ? 1 : -1;
      }
      return 0;
    })
  );

export const applyDeadstoneThreshold = (
  signMap: number[][],
  probabilityMap: number[][],
  threshold = DEADSTONE_THRESHOLD
): number[][] => {
  const deadStoneMap = buildDeadStoneMap(signMap, probabilityMap, threshold);
  return signMap.map((row, y) => row.map((sign, x) => (deadStoneMap[y][x] === 0 ? sign : 0)));
};

export const countDeadStones = (
  deadStoneMap: Array<Array<-1 | 0 | 1>>
): { B: number; W: number } => {
  let B = 0;
  let W = 0;

  for (let y = 0; y < deadStoneMap.length; y += 1) {
    for (let x = 0; x < deadStoneMap[y].length; x += 1) {
      const value = deadStoneMap[y][x];
      if (value === 1) B += 1;
      if (value === -1) W += 1;
    }
  }

  return { B, W };
};

export const calculateInfluenceScores = (
  ownership: number[][],
  occupancySignMap: number[][],
  komi: number,
  capturesB: number,
  capturesW: number
): { blackScore: number; whiteScore: number; scoreLead: number } => {
  let blackInfluence = 0;
  let whiteInfluence = 0;

  for (let y = 0; y < ownership.length; y += 1) {
    for (let x = 0; x < ownership[y].length; x += 1) {
      if ((occupancySignMap[y]?.[x] ?? 0) !== 0) continue;
      const value = clampOwnershipValue(ownership[y][x]);
      if (value > 0) blackInfluence += value;
      if (value < 0) whiteInfluence += -value;
    }
  }

  const blackScore = blackInfluence + capturesB;
  const whiteScore = whiteInfluence + capturesW + komi;
  return {
    blackScore,
    whiteScore,
    scoreLead: blackScore - whiteScore
  };
};
