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
        deadMarks: boolean[];
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
  x: number;
  y: number;
  sign: 1 | -1;
  strength: number;
};

const clamp = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (value > 1) return 1;
  if (value < -1) return -1;
  return value;
};

const calcOwnership = (
  boardSize: number,
  stones: number[],
  deadMarks: boolean[]
): { ownership: number[][]; deadB: number; deadW: number } => {
  const sources: InfluenceSource[] = [];
  let deadB = 0;
  let deadW = 0;

  for (let y = 0; y < boardSize; y += 1) {
    for (let x = 0; x < boardSize; x += 1) {
      const index = y * boardSize + x;
      const stone = stones[index] ?? 0;
      const dead = deadMarks[index] === true;
      if (stone !== 1 && stone !== 2) continue;

      if (dead) {
        if (stone === 1) {
          deadB += 1;
          sources.push({ x, y, sign: -1, strength: 1.12 });
        } else {
          deadW += 1;
          sources.push({ x, y, sign: 1, strength: 1.12 });
        }
        continue;
      }

      sources.push({ x, y, sign: stone === 1 ? 1 : -1, strength: 1.0 });
    }
  }

  const radius = Math.max(8, Math.floor(boardSize * 0.75));
  const sigma = boardSize >= 13 ? 2.8 : 2.2;
  const ownership = Array.from({ length: boardSize }, () => Array.from({ length: boardSize }, () => 0));

  for (let y = 0; y < boardSize; y += 1) {
    for (let x = 0; x < boardSize; x += 1) {
      const index = y * boardSize + x;
      const stone = stones[index] ?? 0;
      const dead = deadMarks[index] === true;

      // Keep occupied vertices neutral so stone count itself does not dominate B/W/N.
      if ((stone === 1 || stone === 2) && !dead) {
        ownership[y][x] = 0;
        continue;
      }

      let black = 0;
      let white = 0;

      for (const source of sources) {
        const distance = Math.abs(source.x - x) + Math.abs(source.y - y);
        if (distance > radius) continue;
        const weight = source.strength * Math.exp(-distance / sigma);
        if (source.sign > 0) {
          black += weight;
        } else {
          white += weight;
        }
      }

      const total = black + white;
      if (total < 1e-9) {
        ownership[y][x] = 0;
        continue;
      }

      ownership[y][x] = clamp((black - white) / total);
    }
  }

  return { ownership, deadB, deadW };
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
  deadMarks: boolean[],
  komi: number,
  capturesB: number,
  capturesW: number
): { ownership: number[][]; blackScore: number; whiteScore: number; scoreLead: number } => {
  const { ownership: rawOwnership, deadB, deadW } = calcOwnership(boardSize, stones, deadMarks);
  const ownership = smoothOwnership(rawOwnership);

  let blackInfluence = 0;
  let whiteInfluence = 0;
  for (let y = 0; y < boardSize; y += 1) {
    for (let x = 0; x < boardSize; x += 1) {
      const value = ownership[y][x];
      if (value > 0) blackInfluence += value;
      if (value < 0) whiteInfluence += -value;
    }
  }

  const blackScore = blackInfluence + capturesB + deadW;
  const whiteScore = whiteInfluence + capturesW + deadB + komi;
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
    const { boardSize, stones, deadMarks, komi, capturesB, capturesW } = data.payload;
    const result = computeInfluence(boardSize, stones, deadMarks, komi, capturesB, capturesW);
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
