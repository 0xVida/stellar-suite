// ============================================================
// src/services/simulationChartRenderer.ts
// Generates inline SVG markup for simulation charts.
// No DOM dependency — works in Node.js tests and VS Code WebViews.
// ============================================================

import {
  BarChartItem,
  DoughnutSlice,
  SparklinePoint,
} from "./simulationChartDataService";

// ── Render Options ───────────────────────────────────────────

export interface BarChartOptions {
  /** Chart width in px. */
  width?: number;
  /** Chart height in px (auto-sized from items if omitted). */
  height?: number;
  /** Chart title. */
  title?: string;
  /** Bar height in px. */
  barHeight?: number;
  /** Gap between bars in px. */
  barGap?: number;
  /** Left margin for labels in px. */
  labelWidth?: number;
}

export interface DoughnutChartOptions {
  /** Outer diameter in px. */
  size?: number;
  /** Ring width as fraction of radius (0–1). */
  thickness?: number;
  /** Chart title. */
  title?: string;
}

export interface SparklineOptions {
  /** Chart width in px. */
  width?: number;
  /** Chart height in px. */
  height?: number;
  /** Line stroke colour. */
  color?: string;
  /** Chart title. */
  title?: string;
}

// ── Renderer ─────────────────────────────────────────────────

export class SimulationChartRenderer {
  // ── Horizontal Bar Chart ─────────────────────────────────

