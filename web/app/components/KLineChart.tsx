"use client";

/**
 * KLineChart — candlestick-style chart with MA20 overlay.
 *
 * Recharts doesn't ship a native candlestick component, but a
 * ComposedChart with custom-shape Bars covers 95% of the visual
 * intent: each bar's body spans open→close (green if up, red if
 * down) with a thin wick from high→low.
 *
 * Inputs: OHLCV array (same shape /v1/quote returns).
 * Renders:
 *   - Candle bars (custom shape, body=open..close, wick=high..low)
 *   - MA20 line overlay (simple moving average)
 *   - Volume sub-bar at the bottom (compact mode = no)
 *
 * Why not Highcharts / Lightweight-Charts? Recharts is already in
 * the bundle and the candlestick visual we need is ~60 lines of
 * custom shape code. Saving the deps cost.
 */

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

export interface OHLCBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface Props {
  bars: OHLCBar[];
  /** show MA20 / MA60 overlays? Default both. */
  ma?: number[];
  /** height in px (responsive width). Default 280. */
  height?: number;
  /** compact = hide volume sub-row + grid + axis labels for inline use. */
  compact?: boolean;
}

export function KLineChart({
  bars,
  ma = [20, 60],
  height = 280,
  compact = false,
}: Props) {
  if (!bars || bars.length === 0) {
    return (
      <div className="surface p-6 text-xs text-ink-tertiary italic text-center">
        No OHLCV bars to render
      </div>
    );
  }

  // Compute moving averages once, attach to each row.
  // Row values are heterogeneous (scalar prices, MA floats, and two
  // [number, number] tuples for the candle shape), so use `unknown` —
  // Recharts only requires the dataKey-pointed values to be readable
  // from props.payload, not statically typed at the row level.
  const closes = bars.map((b) => b.close);
  const rows: Record<string, unknown>[] = bars.map((b, i) => {
    const row: Record<string, unknown> = {
      date: b.date.slice(5),  // mm-dd suffices for x-axis
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume ?? 0,
      // Encode body as a [open, close] tuple for the custom-shape Bar.
      // We pass open+close in two separate keys and the custom shape
      // reads them both.
      ocRange: [b.open, b.close],
      hlRange: [b.low, b.high],
    };
    for (const period of ma) {
      if (i + 1 >= period) {
        const window = closes.slice(i + 1 - period, i + 1);
        row[`ma${period}`] = window.reduce((s, v) => s + v, 0) / period;
      } else {
        row[`ma${period}`] = null;
      }
    }
    return row;
  });

  // Compute y-axis range with padding so the candles don't crowd the edge.
  const allLows = bars.map((b) => b.low);
  const allHighs = bars.map((b) => b.high);
  const yMin = Math.min(...allLows);
  const yMax = Math.max(...allHighs);
  const yPad = (yMax - yMin) * 0.08 || 1;

  const colorUp = "#3FB950";    // signal-buy
  const colorDown = "#F85149";  // signal-sell
  const colorMa20 = "#C9A961";  // accent gold
  const colorMa60 = "#9AA6B8";  // ink-tertiary

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={rows}
          margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
        >
          {!compact && (
            <CartesianGrid stroke="#222" strokeDasharray="2 4" vertical={false} />
          )}
          <XAxis
            dataKey="date"
            stroke="#666"
            fontSize={10}
            tickLine={false}
            tick={{ fill: "#888" }}
            interval={Math.max(1, Math.floor(rows.length / 12))}
          />
          <YAxis
            yAxisId="price"
            domain={[yMin - yPad, yMax + yPad]}
            stroke="#666"
            fontSize={10}
            tickLine={false}
            tick={{ fill: "#888" }}
            orientation="right"
            width={50}
          />
          <Tooltip
            content={<KLineTooltip />}
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
          />

          {/* Wick — thin vertical line between high and low. */}
          <Bar
            yAxisId="price"
            dataKey="hlRange"
            shape={(p: WickShapeProps) => <WickShape {...p} colorUp={colorUp} colorDown={colorDown} />}
            isAnimationActive={false}
          />

          {/* Body — fat rectangle between open and close. */}
          <Bar
            yAxisId="price"
            dataKey="ocRange"
            shape={(p: BodyShapeProps) => <BodyShape {...p} colorUp={colorUp} colorDown={colorDown} />}
            isAnimationActive={false}
          />

          {/* Moving averages. */}
          {ma.includes(20) && (
            <Line
              yAxisId="price"
              dataKey="ma20"
              stroke={colorMa20}
              strokeWidth={1.5}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          )}
          {ma.includes(60) && (
            <Line
              yAxisId="price"
              dataKey="ma60"
              stroke={colorMa60}
              strokeWidth={1.5}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      {/* Legend strip */}
      {!compact && (
        <div className="flex items-center gap-3 px-2 text-2xs text-ink-tertiary font-mono mt-1">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 inline-block" style={{ background: colorUp }} />
            涨
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 inline-block" style={{ background: colorDown }} />
            跌
          </span>
          {ma.includes(20) && (
            <span className="flex items-center gap-1">
              <span className="w-3 h-0.5 inline-block" style={{ background: colorMa20 }} />
              MA20
            </span>
          )}
          {ma.includes(60) && (
            <span className="flex items-center gap-1">
              <span className="w-3 h-0.5 inline-block" style={{ background: colorMa60 }} />
              MA60
            </span>
          )}
          <span className="ml-auto">{rows.length} bars</span>
        </div>
      )}
    </div>
  );
}

interface PayloadDatum {
  open: number;
  close: number;
  high: number;
  low: number;
  ocRange?: [number, number];
  hlRange?: [number, number];
}

interface WickShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: PayloadDatum;
  yAxis?: { scale?: (v: number) => number };
  colorUp: string;
  colorDown: string;
}

