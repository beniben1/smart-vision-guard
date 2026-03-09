/**
 * @file src/hooks/useAuth.js
 * @description Custom Hook — ניהול מצב Authentication
 *
 * @returns {{
 *   user:    FirebaseUser | null,
 *   loading: boolean,
 *   logout:  Function
 * }}
 *
 * שימוש:
 *   const { user, loading, logout } = useAuth();
 *   if (loading) return <Spinner />;
 *   if (!user)   return <LoginScreen />;
 */

import { useState, useEffect } from "react";
import { subscribeToAuthState, logout as firebaseLogout } from "../services/firebase/auth";

export function useAuth() {
  const [user,    setUser]    = useState(undefined);  // undefined = טרם נבדק
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Firebase קורא ל-callback מיד עם הסטטוס הנוכחי
    const unsubscribe = subscribeToAuthState((firebaseUser) => {
      setUser(firebaseUser ?? null);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const logout = async () => {
    await firebaseLogout();
    setUser(null);
  };

  return { user, loading, logout };
}
