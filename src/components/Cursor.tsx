import { useEffect, useRef } from 'react'
import { motion, useMotionValue, useSpring } from 'framer-motion'

export default function Cursor() {
  const dotX = useMotionValue(-100)
  const dotY = useMotionValue(-100)
  const ringX = useMotionValue(-100)
  const ringY = useMotionValue(-100)

  const rx = useSpring(ringX, { stiffness: 220, damping: 28, mass: 0.6 })
  const ry = useSpring(ringY, { stiffness: 220, damping: 28, mass: 0.6 })

  const ringRef = useRef<HTMLDivElement>(null)
  const dotRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const move = (e: MouseEvent) => {
      dotX.set(e.clientX)
      dotY.set(e.clientY)
      ringX.set(e.clientX)
      ringY.set(e.clientY)
    }
    const over = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      const interactive = t.closest('button, a, [data-cursor="hover"], .interactive')
      if (interactive && ringRef.current) {
        ringRef.current.style.width = '64px'
        ringRef.current.style.height = '64px'
        ringRef.current.style.borderColor = 'rgba(167,139,250,0.9)'
        ringRef.current.style.background = 'rgba(124,92,255,0.12)'
      } else if (ringRef.current) {
        ringRef.current.style.width = '40px'
        ringRef.current.style.height = '40px'
        ringRef.current.style.borderColor = 'rgba(255,255,255,0.5)'
        ringRef.current.style.background = 'transparent'
      }
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseover', over)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseover', over)
    }
  }, [dotX, dotY, ringX, ringY])

  return (
    <>
      <motion.div
        ref={ringRef}
        className="cursor-ring"
        style={{ x: rx, y: ry }}
      />
      <motion.div
        ref={dotRef}
        className="cursor-dot"
        style={{ x: dotX, y: dotY }}
      />
    </>
  )
}
