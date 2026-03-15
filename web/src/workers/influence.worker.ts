import * as influenceModule from "@sabaki/influence";
import * as deadstonesModule from "@sabaki/deadstones";
import deadstonesWasmUrl from "@sabaki/deadstones/wasm/deadstones_bg.wasm?url";
import {
  DEADSTONE_ITERATIONS,
  SABAKI_INFLUENCE_OPTIONS,
  applyDeadstoneThreshold,
  buildDeadStoneMap,
  calculateInfluenceScores,
  countDeadStones,
  normalizeOwnershipMap,
  toSignMap
} from "../app/sabakiInfluence";

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
        deadStoneMap: Array<Array<-1 | 0 | 1>>;
        deadStones: { B: number; W: number };
        blackScore: number;
        whiteScore: number;
        scoreLead: number;
        quality: "quick" | "fallback";
      };
    }
  | {
      type: "error";
      id: number;
      code: string;
      message: string;
    };

type InfluenceApi = {
  map(data: number[][], options?: { discrete?: boolean; maxDistance?: number; minRadiance?: number }): number[][];
};

type DeadstonesApi = {
  useFetch(path: string): unknown;
  getProbabilityMap(data: number[][], iterations: number): Promise<number[][]>;
};

const influence =
  (influenceModule as unknown as { default?: InfluenceApi }).default ??
  (influenceModule as unknown as InfluenceApi);
const deadstones =
  (deadstonesModule as unknown as { default?: DeadstonesApi }).default ??
  (deadstonesModule as unknown as DeadstonesApi);

if (typeof deadstones?.useFetch === "function") {
  deadstones.useFetch(deadstonesWasmUrl);
}

const canUseDeadstones = typeof deadstones?.getProbabilityMap === "function";

const send = (message: WorkerResponse) => {
  postMessage(message);
};

const computeInfluence = async (
  boardSize: number,
  stones: number[],
  komi: number,
  capturesB: number,
  capturesW: number
): Promise<{
  ownership: number[][];
  deadStoneMap: Array<Array<-1 | 0 | 1>>;
  deadStones: { B: number; W: number };
  blackScore: number;
  whiteScore: number;
  scoreLead: number;
  quality: "quick" | "fallback";
}> => {
  const signMap = toSignMap(boardSize, stones);
  const baseOwnership = normalizeOwnershipMap(influence.map(signMap, SABAKI_INFLUENCE_OPTIONS), boardSize);
  const emptyDeadStoneMap = Array.from({ length: boardSize }, () =>
    Array.from({ length: boardSize }, () => 0 as -1 | 0 | 1)
  );

  let quality: "quick" | "fallback" = "quick";
  let scoringSignMap = signMap;
  let ownership = baseOwnership;
  let deadStoneMap = emptyDeadStoneMap;

  if (canUseDeadstones) {
    try {
      const probabilityMap = normalizeOwnershipMap(
        await deadstones.getProbabilityMap(signMap, DEADSTONE_ITERATIONS),
        boardSize
      );
      deadStoneMap = buildDeadStoneMap(signMap, probabilityMap);
      scoringSignMap = applyDeadstoneThreshold(signMap, probabilityMap);
      ownership = normalizeOwnershipMap(influence.map(scoringSignMap, SABAKI_INFLUENCE_OPTIONS), boardSize);
    } catch {
      quality = "fallback";
    }
  } else {
    quality = "fallback";
  }

  const score = calculateInfluenceScores(ownership, scoringSignMap, komi, capturesB, capturesW);
  const deadStones = countDeadStones(deadStoneMap);
  return {
    ownership,
    deadStoneMap,
    deadStones,
    blackScore: score.blackScore,
    whiteScore: score.whiteScore,
    scoreLead: score.scoreLead,
    quality
  };
};

const handleMessage = async (data: WorkerRequest): Promise<void> => {
  if (data.type === "warmup") {
    send({ type: "ready", id: data.id });
    return;
  }

  try {
    const { boardSize, stones, komi, capturesB, capturesW } = data.payload;
    const result = await computeInfluence(boardSize, stones, komi, capturesB, capturesW);
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

onmessage = (event: MessageEvent<WorkerRequest>) => {
  void handleMessage(event.data);
};
