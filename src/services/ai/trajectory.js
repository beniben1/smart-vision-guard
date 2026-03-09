/**
 * @file src/services/ai/trajectory.js
 * @description פיצ'ר 2 — Predictive Trajectory Analysis
 *
 * ═══════════════════════════════════════════════════════════════
 *  שלושה חלקים:
 *
 *  א. Object Tracker — מעקב אחר אותו אובייקט לאורך פריימים
 *     ─ Nearest-Neighbor Matching לפי מרחק Euclidean של Centroids
 *     ─ מחזיר trackId עקבי לאותו אדם
 *
 *  ב. Velocity Vector — חישוב וקטור מהירות
 *     ─ v⃗ = centroid(t) − centroid(t−1)
 *     ─ Exponential Moving Average להחלקת רעש
 *
 *  ג. Predictive Breach — Ray Casting Algorithm
 *     ─ בודק אם הנקודה החזויה: centroid + v⃗ * LOOKAHEAD_FRAMES
 *       נמצאת בתוך Polygon אסור שהמשתמש הגדיר
 *     ─ Ray Casting: ספירת חצייות קרן אופקית עם קצוות הפולינום
 * ═══════════════════════════════════════════════════════════════
 *
 * @module trajectory
 */

// ─── קבועים ──────────────────────────────────────────────────────────────────
const MAX_MATCH_DIST  = 120;   // px — מקסימום מרחק לzהתאמת אותו track
const MAX_TRACK_AGE   = 15;    // פריימים — זמן לפני מחיקת track שנעלם
const EMA_ALPHA       = 0.4;   // Exponential Moving Average smoothing
const LOOKAHEAD       = 8;     // פריימים — כמה רחוק לחזות

// ─── טיפוסים (JSDoc) ─────────────────────────────────────────────────────────
/**
 * @typedef {{ x: number, y: number }} Point2D
 * @typedef {{ x: number, y: number, w: number, h: number }} BBox
 * @typedef {{
 *   id:         string,
 *   centroid:   Point2D,
 *   velocity:   Point2D,   — smoothed EMA velocity
 *   history:    Point2D[], — centroids האחרונים
 *   age:        number,    — פריימים מאז עדכון אחרון
 *   framesSeen: number,    — כמה פריימים נצפה
 * }} Track
 */

// ══════════════════════════════════════════════════════════════════════════════
//  Object Tracker
// ══════════════════════════════════════════════════════════════════════════════

export class ObjectTracker {
  /** @type {Map<string, Track>} */
  #tracks = new Map();
  #nextId = 1;

  /**
   * update — מעדכן את המעקב עם זיהויי הפריים הנוכחי
   *
   * @param {BBox[]} detections  — רשימת bounding boxes מ-COCO-SSD
   * @returns {Array<{ bbox: BBox, track: Track }>} זיהויים עם trackId
   */
  update(detections) {
    const centroids = detections.map(bb => bboxCentroid(bb));
    const matched   = new Set();
    const result    = [];

    // ── התאמת זיהויים לtrackים קיימים (Nearest Neighbor) ──────────────────
    const tracks = Array.from(this.#tracks.values());

    detections.forEach((bbox, di) => {
      const c      = centroids[di];
      let bestDist = Infinity;
      let bestId   = null;

      tracks.forEach(track => {
        if (matched.has(track.id)) return;
        const dist = euclidean(c, track.centroid);
        if (dist < bestDist && dist < MAX_MATCH_DIST) {
          bestDist = dist;
          bestId   = track.id;
        }
      });

      if (bestId) {
        // עדכן track קיים
        const track = this.#tracks.get(bestId);
        const rawVx = c.x - track.centroid.x;
        const rawVy = c.y - track.centroid.y;

        // EMA smoothing על המהירות
        track.velocity = {
          x: EMA_ALPHA * rawVx + (1 - EMA_ALPHA) * track.velocity.x,
          y: EMA_ALPHA * rawVy + (1 - EMA_ALPHA) * track.velocity.y,
        };
        track.centroid    = c;
        track.age         = 0;
        track.framesSeen += 1;
        track.history.push({ ...c });
        if (track.history.length > 30) track.history.shift(); // שמור 30 פריימים

        matched.add(bestId);
        result.push({ bbox, track });
      } else {
        // צור track חדש
        const id    = `T${this.#nextId++}`;
        const track = {
          id, centroid: c, velocity: { x: 0, y: 0 },
          history: [{ ...c }], age: 0, framesSeen: 1,
        };
        this.#tracks.set(id, track);
        result.push({ bbox, track });
      }
    });

    // ── הגדל גיל לtrackים שלא עודכנו; מחק ישנים ───────────────────────────
    this.#tracks.forEach((track, id) => {
      if (!matched.has(id)) {
        track.age++;
        if (track.age > MAX_TRACK_AGE) this.#tracks.delete(id);
      }
    });

