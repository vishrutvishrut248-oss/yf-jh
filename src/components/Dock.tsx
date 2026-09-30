import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { useRef } from 'react'

interface DockItemProps {
  label: string
  color: string
  icon: JSX.Element
  onClick?: () => void
  mouseX: ReturnType<typeof useMotionValue<number>>
}

function DockItem({ label, color, icon, onClick, mouseX }: DockItemProps) {
  const ref = useRef<HTMLButtonElement>(null)

  const distance = useTransform(mouseX, (val) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 }
    return val - bounds.x - bounds.width / 2
  })

  const widthSync = useTransform(distance, [-120, 0, 120], [44, 64, 44])
  const heightSync = useTransform(distance, [-120, 0, 120], [44, 64, 44])
  const width = useSpring(widthSync, { mass: 0.3, stiffness: 250, damping: 20 })
  const height = useSpring(heightSync, { mass: 0.3, stiffness: 250, damping: 20 })

  return (
    <motion.button
      ref={ref}
      onClick={onClick}
      style={{ width, height }}
      whileTap={{ scale: 0.9, transition: { duration: 0.15 } }}
      className="interactive relative flex items-center justify-center rounded-2xl group"
    >
      <div className={`absolute inset-0 rounded-2xl ${color} shadow-lg`} />
      <div className="relative text-white w-7 h-7 flex items-center justify-center">{icon}</div>
      <span className="absolute -top-10 text-xs font-medium px-2 py-1 rounded-md glass opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
        {label}
      </span>
    </motion.button>
  )
}

interface DockProps {
  onHome?: () => void
  onCompose?: () => void
}

export default function Dock({ onHome, onCompose }: DockProps) {
  const mouseX = useMotionValue(Infinity)

  return (
    <motion.div
      initial={{ y: 60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1], delay: 0.6 }}
      className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50"
    >
      <div
        onMouseMove={(e) => mouseX.set(e.pageX)}
        onMouseLeave={() => mouseX.set(Infinity)}
        className="glass-strong rounded-3xl px-4 py-3 flex items-end gap-3"
      >
        <DockItem
          mouseX={mouseX}
          label="Home"
          color="bg-gradient-to-br from-accent to-accent-glow"
          onClick={onHome}
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
              <path d="M3 12l9-9 9 9M5 10v10h14V10" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
        />
        <DockItem
          mouseX={mouseX}
          label="Projects"
          color="bg-gradient-to-br from-accent-cyan to-accent"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
              <path d="M3 7h6l2 2h10v10H3z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
        />
        <DockItem
          mouseX={mouseX}
          label="Compose"
          color="bg-gradient-to-br from-accent-hot to-accent"
          onClick={onCompose}
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
          }
        />
        <DockItem
          mouseX={mouseX}
          label="Studio"
          color="bg-gradient-to-br from-accent-glow to-accent-hot"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
              <circle cx="12" cy="12" r="9" />
              <circle cx="12" cy="12" r="3" fill="currentColor" />
            </svg>
          }
        />
        <DockItem
          mouseX={mouseX}
          label="Settings"
          color="bg-gradient-to-br from-white/20 to-white/5 border border-white/10"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z" />
            </svg>
          }
        />
      </div>
    </motion.div>
  )
}
