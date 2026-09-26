/**
 * 外部ライブラリ（Chart.js等）に依存しない、最小限のSVGグラフ描画。
 * オフラインで完全に動くPWAという方針のため、CDN読み込みを避けて自前で実装する。
 */

function pickLabelIndexes(count, maxLabels) {
  const step = Math.max(1, Math.ceil(count / maxLabels));
  const indexes = [];
  for (let i = 0; i < count; i += step) indexes.push(i);
  return new Set(indexes);
}

/** 0を基準にプラス／マイナスで色分けする棒グラフ（月別収支など）。 */
export function renderBarChart({ labels, values, height = 140, maxLabels = 6 }) {
  const width = Math.max(labels.length * 26, 280);
  const maxAbs = Math.max(1, ...values.map((v) => Math.abs(v)));
  const plotHeight = height - 20;
  const zeroY = plotHeight / 2;
  const scale = (plotHeight / 2 - 6) / maxAbs;
  const slot = width / labels.length;
  const barWidth = Math.max(slot * 0.6, 2);
  const shownLabels = pickLabelIndexes(labels.length, maxLabels);

  const bars = values
    .map((v, i) => {
      const x = i * slot + (slot - barWidth) / 2;
      const barHeight = Math.max(Math.abs(v) * scale, 1);
      const y = v >= 0 ? zeroY - barHeight : zeroY;
      const color = v >= 0 ? "#0d6efd" : "#dc3545";
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" fill="${color}"></rect>`;
    })
    .join("");

  const labelsHtml = labels
    .map((label, i) => {
      if (!shownLabels.has(i)) return "";
      const x = i * slot + slot / 2;
      return `<text x="${x.toFixed(1)}" y="${height - 4}" font-size="9" text-anchor="middle" fill="#666">${label}</text>`;
    })
    .join("");

  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="display:block;">
    <line x1="0" y1="${zeroY}" x2="${width}" y2="${zeroY}" stroke="#ccc" stroke-width="1"></line>
    ${bars}
    ${labelsHtml}
  </svg>`;
}

/** 折れ線グラフ（累計収支・貯玉残高の推移など）。 */
export function renderLineChart({ labels, values, height = 120, color = "#212529", maxLabels = 6, fill = false }) {
  const width = Math.max(labels.length * 26, 280);
  const plotHeight = height - 20;
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values, min + 1);
  const range = max - min;
  const slot = width / Math.max(labels.length - 1, 1);

  const points = values.map((v, i) => {
    const x = labels.length === 1 ? width / 2 : i * slot;
    const y = plotHeight - ((v - min) / range) * plotHeight;
    return [x, y];
  });
  const pointsAttr = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const shownLabels = pickLabelIndexes(labels.length, maxLabels);

  const labelsHtml = labels
    .map((label, i) => {
      if (!shownLabels.has(i)) return "";
      const [x] = points[i];
      return `<text x="${x.toFixed(1)}" y="${height - 4}" font-size="9" text-anchor="middle" fill="#666">${label}</text>`;
    })
    .join("");

  const zeroY = plotHeight - ((0 - min) / range) * plotHeight;
  const fillPath = fill
    ? `<polygon points="0,${zeroY.toFixed(1)} ${pointsAttr} ${width},${zeroY.toFixed(1)}" fill="${color}" fill-opacity="0.12"></polygon>`
    : "";

  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="display:block;">
    <line x1="0" y1="${zeroY.toFixed(1)}" x2="${width}" y2="${zeroY.toFixed(1)}" stroke="#ccc" stroke-width="1"></line>
    ${fillPath}
    <polyline points="${pointsAttr}" fill="none" stroke="${color}" stroke-width="2"></polyline>
    ${labelsHtml}
  </svg>`;
}
