import { describe, expect, it } from "vitest";
import { importSgf, SgfImportError } from "../src/game/sgf";

describe("importSgf", () => {
  it("imports a minimal mainline with pass", () => {
    const imported = importSgf("(;GM[1]FF[4]SZ[19]KM[6.5];B[pd];W[dd];B[])");

    expect(imported.setup).toEqual({ boardSize: 19, komi: 6.5, handicap: 0 });
    expect(imported.state.moves).toEqual([
      { x: 15, y: 3 },
      { x: 3, y: 3 },
      { pass: true }
    ]);
    expect(imported.state.toPlay).toBe("W");
    expect(imported.state.lastMove).toEqual({ pass: true });

    expect(imported.metadata).toEqual({
      gameDate: "",
      blackName: "",
      whiteName: "",
      blackRank: "",
      whiteRank: "",
      location: ""
    });
  });

  it("imports root setup stones and metadata", () => {
    const imported = importSgf(
      "(;GM[1]FF[4]SZ[19]KM[0]HA[2]AB[pd][dp]PB[黒太郎]PW[白花子]BR[3d]WR[2d]DT[2026/03/12]PC[Tokyo];W[qq])"
    );

    expect(imported.setup).toEqual({ boardSize: 19, komi: 0, handicap: 2 });
    expect(imported.state.moves).toEqual([{ x: 16, y: 16 }]);
    expect(imported.state.toPlay).toBe("B");
    expect(imported.state.grid[3 * 19 + 15]).toBe(1);
    expect(imported.state.grid[15 * 19 + 3]).toBe(1);
    expect(imported.state.grid[16 * 19 + 16]).toBe(2);

    expect(imported.metadata).toEqual({
      gameDate: "2026-03-12",
      blackName: "黒太郎",
      whiteName: "白花子",
      blackRank: "3d",
      whiteRank: "2d",
      location: "Tokyo"
    });
  });

  it("uses first variation as mainline", () => {
    const imported = importSgf("(;SZ[19];B[aa](;W[bb])(;W[cc]))");

    expect(imported.state.moves).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 }
    ]);
  });

  it("throws on invalid coordinates", () => {
    expect(() => importSgf("(;SZ[19];B[zz])")).toThrow(SgfImportError);
  });

  it("throws on invalid color order", () => {
    expect(() => importSgf("(;SZ[19]PL[B];B[aa];B[bb])")).toThrow(SgfImportError);
  });
});
