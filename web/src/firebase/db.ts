import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  type DocumentData,
  type FirestoreDataConverter,
  type QueryDocumentSnapshot,
  type SnapshotOptions
} from "firebase/firestore";
import { replayMoves } from "../game/rules";
import type { ActiveGameDoc } from "../types/firestore";
import type { GameState, Move } from "../types/models";
import { getFirebaseDb } from "./firebase";

const activeGameConverter: FirestoreDataConverter<ActiveGameDoc> = {
  toFirestore(modelObject: ActiveGameDoc): DocumentData {
    return modelObject;
  },
  fromFirestore(snapshot: QueryDocumentSnapshot, options: SnapshotOptions): ActiveGameDoc {
    const data = snapshot.data(options);
    return {
      boardSize: data.boardSize,
      komi: data.komi,
      handicap: data.handicap,
      toPlay: data.toPlay,
      captures: data.captures,
      grid: data.grid,
      moves: data.moves,
      updatedAt: data.updatedAt
    } as ActiveGameDoc;
  }
};

const activeGameRef = (uid: string) =>
  doc(getFirebaseDb(), "users", uid, "activeGame", "state").withConverter(activeGameConverter);

const isMove = (value: unknown): value is Move => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.pass === true) return true;
  return typeof candidate.x === "number" && typeof candidate.y === "number";
};

const isPlayer = (value: unknown): value is "B" | "W" => value === "B" || value === "W";

const isValidGrid = (grid: unknown, boardSize: number): grid is number[] => {
  if (!Array.isArray(grid)) return false;
  if (grid.length !== boardSize * boardSize) return false;
  return grid.every((value) => value === 0 || value === 1 || value === 2);
};

const isValidCaptures = (value: unknown): value is { B: number; W: number } => {
  if (!value || typeof value !== "object") return false;
  const captures = value as Record<string, unknown>;
  return typeof captures.B === "number" && typeof captures.W === "number";
};

export const saveActiveGame = async (uid: string, state: GameState): Promise<void> => {
  const payload: ActiveGameDoc = {
    boardSize: state.boardSize,
    komi: state.komi,
    handicap: state.handicap,
    toPlay: state.toPlay,
    captures: { ...state.captures },
    grid: Array.from(state.grid),
    moves: state.moves.map((move) => ({ ...move })),
    updatedAt: serverTimestamp()
  };

  await setDoc(activeGameRef(uid), payload, { merge: true });
};

export const loadActiveGame = async (uid: string): Promise<GameState | null> => {
  const snapshot = await getDoc(activeGameRef(uid));
  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data();
  if (!data || typeof data.boardSize !== "number" || !Array.isArray(data.moves)) {
    return null;
  }

  const moves = data.moves.filter(isMove);
  if (moves.length !== data.moves.length) {
    return null;
  }

  if (
    isValidGrid(data.grid, data.boardSize) &&
    isPlayer(data.toPlay) &&
    isValidCaptures(data.captures) &&
    typeof data.komi === "number" &&
    typeof data.handicap === "number"
  ) {
    return {
      boardSize: data.boardSize,
      komi: data.komi,
      handicap: data.handicap,
      toPlay: data.toPlay,
      grid: Int8Array.from(data.grid),
      captures: { ...data.captures },
      moves: moves.map((move) => ({ ...move })),
      history: [],
      future: [],
      lastMove: moves.length > 0 ? { ...moves[moves.length - 1] } : null
    };
  }

  try {
    return replayMoves(data.boardSize, moves);
  } catch {
    return null;
  }
};
