import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameState } from "../src/types/models";

type WorkerMode = "success" | "fallback" | "error";

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

const installWorkerMock = (mode: WorkerMode): { getPostCount: () => number } => {
  let postCount = 0;

  class MockWorker {
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;

    postMessage(message: { type: string; id: number }): void {
      postCount += 1;
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
              deadStoneMap: Array.from({ length: 5 }, (_, y) =>
                Array.from({ length: 5 }, (_, x) => (y === x ? (x % 2 === 0 ? 1 : -1) : 0))
              ),
              deadStones: { B: 3, W: 2 },
              blackScore: 12,
              whiteScore: 10,
              scoreLead: 2,
              quality: mode === "fallback" ? "fallback" : "quick"
            }
          }
        });
      });
    }
  }

  globalThis.Worker = MockWorker as unknown as typeof Worker;
  return { getPostCount: () => postCount };
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
  it("uses sabaki estimator and returns source metadata", async () => {
    installWorkerMock("success");
    const runtime = await import("../src/app/influenceRuntime");

    const result = await runtime.analyzeInfluence({
      state: createState()
    });

    expect(result.source).toBe("sabaki-local");
    expect(result.engine).toBe("Sabaki Influence+Deadstones");
    expect(result.quality).toBe("quick");
    expect(result.deadStones).toEqual({ B: 3, W: 2 });
    expect(result.deadStoneMap?.[0]?.[0]).toBe(1);
  });

  it("uses cache for identical board states", async () => {
    const worker = installWorkerMock("success");
    const runtime = await import("../src/app/influenceRuntime");
    const state = createState();

    const first = await runtime.analyzeInfluence({ state });
    const second = await runtime.analyzeInfluence({ state });

    expect(first.ownership).toEqual(second.ownership);
    expect(worker.getPostCount()).toBe(1);
  });

  it("propagates error when local estimator fails", async () => {
    installWorkerMock("error");
    const runtime = await import("../src/app/influenceRuntime");

    await expect(runtime.analyzeInfluence({ state: createState() })).rejects.toThrow("local failed");
  });

  it("propagates fallback quality from worker", async () => {
    installWorkerMock("fallback");
    const runtime = await import("../src/app/influenceRuntime");

    const result = await runtime.analyzeInfluence({ state: createState() });
    expect(result.quality).toBe("fallback");
  });
});
