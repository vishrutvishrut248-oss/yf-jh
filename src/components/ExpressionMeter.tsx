/**
 * ExpressionMeter — a live read-out of what the tracker is seeing.
 *
 * This exists for trust as much as for looks: it shows that only abstract
 * numbers are being derived from the camera, never an image.
 */
import type { StageStats } from '../three/stage';

const ROWS: { key: keyof StageStats['expression']; label: string }[] = [
  { key: 'jawOpen', label: 'Mouth open' },
  { key: 'blink', label: 'Blink' },
  { key: 'smile', label: 'Smile' },
  { key: 'browRaise', label: 'Brows up' },
];

export default function ExpressionMeter({
  stats,
  visible,
}: {
  stats: StageStats;
  visible: boolean;
}) {
  return (
    <div className="meter" data-visible={visible}>
      <div className="meter-head">
        <span>Live from the camera</span>
        <span className="mono">
          yaw {deg(stats.yaw)}° · pitch {deg(stats.pitch)}° · roll {deg(stats.roll)}°
        </span>
      </div>
      <div className="meter-rows">
        {ROWS.map(({ key, label }) => {
          const v = stats.faceDetected ? stats.expression[key] : 0;
          return (
            <div className="meter-row" key={key}>
              <span>{label}</span>
              <div className="bar">
                <i style={{ width: `${Math.round(Math.min(1, Math.max(0, v)) * 100)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function deg(rad: number) {
  return Math.round((rad * 180) / Math.PI);
}
