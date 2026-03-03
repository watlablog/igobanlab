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
      toPlay: data.toPlay,
      captures: data.captures,
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

export const saveActiveGame = async (uid: string, state: GameState): Promise<void> => {
  const payload: ActiveGameDoc = {
    boardSize: state.boardSize,
    toPlay: state.toPlay,
    captures: { ...state.captures },
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

  try {
    return replayMoves(data.boardSize, moves);
  } catch {
    return null;
  }
};
