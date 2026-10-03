/**
 * useFacePipeline — wires camera -> tracker -> stage and owns the frame loop.
 *
 * Deliberately keeps all per-frame work out of React state: the loop writes
 * straight into the WebGL scene and only publishes low-frequency UI facts
 * (is a face visible, is the model loaded) back into React.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { FaceLandmarker } from '@mediapipe/tasks-vision';
import { FaceStage, type StageStats } from '../three/stage';
import { getLandmarker, toFrame } from './faceTracker';
import { useCamera } from './useCamera';
import type { Experience } from '../three/experiences';

export type PipelineStatus =
  | { state: 'booting' }
  | { state: 'need-camera' }
  | { state: 'starting-camera' }
  | { state: 'loading-model'; detail: string }
  | { state: 'running' }
  | { state: 'error'; message: string; hint?: string; canOpenTab?: boolean };

export function useFacePipeline(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const camera = useCamera();
  const { videoRef, state: cameraState } = camera;

  const stageRef = useRef<FaceStage | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const rafRef = useRef<number>(0);
  const lastVideoTimeRef = useRef(-1);
  const lastFaceRef = useRef<boolean>(false);
  const statsTickRef = useRef(0);

  const [status, setStatus] = useState<PipelineStatus>({ state: 'booting' });
  const [stats, setStats] = useState<StageStats>({
    faceDetected: false,
    yaw: 0,
    pitch: 0,
    roll: 0,
    expression: { jawOpen: 0, blink: 0, smile: 0, browRaise: 0 },
  });
  const [hasMask, setHasMask] = useState(false);
  const [showVideoProbe, setShowVideoProbe] = useState(false);

  /* ---------------- stage lifecycle ---------------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const stage = new FaceStage({
      canvas,
      onStats: (s) => {
        // Publish to React at ~8 Hz; the pose numbers are for display only.
        const now = performance.now();
        if (now - statsTickRef.current > 120) {
          statsTickRef.current = now;
          setStats(s);
          lastFaceRef.current = s.faceDetected;
        }
      },
    });
    stageRef.current = stage;

    const onResize = () => stage.resize();
    window.addEventListener('resize', onResize);
    const observer = new ResizeObserver(onResize);
    if (canvas.parentElement) observer.observe(canvas.parentElement);

    return () => {
      window.removeEventListener('resize', onResize);
      observer.disconnect();
      cancelAnimationFrame(rafRef.current);
      stage.dispose();
      stageRef.current = null;
    };
  }, [canvasRef]);

  /* ---------------- model lifecycle ---------------- */
  useEffect(() => {
    let cancelled = false;
    setStatus({ state: 'loading-model', detail: 'warming up' });
    getLandmarker((detail) => {
      if (!cancelled) setStatus({ state: 'loading-model', detail });
    })
      .then((lm) => {
        if (cancelled) return;
        landmarkerRef.current = lm;
        setStatus((prev) =>
          prev.state === 'loading-model' ? { state: 'need-camera' } : prev,
        );
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStatus({
          state: 'error',
          message: 'Could not load the face-tracking model.',
          hint: err instanceof Error ? err.message : String(err),
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /* ---------------- camera ---------------- */
  useEffect(() => {
    if (cameraState.status === 'live') {
      setStatus({ state: 'running' });
    } else if (cameraState.status === 'error') {
      setStatus({
        state: 'error',
        message: cameraState.message,
        hint: cameraState.hint,
        canOpenTab: cameraState.canOpenTab,
      });
    } else if (cameraState.status === 'requesting') {
      setStatus({ state: 'starting-camera' });
    } else if (cameraState.status === 'idle' && landmarkerRef.current) {
      setStatus({ state: 'need-camera' });
    }
  }, [cameraState]);

  /* ---------------- frame loop ---------------- */
  const tick = useCallback(() => {
    rafRef.current = requestAnimationFrame(tick);
    const stage = stageRef.current;
    const lm = landmarkerRef.current;
    const video = videoRef.current;
    if (!stage) return;

    const now = performance.now();

    if (lm && video && video.readyState >= 2 && video.videoWidth > 0) {
      // Only run inference on genuinely new frames.
      if (video.currentTime !== lastVideoTimeRef.current) {
        lastVideoTimeRef.current = video.currentTime;
        try {
          const result = lm.detectForVideo(video, now);
          const aspect = video.videoHeight > 0 ? video.videoWidth / video.videoHeight : 16 / 9;
          stage.update(toFrame(result, now), now, aspect);
          return;
        } catch {
          // A dropped frame is not fatal; fall through and re-render.
        }
      }
    }
    stage.update(null, now);
  }, [videoRef]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [tick]);

  /* ---------------- public controls ---------------- */
  const startCamera = useCallback(() => {
    void camera.start();
  }, [camera]);

  const setMask = useCallback((canvas: HTMLCanvasElement) => {
    stageRef.current?.setMaskTexture(canvas);
    setHasMask(true);
  }, []);

  const clearMask = useCallback(() => {
    stageRef.current?.clearMask();
    setHasMask(false);
  }, []);

  const setExperience = useCallback((exp: Experience) => {
    stageRef.current?.setExperience(exp);
  }, []);

  const capture = useCallback(() => stageRef.current?.capture() ?? null, []);

  return {
    status,
    stats,
    hasMask,
    videoRef,
    stageRef,
    startCamera,
    switchCamera: camera.switchCamera,
    facing: camera.facing,
    setMask,
    clearMask,
    setExperience,
    capture,
    showVideoProbe,
    setShowVideoProbe,
  };
}