  static renderHorizontalBarChart(
    data: BarChartItem[],
    options: BarChartOptions = {},
  ): string {
    if (data.length === 0) {
      return "";
    }

    const { barHeight = 28, barGap = 12, labelWidth = 130, title } = options;

    const titleHeight = title ? 32 : 0;
    const valueWidth = 90;
    const barAreaWidth = 300;
    const width = options.width ?? labelWidth + barAreaWidth + valueWidth + 20;
    const height =
      options.height ??
      titleHeight + data.length * (barHeight + barGap) + barGap;

    const globalMax = Math.max(...data.map((d) => d.max), 1);

    const bars = data
      .map((item, i) => {
        const y = titleHeight + barGap + i * (barHeight + barGap);
        const barWidth = Math.max(2, (item.value / globalMax) * barAreaWidth);

        return `
        <g class="chart-item" style="cursor:pointer" onmouseover="this.querySelector('rect').setAttribute('opacity','1')" onmouseout="this.querySelector('rect').setAttribute('opacity','0.85')">
            <text x="${labelWidth - 8}" y="${y + barHeight / 2 + 5}"
                  text-anchor="end"
                  fill="var(--vscode-foreground, #ccc)"
                  font-size="12">${escapeXml(item.label)}</text>
            <rect x="${labelWidth}" y="${y}" width="${barWidth}" height="${barHeight}"
                  rx="4" fill="${item.color}" opacity="0.85" style="transition:opacity 0.15s ease">
                <title>${escapeXml(item.label)}: ${escapeXml(item.displayValue)} ${escapeXml(item.unit)}</title>
            </rect>
            <text x="${labelWidth + barWidth + 8}" y="${y + barHeight / 2 + 5}"
                  fill="var(--vscode-foreground, #ccc)"
                  font-size="12">${escapeXml(item.displayValue)}</text>
        </g>`;
      })
      .join("");

    const titleEl = title
      ? `<text x="${width / 2}" y="20" text-anchor="middle"
                     fill="var(--vscode-foreground, #ccc)" font-size="14" font-weight="600">${escapeXml(title)}</text>`
      : "";

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" class="simulation-chart simulation-chart-bar">
    ${titleEl}
    ${bars}
</svg>`;
  }

  // ── Doughnut Chart ───────────────────────────────────────

  static renderDoughnutChart(
    data: DoughnutSlice[],
    options: DoughnutChartOptions = {},
  ): string {
    if (data.length === 0) {
      return "";
    }

    const { size = 200, thickness = 0.35, title } = options;

    const titleHeight = title ? 28 : 0;
    const legendHeight = data.length * 20 + 8;
    const totalHeight = size + titleHeight + legendHeight;

    const cx = size / 2;
    const cy = titleHeight + size / 2;
    const outerRadius = size / 2 - 4;
    const innerRadius = outerRadius * (1 - thickness);
    const circumference = 2 * Math.PI * ((outerRadius + innerRadius) / 2);

    const totalValue = data.reduce((sum, d) => sum + d.value, 0);
    let cumulativeOffset = 0;

    const arcs = data
      .map((slice) => {
        const frac = slice.value / totalValue;
        const dashLength = frac * circumference;
        const gapLength = circumference - dashLength;
        const offset = -cumulativeOffset * circumference;

        const arc = `
        <circle cx="${cx}" cy="${cy}" r="${(outerRadius + innerRadius) / 2}"
                fill="none"
                stroke="${slice.color}"
                stroke-width="${outerRadius - innerRadius}"
                stroke-dasharray="${dashLength} ${gapLength}"
                stroke-dashoffset="${offset}"
                opacity="0.85"
                style="cursor:pointer;transition:opacity 0.15s ease"
                onmouseover="this.setAttribute('opacity','1');this.setAttribute('stroke-width','${outerRadius - innerRadius + 4}')"
                onmouseout="this.setAttribute('opacity','0.85');this.setAttribute('stroke-width','${outerRadius - innerRadius}')">
            <title>${escapeXml(slice.label)}: ${slice.percentage}%</title>
        </circle>`;

        cumulativeOffset += frac;
        return arc;
      })
      .join("");

    const legend = data
      .map((slice, i) => {
        const ly = size + titleHeight + 8 + i * 20;
        return `
        <g>
            <rect x="10" y="${ly}" width="12" height="12" rx="2" fill="${slice.color}" />
            <text x="28" y="${ly + 11}" fill="var(--vscode-foreground, #ccc)" font-size="12">
                ${escapeXml(slice.label)} · ${slice.percentage}%
            </text>
        </g>`;
      })
      .join("");

    const titleEl = title
      ? `<text x="${size / 2}" y="18" text-anchor="middle"
                     fill="var(--vscode-foreground, #ccc)" font-size="14" font-weight="600">${escapeXml(title)}</text>`
      : "";

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${totalHeight}" viewBox="0 0 ${size} ${totalHeight}" class="simulation-chart simulation-chart-doughnut">
    ${titleEl}
    ${arcs}
    ${legend}
</svg>`;
  }

  // ── Sparkline ────────────────────────────────────────────

  static renderSparkline(
    data: SparklinePoint[],
    options: SparklineOptions = {},
  ): string {
    if (data.length < 2) {
      return "";
    }

    const { width = 260, height = 60, color = "#4fc3f7", title } = options;

    const titleHeight = title ? 20 : 0;
    const chartHeight = height - titleHeight;
    const padding = 4;

    const minY = Math.min(...data.map((d) => d.y));
    const maxY = Math.max(...data.map((d) => d.y));
    const rangeY = maxY - minY || 1;

    const points = data
      .map((p, i) => {
        const px = padding + (i / (data.length - 1)) * (width - padding * 2);
        const py =
          titleHeight +
          padding +
          (1 - (p.y - minY) / rangeY) * (chartHeight - padding * 2);
        return `${px.toFixed(1)},${py.toFixed(1)}`;
      })
      .join(" ");

    const titleEl = title
      ? `<text x="${width / 2}" y="14" text-anchor="middle"
                     fill="var(--vscode-foreground, #ccc)" font-size="11">${escapeXml(title)}</text>`
      : "";

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" class="simulation-chart simulation-chart-sparkline">
    ${titleEl}
    <polyline points="${points}"
              fill="none" stroke="${color}" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round" />
</svg>`;
  }
}

// ── Helpers ──────────────────────────────────────────────────

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
