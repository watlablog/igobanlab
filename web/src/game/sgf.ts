import { applyMove, applyPass } from "./rules";
import { DEFAULT_KOMI } from "./state";
import type { GameSetup, GameState, Move, Player } from "../types/models";

const SGF_COORDS = "abcdefghijklmnopqrstuvwxyz";

const moveColorAt = (index: number): "B" | "W" => (index % 2 === 0 ? "B" : "W");

type SgfNode = Record<string, string[]>;
type SgfTree = {
  nodes: SgfNode[];
  children: SgfTree[];
};

type ColoredMove = {
  color: Player;
  move: Move;
};

const SUPPORTED_BOARD_SIZES = new Set([9, 13, 19]);

export type ImportedSgfMetadata = {
  gameDate: string;
  blackName: string;
  whiteName: string;
  blackRank: string;
  whiteRank: string;
  location: string;
};

export type ImportedSgfGame = {
  setup: GameSetup;
  state: GameState;
  metadata: ImportedSgfMetadata;
};

export class SgfImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SgfImportError";
  }
}

const vertexToSgf = (x: number, y: number): string => {
  const sx = SGF_COORDS[x];
  const sy = SGF_COORDS[y];
  if (!sx || !sy) {
    throw new Error("Board size exceeds SGF coordinate range");
  }
  return `${sx}${sy}`;
};

const isWhitespace = (char: string): boolean =>
  char === " " || char === "\n" || char === "\r" || char === "\t" || char === "\f";

const skipWhitespace = (source: string, start: number): number => {
  let index = start;
  while (index < source.length && isWhitespace(source[index])) {
    index += 1;
  }
  return index;
};

const parseValue = (source: string, start: number): { value: string; next: number } => {
  if (source[start] !== "[") {
    throw new SgfImportError("Invalid SGF property value.");
  }

  let index = start + 1;
  let value = "";

  while (index < source.length) {
    const char = source[index];
    if (char === "\\") {
      const escaped = source[index + 1];
      if (escaped == null) {
        break;
      }
      if (escaped === "\n" || escaped === "\r") {
        index += 2;
        if (escaped === "\r" && source[index] === "\n") {
          index += 1;
        }
        continue;
      }
      value += escaped;
      index += 2;
      continue;
    }
    if (char === "]") {
      return { value, next: index + 1 };
    }
    value += char;
    index += 1;
  }

  throw new SgfImportError("Unterminated SGF property value.");
};

const parseNode = (source: string, start: number): { node: SgfNode; next: number } => {
  if (source[start] !== ";") {
    throw new SgfImportError("Invalid SGF node.");
  }

  let index = start + 1;
  const node: SgfNode = {};

  while (index < source.length) {
    index = skipWhitespace(source, index);
    const char = source[index];
    if (!char || char === ";" || char === "(" || char === ")") {
      break;
    }

    const idStart = index;
    while (index < source.length && /[A-Za-z]/.test(source[index])) {
      index += 1;
    }
    if (idStart === index) {
      throw new SgfImportError("Invalid SGF property identifier.");
    }
    const id = source.slice(idStart, index).toUpperCase();

    index = skipWhitespace(source, index);
    const values: string[] = [];
    while (source[index] === "[") {
      const parsedValue = parseValue(source, index);
      values.push(parsedValue.value);
      index = skipWhitespace(source, parsedValue.next);
    }

    if (values.length === 0) {
      throw new SgfImportError(`SGF property ${id} has no values.`);
    }

    if (!node[id]) {
      node[id] = values;
    } else {
      node[id].push(...values);
    }
  }

  return { node, next: index };
};

const parseTree = (source: string, start: number): { tree: SgfTree; next: number } => {
  let index = skipWhitespace(source, start);
  if (source[index] !== "(") {
    throw new SgfImportError("SGF must start with '(' for a game tree.");
  }
  index += 1;

  const nodes: SgfNode[] = [];
  const children: SgfTree[] = [];

  index = skipWhitespace(source, index);
  while (source[index] === ";") {
    const parsedNode = parseNode(source, index);
    nodes.push(parsedNode.node);
    index = skipWhitespace(source, parsedNode.next);
  }

  if (nodes.length === 0) {
    throw new SgfImportError("SGF game tree does not contain any node.");
  }

  while (source[index] === "(") {
    const childTree = parseTree(source, index);
    children.push(childTree.tree);
    index = skipWhitespace(source, childTree.next);
  }

  if (source[index] !== ")") {
    throw new SgfImportError("Unterminated SGF game tree.");
  }

  return {
    tree: { nodes, children },
    next: index + 1
  };
};

