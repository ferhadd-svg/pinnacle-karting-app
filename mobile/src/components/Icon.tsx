import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type IconName = 'home' | 'flag' | 'trophy' | 'user' | 'card' | 'chevron' | 'ticket' | 'gift' | 'qr' | 'sign' | 'live' | 'star' | 'cart' | 'doc' | 'lock' | 'users' | 'speed';

/** Small stroke icon set (24×24), drawn with react-native-svg so no icon font is needed. */
export function Icon({ name, color, size = 24 }: { name: IconName; color: string; size?: number }) {
  const p = { stroke: color, strokeWidth: 2, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
      {name === 'home' && <Path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" {...p} />}
      {name === 'flag' && (
        <>
          <Path d="M5 21V4" {...p} />
          <Path d="M5 4h13l-2.5 4.5L18 13H5" {...p} />
        </>
      )}
      {name === 'trophy' && (
        <>
          <Path d="M8 4h8v5a4 4 0 0 1-8 0z" {...p} />
          <Path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8" {...p} />
        </>
      )}
      {name === 'user' && (
        <>
          <Circle cx={12} cy={8} r={4} {...p} />
          <Path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" {...p} />
        </>
      )}
      {name === 'card' && (
        <>
          <Rect x={3} y={5} width={18} height={14} rx={2} {...p} />
          <Path d="M7 10h4M7 14h6M15 10h2v4h-2z" {...p} />
        </>
      )}
      {name === 'chevron' && <Path d="M9 6l6 6-6 6" {...p} />}
      {name === 'ticket' && (
        <>
          <Path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 6v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-6z" {...p} />
          <Path d="M14 5v14" {...p} strokeDasharray="2 3" />
        </>
      )}
      {name === 'gift' && (
        <>
          <Rect x={3} y={9} width={18} height={12} rx={1.5} {...p} />
          <Path d="M3 13h18M12 9v12M12 9c-2-4-6-4-6-1.5S10 9 12 9zm0 0c2-4 6-4 6-1.5S14 9 12 9z" {...p} />
        </>
      )}
      {name === 'qr' && (
        <>
          <Rect x={3} y={3} width={7} height={7} rx={1} {...p} />
          <Rect x={14} y={3} width={7} height={7} rx={1} {...p} />
          <Rect x={3} y={14} width={7} height={7} rx={1} {...p} />
          <Path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3" {...p} />
        </>
      )}
      {name === 'sign' && (
        <>
          <Path d="M4 20h16" {...p} />
          <Path d="M5 16c2-3 3 1 5-1s2-4 4-2" {...p} />
          <Path d="M15 4l5 5-7 7h-5v-5z" {...p} />
        </>
      )}
      {name === 'live' && (
        <>
          <Circle cx={12} cy={12} r={2.5} {...p} />
          <Path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14" {...p} />
        </>
      )}
      {name === 'star' && (
        <>
          <Circle cx={12} cy={12} r={9} {...p} />
          <Path d="M12 7l1.5 3.2 3.5.4-2.6 2.4.7 3.4L12 14.7 8.9 16.4l.7-3.4L7 10.6l3.5-.4z" {...p} />
        </>
      )}
      {name === 'cart' && (
        <>
          <Path d="M3 4h2l2.5 11h10L20 7H7" {...p} />
          <Circle cx={9} cy={19} r={1.5} {...p} />
          <Circle cx={17} cy={19} r={1.5} {...p} />
        </>
      )}
      {name === 'doc' && (
        <>
          <Path d="M6 3h9l4 4v14H6z" {...p} />
          <Path d="M9 10h7M9 14h7M9 18h4" {...p} />
        </>
      )}
      {name === 'lock' && (
        <>
          <Rect x={5} y={10} width={14} height={11} rx={2} {...p} />
          <Path d="M8 10V7a4 4 0 0 1 8 0v3" {...p} />
        </>
      )}
      {name === 'users' && (
        <>
          <Circle cx={9} cy={8} r={3.5} {...p} />
          <Path d="M2.5 20c1-3.5 3.5-5 6.5-5s5.5 1.5 6.5 5M16 4.5a3.5 3.5 0 0 1 0 7M18 15c2 .6 3 2.3 3.5 5" {...p} />
        </>
      )}
      {name === 'speed' && (
        <>
          <Path d="M3.5 17a9 9 0 1 1 17 0" {...p} />
          <Path d="M12 13l4-5" {...p} />
        </>
      )}
    </Svg>
  );
}
