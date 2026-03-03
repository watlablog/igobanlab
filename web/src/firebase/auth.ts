import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User
} from "firebase/auth";
import { getFirebaseAuth } from "./firebase";

const provider = new GoogleAuthProvider();

export const subscribeAuth = (onUser: (user: User | null) => void): (() => void) =>
  onAuthStateChanged(getFirebaseAuth(), onUser);

export const signInWithGoogle = async (): Promise<void> => {
  await signInWithPopup(getFirebaseAuth(), provider);
};

export const signOutUser = async (): Promise<void> => {
  await signOut(getFirebaseAuth());
};
