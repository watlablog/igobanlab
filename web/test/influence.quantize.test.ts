import { describe, expect, it } from "vitest";
import {
  markerLabelFromInfluence,
  quantizeInfluence
} from "../src/app/influence";

describe("influence quantization", () => {
  it("maps thresholds into seven classes", () => {
    expect(quantizeInfluence(-0.9)).toBe(-3);
    expect(quantizeInfluence(-0.5)).toBe(-2);
    expect(quantizeInfluence(-0.2)).toBe(-1);
    expect(quantizeInfluence(0)).toBe(0);
    expect(quantizeInfluence(0.2)).toBe(1);
    expect(quantizeInfluence(0.5)).toBe(2);
    expect(quantizeInfluence(0.9)).toBe(3);
  });

  it("builds marker labels by influence strength", () => {
    expect(markerLabelFromInfluence(0.1)).toBeNull();
    expect(markerLabelFromInfluence(0.2)).toBe("influence-black-1");
    expect(markerLabelFromInfluence(0.5)).toBe("influence-black-2");
    expect(markerLabelFromInfluence(0.8)).toBe("influence-black-3");
    expect(markerLabelFromInfluence(-0.2)).toBe("influence-white-1");
    expect(markerLabelFromInfluence(-0.5)).toBe("influence-white-2");
    expect(markerLabelFromInfluence(-0.8)).toBe("influence-white-3");
  });
});
