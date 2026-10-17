import { useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { colors, mono, weight } from '../lib/theme';

export interface Series {
  name: string;
  color: string;
  points: { x: number; y: number }[];
  /** Point to call out with a direct label, e.g. the personal best. */
  highlight?: { index: number; label: string };
}

interface Props {
  series: Series[];
  formatX: (x: number) => string;
  formatY: (y: number) => string;
  /** Spoken summary of the chart. */
  label: string;
  height?: number;
}

const M = { top: 20, right: 14, bottom: 26, left: 56 };
/** Native SVG text uses the system font already; the web build needs it set explicitly. */
const FONT = Platform.OS === 'web' ? 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' : undefined;

function ticks(lo: number, hi: number, count = 4) {
  const raw = (hi - lo || Math.abs(hi) || 1) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(v);
  return out;
}

/**
 * Line chart for phones: 2px lines, 8px markers with a surface ring, a crosshair that follows the
 * finger and snaps to the nearest x, and a readout listing every series. Screen readers can step
 * through points with the adjustable (swipe up/down) gesture.
 */
export function LineChart({ series, formatX, formatY, label, height = 200 }: Props) {
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const xs = useMemo(() => [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort((a, b) => a - b), [series]);
  const ys = series.flatMap((s) => s.points.map((p) => p.y));

  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));
  if (!xs.length) return null;

  const iw = Math.max(1, width - M.left - M.right);
  const ih = height - M.top - M.bottom;
  const yLo = Math.min(...ys);
  const yHi = Math.max(...ys);
  const pad = (yHi - yLo || yHi * 0.02 || 1) * 0.15;
  const yTicks = ticks(yLo - pad, yHi + pad);
  const y0 = Math.min(yTicks[0], yLo - pad);
  const y1 = Math.max(yTicks[yTicks.length - 1], yHi + pad);
  const sy = (v: number) => M.top + ih - ((v - y0) / (y1 - y0)) * ih;
  const sx = (v: number) => (xs.length === 1 ? M.left + iw / 2 : M.left + ((v - xs[0]) / (xs[xs.length - 1] - xs[0])) * iw);
  const nTicks = Math.max(2, Math.min(xs.length, Math.floor(iw / 72)));
  const xTicks = xs.length <= nTicks ? xs : Array.from({ length: nTicks }, (_, i) => xs[Math.round((i * (xs.length - 1)) / (nTicks - 1))]);

  const pick = (e: GestureResponderEvent) => {
    const px = e.nativeEvent.locationX;
    let best = 0;
    xs.forEach((x, i) => {
      if (Math.abs(sx(x) - px) < Math.abs(sx(xs[best]) - px)) best = i;
    });
    setActive(best);
  };

  const ax = active === null ? null : xs[active];
  const readout =
    ax === null
      ? null
      : `${formatX(ax)}: ${series
          .map((s) => {
            const p = s.points.find((q) => q.x === ax);
            return `${series.length > 1 ? `${s.name} ` : ''}${p ? formatY(p.y) : 'no lap'}`;
          })
          .join(', ')}`;

  return (
    <View
      onLayout={onLayout}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: readout ?? 'Swipe up or down to step through points' }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) =>
        setActive((a) =>
          e.nativeEvent.actionName === 'increment' ? Math.min(xs.length - 1, (a ?? -1) + 1) : Math.max(0, (a ?? xs.length) - 1),
        )
      }
    >
      {/* Readout row: fixed height so the chart doesn't jump. Values lead, labels follow. */}
      <View style={styles.readout}>
        {ax === null ? (
          <Text style={styles.hint}>Touch the chart for values</Text>
        ) : (
          <>
            <Text style={styles.readoutTitle}>{formatX(ax)}</Text>
            {series.map((s) => {
              const p = s.points.find((q) => q.x === ax);
              return (
                <View key={s.name} style={styles.readoutItem}>
                  <View style={[styles.key, { backgroundColor: s.color }]} />
                  <Text style={styles.readoutValue}>{p ? formatY(p.y) : '—'}</Text>
                  {series.length > 1 && <Text style={styles.hint}>{s.name}</Text>}
                </View>
              );
            })}
          </>
        )}
      </View>

      <View
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={pick}
        onResponderMove={pick}
        onResponderRelease={() => {}}
        onResponderTerminationRequest={() => false}
      >
        {width > 0 && (
          <Svg width={width} height={height}>
            {yTicks.map((t) => (
              <SvgText key={`g${t}`} x={M.left - 8} y={sy(t) + 4} fontSize={11} fontFamily={FONT} fill={colors.muted} textAnchor="end">
                {formatY(t)}
              </SvgText>
            ))}
            {yTicks.map((t) => (
              <Line key={`l${t}`} x1={M.left} x2={M.left + iw} y1={sy(t)} y2={sy(t)} stroke={colors.border} strokeWidth={1} strokeDasharray="2 4" />
            ))}
            <Line x1={M.left} x2={M.left + iw} y1={M.top + ih} y2={M.top + ih} stroke={colors.border} strokeWidth={1} />
            {xTicks.map((t, i) => (
              <SvgText
                key={`x${t}-${i}`}
                x={sx(t)}
                y={height - 6}
                fontSize={11}
                fontFamily={FONT}
                fill={colors.muted}
                textAnchor={xTicks.length > 1 && i === 0 ? 'start' : xTicks.length > 1 && i === xTicks.length - 1 ? 'end' : 'middle'}
              >
                {formatX(t)}
              </SvgText>
            ))}
            {ax !== null && <Line x1={sx(ax)} x2={sx(ax)} y1={M.top} y2={M.top + ih} stroke={colors.muted} strokeWidth={1} />}
            {series.map((s) => (
              <Path
                key={`p${s.name}`}
                d={s.points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join('')}
                stroke={s.color}
                strokeWidth={2}
                fill="none"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
            {series.flatMap((s) =>
              s.points.map((p, i) => (
                <Circle key={`c${s.name}${i}`} cx={sx(p.x)} cy={sy(p.y)} r={p.x === ax ? 5.5 : 4} fill={s.color} stroke={colors.surface} strokeWidth={2} />
              )),
            )}
            {series.map((s) =>
              s.highlight && s.points[s.highlight.index] ? (
                <SvgText
                  key={`h${s.name}`}
                  x={Math.min(Math.max(sx(s.points[s.highlight.index].x), M.left + 30), M.left + iw - 30)}
                  y={sy(s.points[s.highlight.index].y) - 12}
                  fontSize={11}
                  fontFamily={FONT}
                  fontWeight={weight.regular}
                  fill={colors.text}
                  textAnchor="middle"
                >
                  {s.highlight.label}
                </SvgText>
              ) : null,
            )}
          </Svg>
        )}
      </View>

      {series.length > 1 && (
        <View style={styles.legend}>
          {series.map((s) => (
            <View key={s.name} style={styles.readoutItem}>
              <View style={[styles.key, { backgroundColor: s.color }]} />
              <Text style={styles.legendText}>{s.name}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  readout: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, minHeight: 24, marginBottom: 4 },
  readoutTitle: { color: colors.muted, fontSize: 12 },
  readoutItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  readoutValue: { color: colors.text, fontWeight: weight.regular, fontSize: 14, ...mono },
  hint: { color: colors.muted, fontSize: 12 },
  key: { width: 14, height: 3, borderRadius: 2 },
  legend: { flexDirection: 'row', gap: 16, marginTop: 4 },
  legendText: { color: colors.text, fontSize: 12 },
});
