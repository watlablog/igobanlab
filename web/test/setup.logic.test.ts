import { describe, expect, it } from "vitest";
import {
  applyHandicapChange,
  applyKomiChange,
  setupFromDraft,
  type SetupDraft
} from "../src/app/setupLogic";

describe("setupLogic", () => {
  it("sets komi to 0 when switching from even to handicap", () => {
    const initial: SetupDraft = { boardSize: 19, komi: 6.5, handicapSelection: "even" };
    const { draft, evenKomiMemory } = applyHandicapChange(initial, "h3", 6.5);

    expect(draft.handicapSelection).toBe("h3");
    expect(draft.komi).toBe(0);
    expect(evenKomiMemory).toBe(6.5);

    const setup = setupFromDraft(draft, evenKomiMemory);
    expect(setup.handicap).toBe(3);
    expect(setup.komi).toBe(0);
  });

  it("resets komi to 0 when switching between non-even handicap selections", () => {
    const initial: SetupDraft = { boardSize: 19, komi: 3.5, handicapSelection: "h3" };
    const changedKomi = applyKomiChange(initial, 4.5, 6.5).draft;

    expect(changedKomi.komi).toBe(4.5);

    const { draft } = applyHandicapChange(changedKomi, "h5", 6.5);
    expect(draft.handicapSelection).toBe("h5");
    expect(draft.komi).toBe(0);
  });

  it("restores remembered even komi when switching back to even", () => {
    const nonEven: SetupDraft = { boardSize: 19, komi: 0, handicapSelection: "h5" };
    const { draft } = applyHandicapChange(nonEven, "even", 7.5);

    expect(draft.handicapSelection).toBe("even");
    expect(draft.komi).toBe(7.5);
  });

  it("uses handicap 0 and default komi 0 for teisen unless user set komi", () => {
    const teisenDraft: SetupDraft = { boardSize: 19, komi: 0, handicapSelection: "teisen" };
    const teisenSetup = setupFromDraft(teisenDraft, 6.5);

    expect(teisenSetup.handicap).toBe(0);
    expect(teisenSetup.komi).toBe(0);

    const customKomiDraft = applyKomiChange(teisenDraft, 1.5, 6.5).draft;
    const customSetup = setupFromDraft(customKomiDraft, 6.5);
    expect(customSetup.handicap).toBe(0);
    expect(customSetup.komi).toBe(1.5);
  });
});
