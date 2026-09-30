import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'

export default function StatusTicker() {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const items = [
    { label: 'Render', value: '60 fps' },
    { label: 'GPU', value: '42%' },
    { label: 'Net', value: '128 ms' },
    { label: 'Scene', value: '1.2M tris' },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
      className="absolute bottom-8 left-8 z-40 font-mono text-xs text-white/50 flex flex-col gap-1"
    >
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span>System online · {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
      </div>
      <div className="flex items-center gap-4">
        {items.map((it) => (
          <div key={it.label} className="flex items-center gap-1.5">
            <span className="text-white/30">{it.label}</span>
            <span className="text-white/80">{it.value}</span>
          </div>
        ))}
      </div>
    </motion.div>
  )
}
