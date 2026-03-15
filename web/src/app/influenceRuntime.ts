import type { GameState, ScoreAnalysisResult } from "../types/models";

type WorkerRequest =
  | { type: "warmup"; id: number }
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
  | { type: "ready"; id: number }
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
  | { type: "error"; id: number; code: string; message: string };

type PendingRequest = {
  resolve: (value: WorkerResponse) => void;
  reject: (reason?: unknown) => void;
};

type InfluenceRequestInput = {
  state: GameState;
  localTimeoutMs?: number;
};

type CachedEntry = {
  value: ScoreAnalysisResult;
};

const CACHE_LIMIT = 64;
const DEFAULT_LOCAL_TIMEOUT_MS = 900;

let worker: Worker | null = null;
let workerRequestId = 0;
const pending = new Map<number, PendingRequest>();
const cache = new Map<string, CachedEntry>();

class LocalInfluenceError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "LocalInfluenceError";
    this.code = code;
  }
}

const nowMs = (): number => {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
};

const cloneOwnership = (ownership: number[][] | null): number[][] | null => {
  if (!ownership) return null;
  return ownership.map((row) => row.map((cell) => cell));
};

const cloneDeadStoneMap = (
  deadStoneMap: Array<Array<-1 | 0 | 1>> | null | undefined
): Array<Array<-1 | 0 | 1>> | null => {
  if (!deadStoneMap) return null;
  return deadStoneMap.map((row) => row.map((cell) => cell));
};

const cloneScoreResult = (result: ScoreAnalysisResult): ScoreAnalysisResult => ({
  ...result,
  ownership: cloneOwnership(result.ownership),
  deadStoneMap: cloneDeadStoneMap(result.deadStoneMap)
});

const setCache = (key: string, value: ScoreAnalysisResult): void => {
  if (cache.has(key)) {
    cache.delete(key);
  }
  cache.set(key, { value: cloneScoreResult(value) });
  while (cache.size > CACHE_LIMIT) {
    const firstKey = cache.keys().next().value;
    if (typeof firstKey !== "string") break;
    cache.delete(firstKey);
  }
};

const getCache = (key: string): ScoreAnalysisResult | null => {
  const entry = cache.get(key);
  if (!entry) return null;
  cache.delete(key);
  cache.set(key, entry);
  return cloneScoreResult(entry.value);
};

const ensureWorker = (): Worker => {
  if (worker) return worker;

  worker = new Worker(new URL("../workers/influence.worker.ts", import.meta.url), {
    type: "module"
  });

  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const data = event.data;
    const request = pending.get(data.id);
    if (!request) return;
    pending.delete(data.id);
    request.resolve(data);
  };

  worker.onerror = (event: ErrorEvent) => {
    for (const [id, request] of pending) {
      request.reject(new LocalInfluenceError("LOCAL_WORKER_CRASHED", event.message));
      pending.delete(id);
    }
  };

  return worker;
};

const requestWorker = async (request: WorkerRequest): Promise<WorkerResponse> => {
  const target = ensureWorker();
  return await new Promise<WorkerResponse>((resolve, reject) => {
    pending.set(request.id, { resolve, reject });
    target.postMessage(request);
  });
};

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return await new Promise<T>((resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new LocalInfluenceError("LOCAL_INFLUENCE_TIMEOUT", "Local influence estimation timed out."));
    }, timeoutMs);

    promise
      .then((value) => resolve(value))
      .catch((error) => reject(error))
      .finally(() => {
        if (timeoutId) clearTimeout(timeoutId);
      });
  });
};

const makeCacheKey = (state: GameState): string => {
  let stonesPart = "";
  for (let i = 0; i < state.grid.length; i += 1) {
    stonesPart += state.grid[i].toString();
  }
  return [
    state.boardSize,
    state.komi,
    state.captures.B,
    state.captures.W,
    stonesPart
  ].join("|");
};

const runLocalInfluence = async (state: GameState, timeoutMs: number): Promise<ScoreAnalysisResult> => {
  const requestId = ++workerRequestId;
  const startedAt = nowMs();

  const response = await withTimeout(
    requestWorker({
      type: "analyze",
      id: requestId,
      payload: {
        boardSize: state.boardSize,
        stones: Array.from(state.grid),
        toPlay: state.toPlay,
        komi: state.komi,
        capturesB: state.captures.B,
        capturesW: state.captures.W
      }
    }),
    timeoutMs
  );

  if (response.type === "error") {
    throw new LocalInfluenceError(response.code, response.message);
  }
  if (response.type !== "result") {
    throw new LocalInfluenceError("LOCAL_INFLUENCE_PROTOCOL", "Unexpected worker response.");
  }

  return {
    scoreLead: response.payload.scoreLead,
    winrate: null,
    visits: null,
    ownership: cloneOwnership(response.payload.ownership),
    deadStoneMap: cloneDeadStoneMap(response.payload.deadStoneMap),
    engine: "Sabaki Influence+Deadstones",
    blackScore: response.payload.blackScore,
    whiteScore: response.payload.whiteScore,
    deadStones: response.payload.deadStones,
    source: "sabaki-local",
    elapsedMs: Math.round(nowMs() - startedAt),
    quality: response.payload.quality
  };
};

export const warmupInfluenceRuntime = async (): Promise<void> => {
  const requestId = ++workerRequestId;
  const response = await requestWorker({ type: "warmup", id: requestId });
  if (response.type === "error") {
    throw new LocalInfluenceError(response.code, response.message);
  }
};

export const analyzeInfluence = async ({
  state,
  localTimeoutMs = DEFAULT_LOCAL_TIMEOUT_MS
}: InfluenceRequestInput): Promise<ScoreAnalysisResult> => {
  const key = makeCacheKey(state);
  const cached = getCache(key);
  if (cached) return cached;

  const local = await runLocalInfluence(state, localTimeoutMs);
  setCache(key, local);
  return cloneScoreResult(local);
};

export const __internalForTests = {
  makeCacheKey
};
