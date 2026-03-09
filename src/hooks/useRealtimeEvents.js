/**
 * @file useRealtimeEvents.js
 * @description Custom Hook — האזנה בזמן אמת לאירועים מ-Firestore
 *
 * מאזין ל-collection `events` ומחזיר:
 *  - רשימת אירועים מעודכנת
 *  - דגל `hasNewAlert` שמופעל כשיש אירוע חדש (לאפקט ה-flash)
 *  - סטטיסטיקות בסיסיות
 *
 * @returns {{
 *   events: Array,
 *   hasNewAlert: boolean,
 *   clearAlert: Function,
 *   stats: { total: number, todayCount: number, alertCount: number }
 * }}
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { subscribeToEvents } from "../services/firebase/firestore";

export function useRealtimeEvents() {
  const [events,      setEvents]      = useState([]);
  const [hasNewAlert, setHasNewAlert] = useState(false);
  const isFirstLoad                   = useRef(true);   // מונע flash בטעינה הראשונה
  const prevCountRef                  = useRef(0);

  useEffect(() => {
    // מאזין ל-Firestore — מחזיר unsubscribe לניקוי
    const unsubscribe = subscribeToEvents((newEvents) => {
      setEvents(newEvents);

      // אם זו לא הטעינה הראשונה ויש אירוע חדש — הפעל התראה
      if (!isFirstLoad.current && newEvents.length > prevCountRef.current) {
        const latestEvent = newEvents[0];
        // הפעל flash רק אם האירוע הוא התראת 'person'
        if (latestEvent?.label === "person") {
          setHasNewAlert(true);
        }
      }

      isFirstLoad.current  = false;
      prevCountRef.current = newEvents.length;
    });

    return unsubscribe; // ביטול האזנה בעת unmount
  }, []);

  // כיבוי ה-alert (לאחר שה-animation מסתיים)
  const clearAlert = useCallback(() => setHasNewAlert(false), []);

  // סטטיסטיקות מחושבות
  const stats = computeStats(events);

  return { events, hasNewAlert, clearAlert, stats };
}

// ─── חישוב סטטיסטיקות ───────────────────────────────────────────────────────
function computeStats(events) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayCount  = events.filter((e) => e.timestamp >= today).length;
  const alertCount  = events.filter((e) => e.label === "person").length;

  return {
    total:      events.length,
    todayCount,
    alertCount,
  };
}
