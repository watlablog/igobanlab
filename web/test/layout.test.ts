import { describe, expect, it } from "vitest";
import {
  computeVertexSize,
  initialSidebarOpen,
  resolveLayoutPreset
} from "../src/app/layout";

describe("layout", () => {
  it("resolves desktop/tablet presets for target viewports", () => {
    expect(resolveLayoutPreset(1366, 768)).toBe("desktop");
    expect(resolveLayoutPreset(1024, 768)).toBe("tablet");
    expect(resolveLayoutPreset(768, 1024)).toBe("tablet");
  });

  it("returns expected initial sidebar open state", () => {
    expect(initialSidebarOpen("desktop")).toEqual({
      info: true,
      controls: true,
      status: false
    });

    expect(initialSidebarOpen("tablet")).toEqual({
      info: false,
      controls: true,
      status: false
    });
  });

  it("computes vertex size with clamp bounds and responsive scaling", () => {
    const large = computeVertexSize({
      containerWidth: 1200,
      containerHeight: 900,
      boardSize: 19,
      showCoordinates: true
    });
    const small = computeVertexSize({
      containerWidth: 640,
      containerHeight: 420,
      boardSize: 19,
      showCoordinates: false
    });

    expect(large).toBeGreaterThan(small);
    expect(large).toBeLessThanOrEqual(34);
    expect(small).toBeGreaterThanOrEqual(14);
  });
});
