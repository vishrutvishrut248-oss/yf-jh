/**
 * PrivacyPanel — states plainly what happens to the camera feed, and lists the
 * expressions the mask responds to. Worth spelling out, because "camera plus a
 * face" is normally a surveillance story and here it deliberately is not.
 */
import type { StageStats } from '../three/stage';

const RESPONDS = [
  ['Mouth', 'Opens and closes with your jaw, and the lips part with it.'],
  ['Eyes', 'Blinks track in real time — masks with eyes shut when you do.'],
  ['Brows', 'Raising your brows lifts the upper mask and lifts the glow.'],
  ['Smile', 'Smiling warms the mask’s tint; frowning cools it.'],
  ['Gaze', 'Where you look brightens that side of the mask.'],
  ['Head', 'Turn, tilt and nod — the bust and the mask’s depth follow.'],
];

export default function PrivacyPanel({
  stats,
  running,
}: {
  stats: StageStats;
  running: boolean;
}) {
  return (
    <div className="privacy">
      <div className="privacy-card">
        <h3>
          Your face is not in this app
          <span className={`dot ${running ? 'on' : ''}`} />
        </h3>
        <ul>
          <li>
            The camera picture is read on this device to find 478 face points, then
            discarded. It is never drawn on screen.
          </li>
          <li>No video is recorded, saved, uploaded or sent anywhere.</li>
          <li>
            What you see is a sculpted mannequin head wearing your mask. Nothing of
            your face is ever rendered.
          </li>
          <li>
            The tracking model is served from this site, not a third party, so the app
            works offline too.
          </li>
        </ul>
        <p className="mono small">
          status: {running ? 'tracking' : 'camera off'} ·{' '}
          {stats.faceDetected ? 'face locked' : 'no face in view'}
        </p>
      </div>

      <div className="privacy-card">
        <h3>What the mask responds to</h3>
        <dl>
          {RESPONDS.map(([term, desc]) => (
            <div key={term}>
              <dt>{term}</dt>
              <dd>{desc}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
