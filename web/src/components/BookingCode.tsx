import { hashString, seeded } from '../data';

/** A decorative check-in code generated from the booking reference. */
export function BookingCode({ code }: { code: string }) {
  const n = 17;
  const rand = seeded(hashString(code));
  const finder = (x: number, y: number) =>
    [
      [0, 0],
      [n - 7, 0],
      [0, n - 7],
    ].some(([fx, fy]) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7);
  const finderOn = (x: number, y: number) => {
    const ox = x >= n - 7 ? x - (n - 7) : x;
    const oy = y >= n - 7 ? y - (n - 7) : y;
    const edge = ox === 0 || oy === 0 || ox === 6 || oy === 6;
    const core = ox >= 2 && ox <= 4 && oy >= 2 && oy <= 4;
    return edge || core;
  };
  const cells: [number, number][] = [];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const on = finder(x, y) ? finderOn(x, y) : rand() > 0.5;
      if (on) cells.push([x, y]);
    }
  return (
    <svg viewBox={`-1 -1 ${n + 2} ${n + 2}`} className="booking-code" aria-label={`Check-in code ${code}`}>
      <rect x="-1" y="-1" width={n + 2} height={n + 2} fill="#fff" />
      {cells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#000" />
      ))}
    </svg>
  );
}
