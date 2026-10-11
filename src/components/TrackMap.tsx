import { useEffect, useRef, useState } from 'react';
import type { Standing } from '../sim';

// A closed loop loosely shaped like an indoor kart circuit.
const PATH =
  'M60 200 C60 120 90 60 170 60 L330 60 C390 60 400 110 360 140 C320 170 250 140 230 180 C215 210 260 230 320 220 C400 205 440 240 430 290 C420 340 360 350 300 340 L140 340 C80 340 60 290 60 200 Z';

export function TrackMap({ standings }: { standings: Standing[] }) {
  const pathRef = useRef<SVGPathElement>(null);
  const [len, setLen] = useState(0);

  useEffect(() => {
    if (pathRef.current) setLen(pathRef.current.getTotalLength());
  }, []);

  return (
    <svg viewBox="0 0 500 400" className="track-map" role="img" aria-label="Track map with kart positions">
      <path d={PATH} className="track-asphalt" />
      <path d={PATH} className="track-kerb" />
      <path ref={pathRef} d={PATH} className="track-line" />
      <line x1="48" y1="200" x2="72" y2="200" className="track-start" />
      {len > 0 &&
        [...standings].reverse().map((s) => {
          const p = pathRef.current!.getPointAtLength((s.finished ? 0 : s.progress) * len);
          return (
            <g key={s.driver.id} transform={`translate(${p.x} ${p.y})`}>
              <circle r={s.driver.isYou ? 11 : 9} className={s.driver.isYou ? 'kart kart-you' : 'kart'} />
              <text className="kart-num" textAnchor="middle" dy="3.5">
                {s.position}
              </text>
            </g>
          );
        })}
    </svg>
  );
}
