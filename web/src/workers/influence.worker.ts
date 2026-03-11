type WorkerRequest =
  | {
      type: "warmup";
      id: number;
    }
  | {
      type: "analyze";
      id: number;
      payload: {
        boardSize: number;
        stones: number[];
        toPlay: "B" | "W";
        komi: number;
        capturesB: number;
        capturesW: number;
      };
    };

type WorkerResponse =
  | {
      type: "ready";
      id: number;
    }
  | {
      type: "result";
      id: number;
      payload: {
        ownership: number[][];
        blackScore: number;
        whiteScore: number;
        scoreLead: number;
      };
    }
  | {
      type: "error";
      id: number;
      code: string;
      message: string;
    };

type InfluenceSource = {
  color: 1 | 2;
  liberties: number;
};

const clamp = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (value > 1) return 1;
  if (value < -1) return -1;
  return value;
};

const SAFETY_WEIGHTS = [0, 0.22, 0.45, 0.68, 1.0];

const safetyWeight = (liberties: number): number => {
  const normalized = Math.max(0, Math.min(4, liberties));
  return SAFETY_WEIGHTS[normalized];
};

const hashBoard = (stones: number[], toPlay: "B" | "W"): number => {
  let hash = 2166136261 ^ (toPlay === "B" ? 0x4b : 0x57);
  for (let i = 0; i < stones.length; i += 1) {
    hash ^= stones[i] + 0x9e3779b9 + (hash << 6) + (hash >> 2);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const createRng = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const buildNeighbors = (boardSize: number): number[][] => {
  const neighbors = Array.from({ length: boardSize * boardSize }, () => [] as number[]);
  for (let y = 0; y < boardSize; y += 1) {
    for (let x = 0; x < boardSize; x += 1) {
      const idx = y * boardSize + x;
      if (x > 0) neighbors[idx].push(idx - 1);
      if (x + 1 < boardSize) neighbors[idx].push(idx + 1);
      if (y > 0) neighbors[idx].push(idx - boardSize);
      if (y + 1 < boardSize) neighbors[idx].push(idx + boardSize);
    }
  }
  return neighbors;
};

const analyzeGroups = (
  stones: number[],
  neighbors: number[][]
): { groupIndex: Int32Array; groups: InfluenceSource[] } => {
  const groupIndex = new Int32Array(stones.length);
  groupIndex.fill(-1);
  const groups: InfluenceSource[] = [];

  for (let i = 0; i < stones.length; i += 1) {
    const color = stones[i];
    if ((color !== 1 && color !== 2) || groupIndex[i] !== -1) continue;

    const stack = [i];
    const liberties = new Set<number>();
    const nextGroup = groups.length;
    groupIndex[i] = nextGroup;

    while (stack.length > 0) {
      const point = stack.pop() as number;
      for (const next of neighbors[point]) {
        const nextColor = stones[next];
        if (nextColor === 0) {
          liberties.add(next);
          continue;
        }
        if (nextColor === color && groupIndex[next] === -1) {
          groupIndex[next] = nextGroup;
          stack.push(next);
        }
      }
    }

    groups.push({
      color: color as 1 | 2,
      liberties: liberties.size
    });
  }

  return { groupIndex, groups };
};

const calcOwnership = (
  boardSize: number,
  stones: number[],
  toPlay: "B" | "W"
): { ownership: number[][] } => {
  const neighbors = buildNeighbors(boardSize);
  const { groupIndex, groups } = analyzeGroups(stones, neighbors);
  const ownership = Array.from({ length: boardSize }, () => Array.from({ length: boardSize }, () => 0));

  const occupied = stones.reduce((sum, value) => sum + (value === 0 ? 0 : 1), 0);
  const boardArea = boardSize * boardSize;
  const baseSamples = boardSize >= 19 ? 28 : boardSize >= 13 ? 34 : 42;
  const samples =
    occupied > Math.floor(boardArea * 0.6)
      ? Math.max(14, baseSamples - 10)
      : occupied > Math.floor(boardArea * 0.35)
        ? Math.max(18, baseSamples - 6)
        : baseSamples;
  const maxSteps = boardSize * 2 + 8;

  const random = createRng(hashBoard(stones, toPlay));

  for (let y = 0; y < boardSize; y += 1) {
    for (let x = 0; x < boardSize; x += 1) {
      const index = y * boardSize + x;
      if ((stones[index] ?? 0) !== 0) {
        ownership[y][x] = 0;
        continue;
      }

      let black = 0;
      let white = 0;

      for (let sample = 0; sample < samples; sample += 1) {
        let point = index;
        let previous = -1;

        for (let step = 0; step < maxSteps; step += 1) {
          const stone = stones[point] ?? 0;
          if (stone === 1 || stone === 2) {
            const group = groups[groupIndex[point]];
            const weight = safetyWeight(group?.liberties ?? 4);
            if (stone === 1) {
              black += weight;
            } else {
              white += weight;
            }
            break;
          }

          const nextCandidates = neighbors[point];
          if (nextCandidates.length === 0) break;

          let next = nextCandidates[Math.floor(random() * nextCandidates.length)];
          if (nextCandidates.length > 1 && next === previous) {
            next = nextCandidates[Math.floor(random() * nextCandidates.length)];
          }

          previous = point;
          point = next;
        }
      }

      const total = black + white;
      ownership[y][x] = total < 1e-9 ? 0 : clamp((black - white) / total);
    }
  }

  return { ownership };
};

const smoothOwnership = (ownership: number[][]): number[][] => {
  const size = ownership.length;
  const smoothed = Array.from({ length: size }, () => Array.from({ length: size }, () => 0));
  const dirs = [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ] as const;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let sum = 0;
      let count = 0;
      for (const [dx, dy] of dirs) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        sum += ownership[ny][nx];
        count += 1;
      }
      smoothed[y][x] = clamp(sum / Math.max(1, count));
    }
  }

  return smoothed;
};

const computeInfluence = (
  boardSize: number,
  stones: number[],
  toPlay: "B" | "W",
  komi: number,
  capturesB: number,
  capturesW: number
): { ownership: number[][]; blackScore: number; whiteScore: number; scoreLead: number } => {
  const { ownership: rawOwnership } = calcOwnership(boardSize, stones, toPlay);
  const ownership = smoothOwnership(rawOwnership);

  let blackInfluence = 0;
  let whiteInfluence = 0;
  for (let y = 0; y < boardSize; y += 1) {
    for (let x = 0; x < boardSize; x += 1) {
      const index = y * boardSize + x;
      if ((stones[index] ?? 0) !== 0) continue;
      const value = ownership[y][x];
      if (value > 0) blackInfluence += value;
      if (value < 0) whiteInfluence += -value;
    }
  }

  const blackScore = blackInfluence + capturesB;
  const whiteScore = whiteInfluence + capturesW + komi;
  const scoreLead = blackScore - whiteScore;

  return {
    ownership,
    blackScore,
    whiteScore,
    scoreLead
  };
};

const send = (message: WorkerResponse) => {
  postMessage(message);
};

onmessage = (event: MessageEvent<WorkerRequest>) => {
  const data = event.data;

  if (data.type === "warmup") {
    send({ type: "ready", id: data.id });
    return;
  }

  try {
    const { boardSize, stones, toPlay, komi, capturesB, capturesW } = data.payload;
    const result = computeInfluence(boardSize, stones, toPlay, komi, capturesB, capturesW);
    send({
      type: "result",
      id: data.id,
      payload: result
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to compute influence";
    send({
      type: "error",
      id: data.id,
      code: "LOCAL_INFLUENCE_FAILED",
      message
    });
  }
};