const collectMainlineNodes = (tree: SgfTree): SgfNode[] => {
  const mainline: SgfNode[] = [];
  let cursor: SgfTree | undefined = tree;

  while (cursor) {
    mainline.push(...cursor.nodes);
    cursor = cursor.children[0];
  }

  return mainline;
};

const parseBoardSize = (value: string | undefined): number => {
  if (!value) return 19;

  const raw = value.trim();
  if (raw.includes(":")) {
    const [xRaw, yRaw] = raw.split(":");
    const x = Number(xRaw);
    const y = Number(yRaw);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x !== y) {
      throw new SgfImportError("Rectangular boards are not supported.");
    }
    if (!SUPPORTED_BOARD_SIZES.has(x)) {
      throw new SgfImportError(`Unsupported board size: ${x}`);
    }
    return x;
  }

  const size = Number(raw);
  if (!Number.isFinite(size) || !SUPPORTED_BOARD_SIZES.has(size)) {
    throw new SgfImportError(`Unsupported board size: ${raw}`);
  }
  return size;
};

const clampHandicap = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(9, Math.trunc(value)));
};

const parseKomi = (value: string | undefined, handicap: number): number => {
  if (value == null || value.trim().length === 0) {
    return handicap > 0 ? 0 : DEFAULT_KOMI;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new SgfImportError(`Invalid komi value: ${value}`);
  }
  return Math.round(parsed * 2) / 2;
};

const parsePoint = (value: string, boardSize: number): [number, number] | null => {
  if (value.length === 0 || value.toLowerCase() === "tt") {
    return null;
  }
  if (value.includes(":")) {
    throw new SgfImportError("Compressed point lists are not supported.");
  }
  if (value.length !== 2) {
    throw new SgfImportError(`Invalid SGF coordinate: ${value}`);
  }

  const x = SGF_COORDS.indexOf(value[0].toLowerCase());
  const y = SGF_COORDS.indexOf(value[1].toLowerCase());

  if (x < 0 || y < 0 || x >= boardSize || y >= boardSize) {
    throw new SgfImportError(`Coordinate out of board range: ${value}`);
  }

  return [x, y];
};

const parseSetupStones = (values: string[] | undefined, boardSize: number): Array<[number, number]> => {
  if (!values || values.length === 0) {
    return [];
  }

  return values
    .map((value) => parsePoint(value, boardSize))
    .filter((point): point is [number, number] => point !== null);
};

const parseMoveValue = (value: string, boardSize: number): Move => {
  const point = parsePoint(value, boardSize);
  if (!point) {
    return { pass: true };
  }
  return { x: point[0], y: point[1] };
};

const getRootValue = (node: SgfNode, key: string): string | undefined => node[key]?.[0];

const getRootText = (node: SgfNode, key: string): string => {
  const value = getRootValue(node, key);
  return value ? value.trim() : "";
};

const normalizeDateForInput = (value: string): string => {
  if (!value) return "";
  const firstSegment = value.split(",")[0]?.trim();
  if (!firstSegment) return "";
  const normalized = firstSegment.replaceAll("/", "-");
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
};

const parsePl = (value: string | undefined): Player | null => {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  if (normalized === "B" || normalized === "W") {
    return normalized;
  }
  return null;
};

const parseMoves = (nodes: SgfNode[], boardSize: number): ColoredMove[] => {
  const parsedMoves: ColoredMove[] = [];

  for (const node of nodes) {
    const black = node.B;
    const white = node.W;
    if (black && white) {
      throw new SgfImportError("A single SGF node cannot contain both B and W moves.");
    }
    if (black) {
      parsedMoves.push({ color: "B", move: parseMoveValue(black[0] ?? "", boardSize) });
    }
    if (white) {
      parsedMoves.push({ color: "W", move: parseMoveValue(white[0] ?? "", boardSize) });
    }
  }

  return parsedMoves;
};

