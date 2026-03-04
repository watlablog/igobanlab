import {
  InvalidMoveError,
  type Captures,
  type GameSnapshot,
  type GameState,
  type Move,
  type PlaceMove,
  type Player,
  type PlayerStone
} from "../types/models";

const stoneForPlayer = (player: Player): PlayerStone => (player === "B" ? 1 : 2);
const opponentOf = (player: Player): Player => (player === "B" ? "W" : "B");

const cloneMoves = (moves: Move[]): Move[] => moves.map((move) => ({ ...move }));

const snapshotOf = (state: GameState): GameSnapshot => ({
  boardSize: state.boardSize,
  komi: state.komi,
  handicap: state.handicap,
  toPlay: state.toPlay,
  grid: state.grid.slice(),
  captures: { ...state.captures },
  moves: cloneMoves(state.moves),
  lastMove: state.lastMove ? { ...state.lastMove } : null
});

const indexOf = (x: number, y: number, boardSize: number): number => y * boardSize + x;

const inBounds = (x: number, y: number, boardSize: number): boolean =>
  x >= 0 && y >= 0 && x < boardSize && y < boardSize;

export const neighbors = (index: number, boardSize: number): number[] => {
  const x = index % boardSize;
  const y = Math.floor(index / boardSize);
  const result: number[] = [];

  if (x > 0) result.push(index - 1);
  if (x < boardSize - 1) result.push(index + 1);
  if (y > 0) result.push(index - boardSize);
  if (y < boardSize - 1) result.push(index + boardSize);

  return result;
};

export const groupAt = (start: number, grid: Int8Array, boardSize: number): Set<number> => {
  const targetStone = grid[start];
  if (targetStone === 0) {
    return new Set();
  }

  const group = new Set<number>();
  const stack = [start];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (group.has(current)) continue;
    if (grid[current] !== targetStone) continue;

    group.add(current);

    for (const n of neighbors(current, boardSize)) {
      if (!group.has(n) && grid[n] === targetStone) {
        stack.push(n);
      }
    }
  }

  return group;
};

export const libertiesOf = (
  group: Set<number>,
  grid: Int8Array,
  boardSize: number
): number => {
  const liberties = new Set<number>();

  for (const vertex of group) {
    for (const n of neighbors(vertex, boardSize)) {
      if (grid[n] === 0) {
        liberties.add(n);
      }
    }
  }

  return liberties.size;
};

const applyStateTransition = (
  state: GameState,
  nextGrid: Int8Array,
  nextCaptures: Captures,
  nextMove: Move
): GameState => ({
  boardSize: state.boardSize,
  komi: state.komi,
  handicap: state.handicap,
  toPlay: opponentOf(state.toPlay),
  grid: nextGrid,
  captures: nextCaptures,
  moves: [...state.moves, { ...nextMove }],
  history: [...state.history, snapshotOf(state)],
  future: [],
  lastMove: { ...nextMove }
});

const removeGroup = (grid: Int8Array, group: Set<number>): number => {
  for (const vertex of group) {
    grid[vertex] = 0;
  }
  return group.size;
};

const validatePlaceMove = (state: GameState, move: PlaceMove): number | InvalidMoveError => {
  const { x, y } = move;
  if (!inBounds(x, y, state.boardSize)) {
    return new InvalidMoveError("OUT_OF_BOUNDS", "Move is outside the board");
  }

  const index = indexOf(x, y, state.boardSize);
  if (state.grid[index] !== 0) {
    return new InvalidMoveError("POINT_OCCUPIED", "Point is already occupied");
  }

  return index;
};

export const applyMove = (state: GameState, move: PlaceMove): GameState | InvalidMoveError => {
  const validation = validatePlaceMove(state, move);
  if (validation instanceof InvalidMoveError) {
    return validation;
  }

  const placedIndex = validation;
  const currentStone = stoneForPlayer(state.toPlay);
  const opponentStone = stoneForPlayer(opponentOf(state.toPlay));

  const nextGrid = state.grid.slice();
  nextGrid[placedIndex] = currentStone;

  let capturedCount = 0;
  const checkedOpponentVertices = new Set<number>();

  for (const n of neighbors(placedIndex, state.boardSize)) {
    if (nextGrid[n] !== opponentStone || checkedOpponentVertices.has(n)) {
      continue;
    }

    const opponentGroup = groupAt(n, nextGrid, state.boardSize);
    for (const vertex of opponentGroup) checkedOpponentVertices.add(vertex);

    if (libertiesOf(opponentGroup, nextGrid, state.boardSize) === 0) {
      capturedCount += removeGroup(nextGrid, opponentGroup);
    }
  }

  const ownGroup = groupAt(placedIndex, nextGrid, state.boardSize);
  if (libertiesOf(ownGroup, nextGrid, state.boardSize) === 0) {
    return new InvalidMoveError("SUICIDE", "Suicide is not allowed");
  }

  const nextCaptures: Captures = {
    ...state.captures,
    [state.toPlay]: state.captures[state.toPlay] + capturedCount
  };

  return applyStateTransition(state, nextGrid, nextCaptures, move);
};

export const applyPass = (state: GameState): GameState => {
  const passMove: Move = { pass: true };
  return applyStateTransition(state, state.grid.slice(), { ...state.captures }, passMove);
};

export const undo = (state: GameState): GameState => {
  if (state.history.length === 0) {
    return state;
  }

  const nextHistory = state.history.slice();
  const previous = nextHistory.pop()!;
  const currentSnapshot = snapshotOf(state);

  return {
    boardSize: state.boardSize,
    komi: previous.komi,
    handicap: previous.handicap,
    toPlay: previous.toPlay,
    grid: previous.grid.slice(),
    captures: { ...previous.captures },
    moves: cloneMoves(previous.moves),
    history: nextHistory,
    future: [...state.future, currentSnapshot],
    lastMove: previous.lastMove ? { ...previous.lastMove } : null
  };
};

export const redo = (state: GameState): GameState => {
  if (state.future.length === 0) {
    return state;
  }

  const nextFuture = state.future.slice();
  const restored = nextFuture.pop()!;
  const currentSnapshot = snapshotOf(state);

  return {
    boardSize: state.boardSize,
    komi: restored.komi,
    handicap: restored.handicap,
    toPlay: restored.toPlay,
    grid: restored.grid.slice(),
    captures: { ...restored.captures },
    moves: cloneMoves(restored.moves),
    history: [...state.history, currentSnapshot],
    future: nextFuture,
    lastMove: restored.lastMove ? { ...restored.lastMove } : null
  };
};

export const replayMoves = (boardSize: number, moves: Move[]): GameState => {
  let state: GameState = {
    boardSize,
    komi: 6.5,
    handicap: 0,
    toPlay: "B",
    grid: new Int8Array(boardSize * boardSize),
    captures: { B: 0, W: 0 },
    moves: [],
    history: [],
    future: [],
    lastMove: null
  };

  for (const move of moves) {
    if ("pass" in move) {
      state = applyPass(state);
      continue;
    }

    const next = applyMove(state, move);
    if (next instanceof InvalidMoveError) {
      throw next;
    }
    state = next;
  }

  return state;
};