    return result;
  }

  /** מחזיר את כל הtrackים הפעילים */
  getActiveTracks() {
    return Array.from(this.#tracks.values()).filter(t => t.age === 0);
  }

  /** מחיקה מלאה */
  reset() { this.#tracks.clear(); this.#nextId = 1; }
}

// ══════════════════════════════════════════════════════════════════════════════
//  Predictive Breach — Ray Casting Algorithm
// ══════════════════════════════════════════════════════════════════════════════

/**
 * checkPredictiveBreach — בודק אם מסלול חזוי חוצה polygon אסור
 *
 * אלגוריתם: מחשב את הנקודה החזויה (centroid + v⃗ * LOOKAHEAD_FRAMES)
 * ואז בודק אם היא בתוך הpolygon דרך Ray Casting.
 *
 * @param {Track}    track    — track עם centroid + velocity
 * @param {Point2D[]} polygon — רשימת קודקודים של אזור אסור
 * @returns {{
 *   breach:          boolean,
 *   predictedPoint:  Point2D,
 *   framesUntilEntry: number | null  — אומדן פריימים עד חדירה
 * }}
 */
export function checkPredictiveBreach(track, polygon) {
  if (!polygon || polygon.length < 3) {
    return { breach: false, predictedPoint: track.centroid, framesUntilEntry: null };
  }

  // נקודה חזויה: centroid + velocity * LOOKAHEAD
  const predicted = {
    x: track.centroid.x + track.velocity.x * LOOKAHEAD,
    y: track.centroid.y + track.velocity.y * LOOKAHEAD,
  };

  const breach = isPointInPolygon(predicted, polygon);

  // אמדן מספר פריימים עד חדירה (binary search קצר)
  let framesUntilEntry = null;
  if (breach) {
    for (let f = 1; f <= LOOKAHEAD; f++) {
      const p = {
        x: track.centroid.x + track.velocity.x * f,
        y: track.centroid.y + track.velocity.y * f,
      };
      if (isPointInPolygon(p, polygon)) { framesUntilEntry = f; break; }
    }
  }

  return { breach, predictedPoint: predicted, framesUntilEntry };
}

/**
 * isPointInPolygon — Ray Casting Algorithm
 * זורק קרן אופקית מהנקודה ימינה וסופר כמה קצוות הpolygon היא חוצה.
 * מספר אי-זוגי → נקודה בתוך הpolygon.
 *
 * @param {Point2D}   point
 * @param {Point2D[]} polygon
 * @returns {boolean}
 */
export function isPointInPolygon(point, polygon) {
  const { x, y } = point;
  let inside = false;
  const n = polygon.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;

    const intersects =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (intersects) inside = !inside;
  }
  return inside;
}

/**
 * drawTrajectory — מצייר מסלול + נקודה חזויה על Canvas
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Track}   track
 * @param {boolean} isBreach — האם יש חשש חדירה
 */
export function drawTrajectory(ctx, track, isBreach) {
  const hist = track.history;
  if (hist.length < 2) return;

  // מסלול היסטורי
  ctx.beginPath();
  ctx.moveTo(hist[0].x, hist[0].y);
  for (let i = 1; i < hist.length; i++) ctx.lineTo(hist[i].x, hist[i].y);
  ctx.strokeStyle = isBreach ? "#ff880099" : "#00e5ff55";
  ctx.lineWidth   = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.stroke();
  ctx.setLineDash([]);

  // וקטור מהירות → נקודה חזויה
  if (isBreach) {
    const predicted = {
      x: track.centroid.x + track.velocity.x * LOOKAHEAD,
      y: track.centroid.y + track.velocity.y * LOOKAHEAD,
    };
    // קו לנקודה חזויה
    ctx.beginPath();
    ctx.moveTo(track.centroid.x, track.centroid.y);
    ctx.lineTo(predicted.x, predicted.y);
    ctx.strokeStyle = "#ff8800cc";
    ctx.lineWidth   = 2;
    ctx.setLineDash([6, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    // עיגול בנקודה החזויה
    ctx.beginPath();
    ctx.arc(predicted.x, predicted.y, 7, 0, Math.PI * 2);
    ctx.fillStyle   = "#ff880033";
    ctx.strokeStyle = "#ff8800";
    ctx.lineWidth   = 2;
    ctx.fill();
    ctx.stroke();

    // תווית
    ctx.font      = "bold 11px monospace";
    ctx.fillStyle = "#ff8800";
    ctx.fillText("⚠ PREDICTED BREACH", predicted.x + 10, predicted.y - 6);
  }
}

/**
 * drawForbiddenZone — מצייר polygon אסור על Canvas
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Point2D[]} polygon
 * @param {boolean}   isTriggered — האם יש חדירה פעילה
 */
export function drawForbiddenZone(ctx, polygon, isTriggered) {
  if (!polygon || polygon.length < 3) return;

  ctx.beginPath();
  ctx.moveTo(polygon[0].x, polygon[0].y);
  for (let i = 1; i < polygon.length; i++) ctx.lineTo(polygon[i].x, polygon[i].y);
  ctx.closePath();

  ctx.fillStyle   = isTriggered ? "rgba(255,80,0,0.15)" : "rgba(255,180,0,0.06)";
  ctx.strokeStyle = isTriggered ? "#ff5000cc"            : "#ffd70066";
  ctx.lineWidth   = isTriggered ? 2 : 1.5;
  ctx.setLineDash([6, 4]);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);

  // תווית
  ctx.font      = "bold 10px monospace";
  ctx.fillStyle = isTriggered ? "#ff5000" : "#ffd70088";
  ctx.fillText("⛔ RESTRICTED ZONE", polygon[0].x + 4, polygon[0].y - 6);
}

// ─── עזרי מתמטיקה ────────────────────────────────────────────────────────────
function bboxCentroid(bbox) {
  return {
    x: (bbox.x ?? bbox[0]) + (bbox.w ?? bbox[2]) / 2,
    y: (bbox.y ?? bbox[1]) + (bbox.h ?? bbox[3]) / 2,
  };
}

function euclidean(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}
