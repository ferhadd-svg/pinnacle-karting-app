/**
 * Sample a track outline (SVG path in the 0..100 box, absolute M/L/H/V/C/Q/Z commands, as stored in
 * tracks.map_path) into evenly spaced points, so karts can be placed by "fraction of the lap done".
 * The path starts at the start/finish line and runs in driving direction.
 */
export interface SampledTrack {
  points: { x: number; y: number }[];
  /** Cumulative distance at each point; last entry is the full lap length (in box units). */
  dist: number[];
}

export function sampleTrack(d: string, stepsPerSegment = 16): SampledTrack | null {
  const tokens = d.match(/[MLHVCQZ]|-?\d*\.?\d+(?:e-?\d+)?/gi);
  if (!tokens) return null;
  const pts: { x: number; y: number }[] = [];
  let i = 0;
  let cmd = '';
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[a-z]/i.test(tokens[i])) cmd = tokens[i++];
    switch (cmd) {
      case 'M':
        x = sx = num();
        y = sy = num();
        pts.push({ x, y });
        cmd = 'L';
        break;
      case 'L':
        x = num();
        y = num();
        pts.push({ x, y });
        break;
      case 'H':
        x = num();
        pts.push({ x, y });
        break;
      case 'V':
        y = num();
        pts.push({ x, y });
        break;
      case 'C': {
        const [x1, y1, x2, y2, ex, ey] = [num(), num(), num(), num(), num(), num()];
        for (let s = 1; s <= stepsPerSegment; s++) {
          const t = s / stepsPerSegment;
          const u = 1 - t;
          pts.push({
            x: u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * ex,
            y: u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * ey,
          });
        }
        x = ex;
        y = ey;
        break;
      }
      case 'Q': {
        const [x1, y1, ex, ey] = [num(), num(), num(), num()];
        for (let s = 1; s <= stepsPerSegment; s++) {
          const t = s / stepsPerSegment;
          const u = 1 - t;
          pts.push({ x: u * u * x + 2 * u * t * x1 + t * t * ex, y: u * u * y + 2 * u * t * y1 + t * t * ey });
        }
        x = ex;
        y = ey;
        break;
      }
      case 'Z':
      case 'z':
        x = sx;
        y = sy;
        pts.push({ x, y });
        cmd = '';
        break;
      default:
        return null; // relative or arc commands: not used by our track maps
    }
  }
  if (pts.length < 2) return null;
  const dist = [0];
  for (let k = 1; k < pts.length; k++) dist.push(dist[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
  return { points: pts, dist };
}

/** Point at a fraction (0..1) of the lap. */
export function pointAt(track: SampledTrack, fraction: number) {
  const total = track.dist[track.dist.length - 1];
  const target = (((fraction % 1) + 1) % 1) * total;
  let lo = 0;
  let hi = track.dist.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (track.dist[mid] < target) lo = mid;
    else hi = mid;
  }
  const span = track.dist[hi] - track.dist[lo] || 1;
  const t = (target - track.dist[lo]) / span;
  return { x: track.points[lo].x + (track.points[hi].x - track.points[lo].x) * t, y: track.points[lo].y + (track.points[hi].y - track.points[lo].y) * t };
}