/**
 * Wick: a thin vertical rectangle from low → high.
 * Recharts gives us the bar's full (x, y, width, height) for the
 * dataKey value; we throw that away and compute our own y/height
 * directly from the scale.
 */
function WickShape(props: WickShapeProps) {
  const { x = 0, width = 4, payload, yAxis, colorUp, colorDown } = props;
  if (!payload || !yAxis?.scale) return null;
  const up = payload.close >= payload.open;
  const yHigh = yAxis.scale(payload.high);
  const yLow = yAxis.scale(payload.low);
  const cx = x + width / 2;
  return (
    <rect
      x={cx - 0.5}
      y={Math.min(yHigh, yLow)}
      width={1}
      height={Math.abs(yHigh - yLow)}
      fill={up ? colorUp : colorDown}
    />
  );
}

type BodyShapeProps = WickShapeProps;

/**
 * Body: a fatter rectangle from open → close.
 * Up candles filled with colorUp, down candles filled with colorDown.
 */
function BodyShape(props: BodyShapeProps) {
  const { x = 0, width = 4, payload, yAxis, colorUp, colorDown } = props;
  if (!payload || !yAxis?.scale) return null;
  const up = payload.close >= payload.open;
  const yOpen = yAxis.scale(payload.open);
  const yClose = yAxis.scale(payload.close);
  const top = Math.min(yOpen, yClose);
  const h = Math.max(1, Math.abs(yOpen - yClose));
  // Body should be ~60% of slot width, centered.
  const bodyW = Math.max(2, width * 0.6);
  const bodyX = x + (width - bodyW) / 2;
  return (
    <rect
      x={bodyX}
      y={top}
      width={bodyW}
      height={h}
      fill={up ? colorUp : colorDown}
    />
  );
}

interface TooltipPayloadEntry {
  value: number | string;
  payload?: {
    date?: string;
    open?: number;
    high?: number;
    low?: number;
    close?: number;
    volume?: number;
    ma20?: number | null;
    ma60?: number | null;
  };
}

function KLineTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload || {};
  const up = (p.close ?? 0) >= (p.open ?? 0);
  return (
    <div className="surface-elev p-3 text-2xs font-mono">
      <div className="text-ink-primary mb-1">{label}</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        <span className="text-ink-tertiary">Open</span>
        <span className="text-ink-primary text-right">{(p.open ?? 0).toFixed(2)}</span>
        <span className="text-ink-tertiary">High</span>
        <span className="text-signal-buy text-right">{(p.high ?? 0).toFixed(2)}</span>
        <span className="text-ink-tertiary">Low</span>
        <span className="text-signal-sell text-right">{(p.low ?? 0).toFixed(2)}</span>
        <span className="text-ink-tertiary">Close</span>
        <span className={up ? "text-signal-buy text-right" : "text-signal-sell text-right"}>
          {(p.close ?? 0).toFixed(2)}
        </span>
        {p.ma20 != null && (
          <>
            <span className="text-ink-tertiary">MA20</span>
            <span className="text-accent text-right">{p.ma20.toFixed(2)}</span>
          </>
        )}
      </div>
    </div>
  );
}
