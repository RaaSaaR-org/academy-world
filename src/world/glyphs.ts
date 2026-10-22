/**
 * Zone glyphs (GDD §9.7, 1.5 px stroke at 24 px): drawn on a canvas centred at (cx, cy)
 * with half-size s. Used on gate masts, placeholders and boards.
 */
export function drawGlyph(g: CanvasRenderingContext2D, id: string, cx: number, cy: number, s: number, color: string, width: number): void {
  g.save();
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = width;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  switch (id) {
    case 'sensor': // concentric arcs
      for (const k of [0.45, 0.9, 1.35]) {
        g.moveTo(cx - s * 0.6, cy + s * 0.6 - s * k);
        g.arc(cx - s * 0.6, cy + s * 0.6, s * k, -Math.PI / 2, 0, false);
      }
      g.stroke();
      g.beginPath();
      g.arc(cx - s * 0.6, cy + s * 0.6, s * 0.12, 0, Math.PI * 2);
      g.fill();
      break;
    case 'pendel': // line with a dot
      g.moveTo(cx, cy - s * 0.9);
      g.lineTo(cx + s * 0.35, cy + s * 0.5);
      g.stroke();
      g.beginPath();
      g.arc(cx + s * 0.42, cy + s * 0.72, s * 0.22, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(cx - s * 0.5, cy - s * 0.9);
      g.lineTo(cx + s * 0.5, cy - s * 0.9);
      g.stroke();
      break;
    case 'greifer': // two-jaw bracket
      g.moveTo(cx - s * 0.7, cy - s * 0.8);
      g.lineTo(cx - s * 0.7, cy + s * 0.2);
      g.lineTo(cx - s * 0.25, cy + s * 0.8);
      g.moveTo(cx + s * 0.7, cy - s * 0.8);
      g.lineTo(cx + s * 0.7, cy + s * 0.2);
      g.lineTo(cx + s * 0.25, cy + s * 0.8);
      g.moveTo(cx - s * 0.7, cy - s * 0.8);
      g.lineTo(cx + s * 0.7, cy - s * 0.8);
      g.stroke();
      break;
    case 'band': // three stacked curves
      for (const k of [-0.55, 0, 0.55]) {
        g.moveTo(cx - s * 0.85, cy + k * s);
        g.bezierCurveTo(cx - s * 0.3, cy + k * s - s * 0.35, cx + s * 0.3, cy + k * s + s * 0.35, cx + s * 0.85, cy + k * s);
      }
      g.stroke();
      break;
    case 'kiste': // square with a slit
      g.rect(cx - s * 0.75, cy - s * 0.75, s * 1.5, s * 1.5);
      g.moveTo(cx - s * 0.45, cy - s * 0.25);
      g.lineTo(cx + s * 0.45, cy - s * 0.25);
      g.stroke();
      break;
    case 'kurve': // curve with a band
      g.globalAlpha = 0.3;
      g.moveTo(cx - s * 0.85, cy + s * 0.55);
      g.bezierCurveTo(cx - s * 0.2, cy + s * 0.5, cx + s * 0.1, cy - s * 0.9, cx + s * 0.85, cy - s * 0.65);
      g.lineWidth = width * 4;
      g.stroke();
      g.globalAlpha = 1;
      g.lineWidth = width;
      g.beginPath();
      g.moveTo(cx - s * 0.85, cy + s * 0.55);
      g.bezierCurveTo(cx - s * 0.2, cy + s * 0.5, cx + s * 0.1, cy - s * 0.9, cx + s * 0.85, cy - s * 0.65);
      g.stroke();
      break;
    default:
      g.arc(cx, cy, s * 0.7, 0, Math.PI * 2);
      g.stroke();
  }
  g.restore();
}
