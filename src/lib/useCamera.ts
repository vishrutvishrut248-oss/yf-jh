import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraState =
  | { status: 'idle' }
  | { status: 'requesting' }
  | { status: 'live'; label: string }
  | { status: 'error'; message: string; hint: string; canOpenTab: boolean };

export type Facing = 'user' | 'environment';

/** True when we're running inside an iframe, where camera permission is often blocked. */
export function inIframe() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function describeError(err: unknown): { message: string; hint: string } {
  const e = err as { name?: string; message?: string };
  const name = e?.name ?? '';
  const raw = e?.message ?? String(err);

  if (/permissions policy|disallowed by permissions policy/i.test(raw)) {
    return {
      message: 'Camera blocked by the page embedding this app.',
      hint: 'Embedded previews often deny camera access. Open this app in its own browser tab and try again — the button below does that.',
    };
  }
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return {
        message: 'Camera permission was denied.',
        hint: 'Allow camera access for this site in your browser, then press Retry. On macOS check System Settings → Privacy & Security → Camera.',
      };
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return {
        message: 'No camera was found.',
        hint: 'Connect a webcam (or use a phone) and press Retry.',
      };
    case 'NotReadableError':
    case 'TrackStartError':
      return {
        message: 'The camera is busy.',
        hint: 'Another app or tab is using it. Close that app, then press Retry.',
      };
    case 'OverconstrainedError':
      return {
        message: 'That camera does not support the requested settings.',
        hint: 'Try switching camera, or press Retry.',
      };
    default:
      return {
        message: 'Could not start the camera.',
        hint: raw || 'Check that a camera is connected and permitted, then press Retry.',
      };
  }
}

/**
 * Owns the webcam stream.
 *
 * The returned <video> element is the only consumer of the stream and is meant
 * to be kept off-screen — it exists purely so MediaPipe has pixels to analyse.
 * Nothing here writes video anywhere.
 */
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>({ status: 'idle' });
  const [facing, setFacing] = useState<Facing>('user');

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setState({ status: 'idle' });
  }, []);

  const start = useCallback(
    async (which: Facing = facing) => {
      setState({ status: 'requesting' });
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw Object.assign(new Error('getUserMedia unavailable (insecure context?)'), {
            name: 'NotAllowedError',
          });
        }
        streamRef.current?.getTracks().forEach((t) => t.stop());

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: which,
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30, max: 60 },
          },
        });
        streamRef.current = stream;

        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.muted = true;
          video.playsInline = true;
          await video.play().catch(() => undefined);
        }
        const label = stream.getVideoTracks()[0]?.label ?? 'camera';
        setState({ status: 'live', label });
        setFacing(which);
      } catch (err) {
        const { message, hint } = describeError(err);
        setState({ status: 'error', message, hint, canOpenTab: inIframe() });
      }
    },
    [facing],
  );

  const switchCamera = useCallback(() => {
    const next: Facing = facing === 'user' ? 'environment' : 'user';
    void start(next);
  }, [facing, start]);

  useEffect(() => stop, [stop]);

  return { videoRef, state, facing, start, stop, switchCamera };
}

/** Opens the current app in a new top-level tab, escaping an iframe's permission policy. */
export function openInNewTab() {
  window.open(window.location.href, '_blank', 'noopener');
}
