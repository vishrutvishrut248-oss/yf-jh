import { useCallback, useEffect, useRef, useState } from 'react';
import { EXPERIENCES, type Experience } from './three/experiences';
import { useFacePipeline } from './lib/useFacePipeline';
import { getImageLandmarker } from './lib/faceTracker';
import {
  bakeAtlas,
  bakeFromLandmarks,
  loadImageFile,
  srcPointsFromGuide,
  type BakeOptions,
  type BakeSource,
  type Guide,
} from './lib/maskBaker';
import ManualPlacer from './components/ManualPlacer';
import ExpressionMeter from './components/ExpressionMeter';
import PrivacyPanel from './components/PrivacyPanel';

type Tab = 'experiences' | 'fit' | 'track';

type Lm = { x: number; y: number; z: number };

const DEFAULT_GUIDE: Guide = { x: 260, y: 260, scale: 0.55, rotation: 0 };

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pipe = useFacePipeline(canvasRef);

  const [experience, setExperience] = useState<Experience>(EXPERIENCES[0]);
  const [tab, setTab] = useState<Tab>('experiences');

  const [source, setSource] = useState<BakeSource | null>(null);
  const [sourceLandmarks, setSourceLandmarks] = useState<Lm[] | null>(null);
  const [maskName, setMaskName] = useState<string | null>(null);
  const [atlas, setAtlas] = useState<HTMLCanvasElement | null>(null);
  const [manual, setManual] = useState(false);
  const [guide, setGuide] = useState<Guide>(DEFAULT_GUIDE);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<string | null>(null);

  const [bakeOpts, setBakeOpts] = useState<BakeOptions>({
    size: 1024,
    clipToFace: true,
    coverHead: false,
    feather: 3,
    removeBackground: true,
    backgroundTolerance: 0.12,
  });

  /* ---------------- keep the stage in sync ---------------- */
  useEffect(() => {
    pipe.setExperience(experience);
  }, [experience, pipe]);

  useEffect(() => {
    if (atlas) pipe.setMask(atlas);
  }, [atlas, pipe]);

  /* ---------------- upload + fit ---------------- */
  const applyBake = useCallback(
    (canvas: HTMLCanvasElement, label: string) => {
      setAtlas(canvas);
      setNotice(label);
      setTab('experiences');
    },
    [],
  );

  const handleFile = useCallback(
    async (file: File) => {
      setBusy('Reading image…');
      setNotice(null);
      try {
        const src = await loadImageFile(file);
        setSource(src);
        setMaskName(file.name.replace(/\.[^.]+$/, ''));

        setBusy('Looking for a face in your mask…');
        const lm = await getImageLandmarker();
        const result = lm.detect(src.bitmap);
        const found = result.faceLandmarks?.[0] ?? null;

        if (found && found.length >= 468) {
          setSourceLandmarks(found);
          setManual(false);
          setBusy('Fitting mask to the face mesh…');
          // Yield a frame so the busy state paints before the warp blocks.
          await new Promise((r) => setTimeout(r, 16));
          const baked = bakeFromLandmarks(src, found, bakeOpts);
          applyBake(baked.canvas, `Fitted “${file.name}” automatically.`);
        } else {
          setSourceLandmarks(null);
          setManual(true);
          setTab('fit');
          setNotice(
            'No face found in that image — position the guide over the mask instead.',
          );
        }
      } catch (err) {
        setNotice(
          `Could not read that file: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        setBusy(null);
      }
    },
    [applyBake, bakeOpts],
  );

  const rebake = useCallback(async () => {
    if (!source) return;
    setBusy('Re-fitting…');
    await new Promise((r) => setTimeout(r, 16));
    try {
      // A face detected in the image gives the best correspondences; otherwise
      // fall back to wherever the user put the manual guide.
      const baked = sourceLandmarks
        ? bakeFromLandmarks(source, sourceLandmarks, bakeOpts)
        : bakeAtlas(source, srcPointsFromGuide(guide, 1024, 0, 0), bakeOpts);
      applyBake(baked.canvas, 'Fit updated.');
    } catch (err) {
      setNotice(`Re-fit failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  }, [applyBake, bakeOpts, guide, source, sourceLandmarks]);

  const applyManual = useCallback(async () => {
    if (!source) return;
    setBusy('Baking mask…');
    await new Promise((r) => setTimeout(r, 16));
    try {
      const baked = bakeAtlas(source, srcPointsFromGuide(guide, 1024, 0, 0), bakeOpts);
      setManual(false);
      applyBake(baked.canvas, `Fitted “${maskName ?? 'mask'}” by hand.`);
    } catch (err) {
      setNotice(`Bake failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  }, [applyBake, bakeOpts, guide, maskName, source]);

  /* ---------------- snapshot ---------------- */
  const takeSnapshot = useCallback(() => {
    const data = pipe.capture();
    if (data) setSnapshot(data);
  }, [pipe]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 's' || e.key === ' ') {
        e.preventDefault();
        takeSnapshot();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [takeSnapshot]);

  /* ---------------- render ---------------- */
  const status = pipe.status;
  const running = status.state === 'running';

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="mark" aria-hidden />
          <div>
            <h1>Maskroom</h1>
            <p>Wear any mask. Keep your face.</p>
          </div>
        </div>
        <div className="topbar-right">
          <span className="pill live" data-on={running}>
            <i />
            {running ? 'Tracking' : 'Idle'}
          </span>
          <span className="pill">
            {pipe.stats.faceDetected ? 'Face in view' : 'No face'}
          </span>
        </div>
      </header>

      <main className="layout">
        {/* ------------------------------ stage ------------------------------ */}
        <section className="stage-wrap">
          <div className="stage">
            <canvas ref={canvasRef} className="stage-canvas" />

            {/* The camera feed exists only as a source of pixels for the model.
                It is never displayed; this element stays 1x1 and invisible. */}
            <video
              ref={pipe.videoRef}
              className="probe-video"
              data-visible={pipe.showVideoProbe}
              playsInline
              muted
              autoPlay
            />

            {status.state !== 'running' && (
              <div className="overlay center">
                <StatusCard
                  status={status}
                  onStart={pipe.startCamera}
                  onOpenTab={() => window.open(window.location.href, '_blank', 'noopener')}
                />
              </div>
            )}

            {status.state === 'running' && !pipe.stats.faceDetected && !busy && !notice && (
              <div className="overlay bottom">
                <div className="toast">
                  Centre your face in front of the camera — nothing of it is shown here.
                </div>
              </div>
            )}

            {busy && (
              <div className="overlay bottom">
                <div className="toast busy">
                  <span className="spinner" />
                  {busy}
                </div>
              </div>
            )}

            {status.state === 'running' && (
              <div className="stage-actions">
                <button
                  className="ghost"
                  onMouseDown={() => pipe.setShowVideoProbe(true)}
                  onMouseUp={() => pipe.setShowVideoProbe(false)}
                  onMouseLeave={() => pipe.setShowVideoProbe(false)}
                  onTouchStart={() => pipe.setShowVideoProbe(true)}
                  onTouchEnd={() => pipe.setShowVideoProbe(false)}
                  title="Hold to check your camera is working. Nothing is recorded."
                >
                  Hold to peek
                </button>
                <button className="primary" onClick={takeSnapshot} disabled={!pipe.hasMask}>
                  Snapshot
                </button>
              </div>
            )}

            {notice && !busy && (
              <div className="overlay bottom">
                <div className="toast" role="status">
                  {notice}
                  <button className="x" onClick={() => setNotice(null)} aria-label="Dismiss">
                    ×
                  </button>
                </div>
              </div>
            )}
          </div>

          <ExpressionMeter stats={pipe.stats} visible={running && tab === 'track'} />
        </section>

        {/* ------------------------------ panel ------------------------------ */}
        <aside className="panel">
          <nav className="tabs" role="tablist">
            {(
              [
                ['fit', 'Mask'],
                ['experiences', 'Experiences'],
                ['track', 'Tracking'],
              ] as [Tab, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                className={tab === id ? 'on' : ''}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="panel-body">
            {tab === 'fit' && (
              <FitPanel
                maskName={maskName}
                hasMask={!!atlas}
                source={source}
                manual={manual}
                guide={guide}
                bakeOpts={bakeOpts}
                onGuideChange={setGuide}
                onBakeOpts={setBakeOpts}
                onFile={handleFile}
                onApplyManual={applyManual}
                onRebake={rebake}
                onEnterManual={() => setManual(true)}
                onRemove={() => {
                  setAtlas(null);
                  setSource(null);
                  setSourceLandmarks(null);
                  setMaskName(null);
                  setManual(false);
                  pipe.clearMask();
                }}
                spotFaces={!!sourceLandmarks}
              />
            )}

            {tab === 'experiences' && (
              <div className="experiences">
                {!atlas && (
                  <p className="lede">
                    Upload a mask to begin. The nine looks below all run on whatever you
                    upload — and every one of them moves with your face.
                  </p>
                )}
                <div className="exp-grid">
                  {EXPERIENCES.map((exp) => (
                    <button
                      key={exp.id}
                      className={`exp ${experience.id === exp.id ? 'on' : ''}`}
                      onClick={() => setExperience(exp)}
                      style={
                        {
                          '--a': exp.backdrop[0],
                          '--b': exp.glow,
                        } as React.CSSProperties
                      }
                    >
                      <span className="exp-chip" />
                      <strong>{exp.label}</strong>
                      <em>{exp.tagline}</em>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {tab === 'track' && <PrivacyPanel stats={pipe.stats} running={running} />}
          </div>
        </aside>
      </main>

      {snapshot && (
        <div className="modal" onClick={() => setSnapshot(null)}>
          <div className="modal-inner" onClick={(e) => e.stopPropagation()}>
            <h2>Snapshot</h2>
            <img src={snapshot} alt="Snapshot of your masked head" />
            <div className="modal-actions">
              <a className="primary" href={snapshot} download={`maskroom-${experience.id}.png`}>
                Download PNG
              </a>
              <button className="ghost" onClick={() => setSnapshot(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function StatusCard({
  status,
  onStart,
  onOpenTab,
}: {
  status: ReturnType<typeof useFacePipeline>['status'];
  onStart: () => void;
  onOpenTab: () => void;
}) {
  if (status.state === 'booting' || status.state === 'loading-model') {
    return (
      <div className="card">
        <span className="spinner" />
        <h2>Loading face tracking</h2>
        <p>All of it runs on your device. Nothing is uploaded.</p>
      </div>
    );
  }
  if (status.state === 'error') {
    return (
      <div className="card">
        <h2>{status.message}</h2>
        <p>{status.hint}</p>
        <div className="card-actions">
          <button className="primary" onClick={onStart}>
            Retry
          </button>
          {status.canOpenTab && (
            <button className="ghost" onClick={onOpenTab}>
              Open in new tab
            </button>
          )}
        </div>
      </div>
    );
  }
  if (status.state === 'need-camera' || status.state === 'starting-camera') {
    return (
      <div className="card">
        <h2>Turn on the camera</h2>
        <p>
          Your camera is used <strong>only</strong> to work out where your face is. The
          picture is never drawn on screen, never recorded and never sent anywhere — you
          will only ever see the mask.
        </p>
        <div className="card-actions">
          <button className="primary" onClick={onStart} disabled={status.state === 'starting-camera'}>
            {status.state === 'starting-camera' ? 'Waiting for permission…' : 'Enable camera'}
          </button>
        </div>
      </div>
    );
  }
  return null;
}

/* ------------------------------------------------------------------ */

function FitPanel(props: {
  maskName: string | null;
  hasMask: boolean;
  source: BakeSource | null;
  manual: boolean;
  guide: Guide;
  bakeOpts: BakeOptions;
  spotFaces: boolean;
  onGuideChange: (g: Guide) => void;
  onBakeOpts: (o: BakeOptions) => void;
  onFile: (f: File) => void;
  onApplyManual: () => void;
  onRebake: () => void;
  onEnterManual: () => void;
  onRemove: () => void;
}) {
  const {
    maskName, hasMask, source, manual, guide, bakeOpts, spotFaces,
    onGuideChange, onBakeOpts, onFile, onApplyManual, onRebake, onEnterManual, onRemove,
  } = props;

  const [dragging, setDragging] = useState(false);

  return (
    <div className="fit">
      <div
        className={`drop ${dragging ? 'over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
      >
        <strong>{maskName ?? 'Drop a mask picture'}</strong>
        <span>
          A photo of a mask, a drawing, a PNG — anything with a face on it works best.
        </span>
        <label className="file-btn">
          Choose file
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = '';
            }}
          />
        </label>
      </div>

      {source && manual && (
        <ManualPlacer
          image={source.bitmap as CanvasImageSource}
          imageWidth={source.width}
          imageHeight={source.height}
          guide={guide}
          onGuideChange={onGuideChange}
        />
      )}

      {source && manual && (
        <div className="row">
          <button className="primary" onClick={onApplyManual}>
            Apply this fit
          </button>
        </div>
      )}

      {hasMask && (
        <>
          <fieldset>
            <legend>Fit</legend>
            <Toggle
              label="Cut out the background"
              hint="Removes a flat backdrop, e.g. a product shot on white."
              checked={!!bakeOpts.removeBackground}
              onChange={(v) => onBakeOpts({ ...bakeOpts, removeBackground: v })}
            />
            <Toggle
              label="Wrap around the head"
              hint="Bleeds the mask's edge colours outward so it covers the skull."
              checked={!!bakeOpts.coverHead}
              onChange={(v) => onBakeOpts({ ...bakeOpts, coverHead: v })}
            />
            <Toggle
              label="Keep only the face"
              hint="Clips the mask to the face contour."
              checked={bakeOpts.clipToFace !== false}
              onChange={(v) => onBakeOpts({ ...bakeOpts, clipToFace: v })}
            />
            <label className="slider">
              <span>Edge softness</span>
              <input
                type="range"
                min={0}
                max={20}
                value={bakeOpts.feather ?? 3}
                onChange={(e) => onBakeOpts({ ...bakeOpts, feather: Number(e.target.value) })}
              />
              <em>{bakeOpts.feather ?? 3}px</em>
            </label>
          </fieldset>

          <div className="row">
            <button className="ghost" onClick={onRebake} disabled={!source}>
              Re-fit
            </button>
            {!manual && source && spotFaces && (
              <button className="ghost" onClick={onEnterManual}>
                Adjust by hand
              </button>
            )}
            <button className="ghost danger" onClick={onRemove}>
              Remove
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch" aria-hidden />
      <span className="toggle-text">
        <strong>{label}</strong>
        {hint && <em>{hint}</em>}
      </span>
    </label>
  );
}
