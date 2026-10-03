/**
 * ManualPlacer — for mask images with no detectable face.
 *
 * There is nothing clever to detect here, so the user is handed the canonical
 * face guide and drags it onto their artwork. The guide IS the correspondence:
 * wherever it lands is what maps onto the canonical mesh, which is what the
 * bake reads back out.
 *
 * Rendered on a plain 2D canvas at display resolution; the actual bake always
 * runs at the source image's own resolution.
 */
import { useEffect, useRef } from 'react';
import { boundaryLoop, makeGuideMapper, type Guide } from '../lib/maskBaker';
import { CANONICAL_UVS, uvToAtlas } from '../lib/canonicalFace';
import { LIPS_OUTER, LEFT_EYE, RIGHT_EYE, FACE_OVAL } from '../lib/landmarks';

const GUIDE_MAP_SIZE = 1024;

type Props = {
  image: CanvasImageSource;
  imageWidth: number;
  imageHeight: number;
  guide: Guide;
  onGuideChange: (g: Guide) => void;
};

export default function ManualPlacer({
  image,
  imageWidth,
  imageHeight,
  guide,
  onGuideChange,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const guideRef = useRef(guide);
  guideRef.current = guide;

  const width = 520;
  const height = Math.round((imageHeight / imageWidth) * width);
  const fit = Math.min(width / imageWidth, height / imageHeight);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, width, height);
    // The image, drawn to fit the preview.
    ctx.drawImage(image, 0, 0, imageWidth, imageHeight, 0, 0, imageWidth * fit, imageHeight * fit);

    // Dim everything outside the guide so the fit reads at a glance.
    const map = makeGuideMapper(guideRef.current, GUIDE_MAP_SIZE, 0, 0);
    ctx.save();
    ctx.scale(fit, fit);
    ctx.beginPath();
    traceLoop(ctx, boundaryLoop(), map);
    ctx.restore();
    ctx.fillStyle = 'rgba(6,8,14,0.66)';
    ctx.fill('evenodd');

    // Guide outline + a few interior landmarks as alignment cues.
    ctx.save();
    ctx.scale(fit, fit);
    ctx.beginPath();
    traceLoop(ctx, boundaryLoop(), map);
    ctx.restore();
    ctx.strokeStyle = 'rgba(140,190,255,0.95)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.save();
    ctx.scale(fit, fit);
    drawPolyline(ctx, FACE_OVAL, map, 'rgba(140,190,255,0.5)', 1);
    drawPolyline(ctx, LEFT_EYE, map, 'rgba(255,255,255,0.85)', 1.2);
    drawPolyline(ctx, RIGHT_EYE, map, 'rgba(255,255,255,0.85)', 1.2);
    drawPolyline(ctx, LIPS_OUTER, map, 'rgba(255,190,190,0.85)', 1.2);
    ctx.restore();
  }, [image, imageWidth, imageHeight, guide, width, height, fit]);

  const pick = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  return (
    <div className="placer">
      <canvas
        ref={canvasRef}
        className="placer-canvas"
        onPointerDown={(e) => {
          const p = pick(e);
          dragRef.current = { dx: guide.x - p.x, dy: guide.y - p.y };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!dragRef.current) return;
          const p = pick(e);
          onGuideChange({
            ...guide,
            x: p.x + dragRef.current.dx,
            y: p.y + dragRef.current.dy,
          });
        }}
        onPointerUp={(e) => {
          dragRef.current = null;
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onWheel={(e) => {
          e.preventDefault();
          const factor = e.deltaY < 0 ? 1.06 : 0.94;
          const p = pick(e as unknown as React.PointerEvent<HTMLCanvasElement>);
          // Zoom about the cursor: keep the point under the pointer fixed.
          const sx = (p.x - guide.x) / guide.scale;
          const sy = (p.y - guide.y) / guide.scale;
          const nextScale = Math.max(0.05, Math.min(20, guide.scale * factor));
          onGuideChange({
            ...guide,
            scale: nextScale,
            x: p.x - sx * nextScale,
            y: p.y - sy * nextScale,
          });
        }}
      />

      <div className="placer-controls">
        <label>
          <span>Size</span>
          <input
            type="range"
            min={5}
            max={300}
            value={Math.round(guide.scale * 100)}
            onChange={(e) =>
              onGuideChange({ ...guide, scale: Number(e.target.value) / 100 })
            }
          />
          <em>{Math.round(guide.scale * 100)}%</em>
        </label>
        <label>
          <span>Rotate</span>
          <input
            type="range"
            min={-180}
            max={180}
            value={Math.round((guide.rotation * 180) / Math.PI)}
            onChange={(e) =>
              onGuideChange({ ...guide, rotation: (Number(e.target.value) * Math.PI) / 180 })
            }
          />
          <em>{Math.round((guide.rotation * 180) / Math.PI)}°</em>
        </label>
        <p className="hint">
          Drag the guide onto the mask&rsquo;s face. Line the eyes and mouth up with the
          white and pink curves, then apply.
        </p>
      </div>
    </div>
  );
}

function traceLoop(
  ctx: CanvasRenderingContext2D,
  loop: number[],
  map: (x: number, y: number) => [number, number],
) {
  loop.forEach((idx, i) => {
    const [ax, ay] = uvToAtlas(CANONICAL_UVS, idx, GUIDE_MAP_SIZE);
    const [x, y] = map(ax, ay);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
}

function drawPolyline(
  ctx: CanvasRenderingContext2D,
  indices: number[],
  map: (x: number, y: number) => [number, number],
  colour: string,
  lineWidth: number,
) {
  ctx.beginPath();
  indices.forEach((idx, i) => {
    const [ax, ay] = uvToAtlas(CANONICAL_UVS, idx, GUIDE_MAP_SIZE);
    const [x, y] = map(ax, ay);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = colour;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}
