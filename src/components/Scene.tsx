import { ReactNode, useMemo } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'

type Target = { x: number; y: number; z: number; rotX: number; rotY: number; zoom: number }

export const defaultTarget: Target = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, zoom: 1 }

interface SceneProps {
  target: Target
  children: ReactNode
  mouseTilt?: { nx: number; ny: number } | null
}

/**
 * A virtual camera rig. Children live in a 3D world; the camera dollys/orbits to a target.
 * Motion uses stiff damped springs for that premium, slightly-overdamped Apple feel.
 */
export default function Scene({ target, children, mouseTilt }: SceneProps) {
  const mX = useMotionValue(target.x)
  const mY = useMotionValue(target.y)
  const mZ = useMotionValue(target.z)
  const mRX = useMotionValue(target.rotX)
  const mRY = useMotionValue(target.rotY)
  const mZoom = useMotionValue(target.zoom)

  // Spring config tuned for "cinematic" dollying.
  const cfg = { stiffness: 80, damping: 22, mass: 0.8 }
  const sX = useSpring(mX, cfg)
  const sY = useSpring(mY, cfg)
  const sZ = useSpring(mZ, cfg)
  const sRX = useSpring(mRX, { ...cfg, stiffness: 70 })
  const sRY = useSpring(mRY, { ...cfg, stiffness: 70 })
  const sZoom = useSpring(mZoom, { stiffness: 100, damping: 24, mass: 0.7 })

  // Apply target values when they change.
  useMemo(() => {
    mX.set(target.x)
    mY.set(target.y)
    mZ.set(target.z)
    mRX.set(target.rotX)
    mRY.set(target.rotY)
    mZoom.set(target.zoom)
  }, [target, mX, mY, mZ, mRX, mRY, mZoom])

  // Subtle parallax from mouse tilt.
  const parX = useTransform(() => (mouseTilt?.ny ?? 0) * 2.5)
  const parY = useTransform(() => (mouseTilt?.nx ?? 0) * -2.5)

  const rotXFinal = useTransform(() => sRX.get() + parX.get())
  const rotYFinal = useTransform(() => sRY.get() + parY.get())

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{ perspective: '1800px', perspectiveOrigin: '50% 50%' }}
    >
      <motion.div
        className="absolute inset-0 preserve-3d"
        style={{
          x: sX,
          y: sY,
          z: sZ,
          rotateX: rotXFinal,
          rotateY: rotYFinal,
          scale: sZoom,
          transformStyle: 'preserve-3d',
          willChange: 'transform',
        }}
      >
        {children}
      </motion.div>
    </div>
  )
}