const toIndex = (x: number, y: number, boardSize: number): number => y * boardSize + x;

const buildInitialGrid = (
  boardSize: number,
  setupBlack: Array<[number, number]>,
  setupWhite: Array<[number, number]>
): Int8Array => {
  const grid = new Int8Array(boardSize * boardSize);

  for (const [x, y] of setupBlack) {
    const index = toIndex(x, y, boardSize);
    if (grid[index] !== 0) {
      throw new SgfImportError("Duplicate setup stones detected.");
    }
    grid[index] = 1;
  }

  for (const [x, y] of setupWhite) {
    const index = toIndex(x, y, boardSize);
    if (grid[index] !== 0) {
      throw new SgfImportError("Conflicting setup stones detected on same point.");
    }
    grid[index] = 2;
  }

  return grid;
};

const replayColoredMoves = (state: GameState, moves: ColoredMove[]): GameState => {
  let nextState = state;

  for (let index = 0; index < moves.length; index += 1) {
    const current = moves[index];
    if (nextState.toPlay !== current.color) {
      throw new SgfImportError(
        `Move color order mismatch at move ${index + 1}. Expected ${nextState.toPlay}, got ${current.color}.`
      );
    }

    if ("pass" in current.move) {
      nextState = applyPass(nextState);
      continue;
    }

    const result = applyMove(nextState, current.move);
    if (result instanceof Error) {
      throw new SgfImportError(`Invalid SGF move at ${index + 1}: ${result.message}`);
    }
    nextState = result;
  }

  return nextState;
};

export const exportMinimalSgf = (boardSize: number, moves: Move[]): string => {
  const nodes = moves
    .map((move, index) => {
      const color = moveColorAt(index);
      if ("pass" in move) {
        return `;${color}[]`;
      }
      return `;${color}[${vertexToSgf(move.x, move.y)}]`;
    })
    .join("");

  return `(;GM[1]FF[4]SZ[${boardSize}]${nodes})`;
};

export const importSgf = (source: string): ImportedSgfGame => {
  const normalizedSource = source.replace(/^\uFEFF/, "").trim();
  if (!normalizedSource) {
    throw new SgfImportError("SGF file is empty.");
  }

  const parsedTree = parseTree(normalizedSource, 0).tree;
  const nodes = collectMainlineNodes(parsedTree);
  const root = nodes[0];
  if (!root) {
    throw new SgfImportError("SGF root node is missing.");
  }

  const boardSize = parseBoardSize(getRootValue(root, "SZ"));
  const setupBlack = parseSetupStones(root.AB, boardSize);
  const setupWhite = parseSetupStones(root.AW, boardSize);

  const parsedHa = getRootValue(root, "HA");
  const handicap = parsedHa
    ? clampHandicap(Number(parsedHa))
    : setupBlack.length > 0 && setupWhite.length === 0
      ? clampHandicap(setupBlack.length)
      : 0;
  const komi = parseKomi(getRootValue(root, "KM"), handicap);

  const moveNodes = parseMoves(nodes, boardSize);
  const pl = parsePl(getRootValue(root, "PL"));
  const initialToPlay: Player = pl ?? moveNodes[0]?.color ?? (handicap > 0 ? "W" : "B");

  const initialState: GameState = {
    boardSize,
    komi,
    handicap,
    toPlay: initialToPlay,
    grid: buildInitialGrid(boardSize, setupBlack, setupWhite),
    captures: { B: 0, W: 0 },
    moves: [],
    history: [],
    future: [],
    lastMove: null
  };

  const setup: GameSetup = {
    boardSize,
    komi,
    handicap
  };

  const state = replayColoredMoves(initialState, moveNodes);

  return {
    setup,
    state,
    metadata: {
      gameDate: normalizeDateForInput(getRootText(root, "DT")),
      blackName: getRootText(root, "PB"),
      whiteName: getRootText(root, "PW"),
      blackRank: getRootText(root, "BR"),
      whiteRank: getRootText(root, "WR"),
      location: getRootText(root, "PC")
    }
  };
};
