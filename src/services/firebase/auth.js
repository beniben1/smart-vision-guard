/**
 * @file src/services/firebase/auth.js
 * @description שירות Authentication — כניסה/יציאה עם Firebase Auth
 *
 * תומך ב:
 *  - כניסה עם אימייל + סיסמה
 *  - האזנה לשינויי סטטוס התחברות (onAuthStateChanged)
 *  - הגבלה: רק אימייל מורשה יוכל להיכנס (ALLOWED_EMAIL)
 */

import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import app from "./config";

export const auth = getAuth(app);

/** האימייל היחיד שמורשה להיכנס למערכת */
const ALLOWED_EMAIL = import.meta.env.VITE_ALLOWED_EMAIL ?? "";

// ─── כניסה ────────────────────────────────────────────────────────────────────
/**
 * login — מנסה להתחבר ומוודא שהאימייל מורשה
 * @param {string} email
 * @param {string} password
 * @returns {Promise<import("firebase/auth").User>}
 */
export async function login(email, password) {
  // בדיקת הרשאה לפני קריאת Firebase
  if (ALLOWED_EMAIL && email.toLowerCase() !== ALLOWED_EMAIL.toLowerCase()) {
    throw new Error("גישה נדחתה — משתמש לא מורשה");
  }

  try {
    const { user } = await signInWithEmailAndPassword(auth, email, password);
    console.log(`[Auth] ✅ Logged in: ${user.email}`);
    return user;
  } catch (err) {
    // תרגום שגיאות Firebase לעברית
    const msg = {
      "auth/invalid-credential":    "אימייל או סיסמה שגויים",
      "auth/user-not-found":        "משתמש לא קיים",
      "auth/wrong-password":        "סיסמה שגויה",
      "auth/too-many-requests":     "יותר מדי ניסיונות — נסה שוב מאוחר יותר",
      "auth/network-request-failed":"בעיית חיבור — בדוק אינטרנט",
    }[err.code] ?? err.message;

    throw new Error(msg);
  }
}

// ─── יציאה ────────────────────────────────────────────────────────────────────
export async function logout() {
  await signOut(auth);
  console.log("[Auth] 👋 Logged out");
}

// ─── האזנה לסטטוס ─────────────────────────────────────────────────────────────
/**
 * subscribeToAuthState — מחזיר unsubscribe
 * @param {Function} callback  — fn(user | null)
 */
export function subscribeToAuthState(callback) {
  return onAuthStateChanged(auth, callback);
}
