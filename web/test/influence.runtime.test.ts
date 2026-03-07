import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameState, ScoreAnalysisResult } from "../src/types/models";

type WorkerMode = "success" | "error";

const createState = (): GameState => ({
  boardSize: 5,
  komi: 6.5,
  handicap: 0,
  toPlay: "B",
  grid: new Int8Array(25),
  captures: { B: 0, W: 0 },
  moves: [],
  history: [],
  future: [],
  lastMove: null
});

const createDeadGrid = (): boolean[][] =>
  Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => false));

const installWorkerMock = (mode: WorkerMode): void => {
  class MockWorker {
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;

    postMessage(message: { type: string; id: number }): void {
      queueMicrotask(() => {
        if (!this.onmessage) return;
        if (message.type === "warmup") {
          this.onmessage({
            data: { type: "ready", id: message.id }
          });
          return;
        }

        if (mode === "error") {
          this.onmessage({
            data: {
              type: "error",
              id: message.id,
              code: "LOCAL_FAIL",
              message: "local failed"
            }
          });
          return;
        }

        this.onmessage({
          data: {
            type: "result",
            id: message.id,
            payload: {
              ownership: Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => 0)),
              blackScore: 12,
              whiteScore: 10,
              scoreLead: 2
            }
          }
        });
      });
    }
  }

  globalThis.Worker = MockWorker as unknown as typeof Worker;
};

const originalWorker = globalThis.Worker;

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  if (originalWorker) {
    globalThis.Worker = originalWorker;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (globalThis as { Worker?: typeof Worker }).Worker;
  }
});

describe("influence runtime", () => {
  it("uses local influence first and skips API fallback on success", async () => {
    installWorkerMock("success");
    const runtime = await import("../src/app/influenceRuntime");
    const apiFallback = vi.fn<() => Promise<ScoreAnalysisResult>>();

    const result = await runtime.analyzeInfluenceWithFallback({
      state: createState(),
      deadGrid: createDeadGrid(),
      requestApiFallback: apiFallback
    });

    expect(result.source).toBe("local");
    expect(result.engine).toBe("Local(OGS-like)");
    expect(apiFallback).not.toHaveBeenCalled();
  });

  it("falls back to API when local estimation fails", async () => {
    installWorkerMock("error");
    const runtime = await import("../src/app/influenceRuntime");
    const apiFallback = vi.fn<() => Promise<ScoreAnalysisResult>>().mockResolvedValue({
      scoreLead: -0.3,
      winrate: 0.47,
      visits: 8,
      ownership: Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => 0)),
      engine: "KataGo"
    });

    const result = await runtime.analyzeInfluenceWithFallback({
      state: createState(),
      deadGrid: createDeadGrid(),
      requestApiFallback: apiFallback
    });

    expect(apiFallback).toHaveBeenCalledTimes(1);
    expect(result.source).toBe("api-fallback");
    expect(result.quality).toBe("fallback");
  });

  it("propagates error when both local and API fallback fail", async () => {
    installWorkerMock("error");
    const runtime = await import("../src/app/influenceRuntime");
    const apiFallback = vi.fn<() => Promise<ScoreAnalysisResult>>().mockRejectedValue(
      new Error("API fail")
    );

    await expect(
      runtime.analyzeInfluenceWithFallback({
        state: createState(),
        deadGrid: createDeadGrid(),
        requestApiFallback: apiFallback
      })
    ).rejects.toThrow("API fail");
  });
});
