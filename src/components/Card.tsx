import { motion } from 'framer-motion'
import type { CardData } from '../data'

interface CardProps {
  data: CardData
  onFocus: (id: string) => void
  index: number
}

export default function Card({ data, onFocus, index }: CardProps) {
  const { position, size, depth, rotate, accent, glow, title, subtitle, description, meta, cta, id } = data

  return (
    <motion.button
      onClick={(e) => {
        // ripple
        const btn = e.currentTarget
        const rp = document.createElement('span')
        rp.className = 'rp'
        const rect = btn.getBoundingClientRect()
        const size = Math.max(rect.width, rect.height)
        rp.style.width = rp.style.height = `${size}px`
        rp.style.left = `${e.clientX - rect.left - size / 2}px`
        rp.style.top = `${e.clientY - rect.top - size / 2}px`
        btn.appendChild(rp)
        setTimeout(() => rp.remove(), 700)
        onFocus(id)
      }}
      initial={{ opacity: 0, y: 40, rotateX: 20, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, rotateX: rotate.x, rotateY: rotate.y, scale: 1 }}
      transition={{
        duration: 0.9,
        delay: 0.3 + index * 0.08,
        ease: [0.2, 0.8, 0.2, 1],
      }}
      whileHover={{
        y: position.y - 10,
        rotateX: rotate.x - 2,
        rotateY: rotate.y + 2,
        transition: { type: 'spring', stiffness: 200, damping: 20 },
      }}
      whileTap={{ scale: 0.98 }}
      className={`interactive ripple absolute glass-strong rounded-3xl text-left p-7 ${glow} cursor-pointer`}
      style={{
        left: `calc(50% + ${position.x}px - ${size.w / 2}px)`,
        top: `calc(50% + ${position.y}px - ${size.h / 2}px)`,
        width: size.w,
        height: size.h,
        transform: `translateZ(${depth}px)`,
        transformStyle: 'preserve-3d',
      } as React.CSSProperties}
    >
      {/* Gradient corner */}
      <div className={`absolute -top-px -left-px w-32 h-32 rounded-tl-3xl bg-gradient-to-br ${accent} opacity-30 blur-2xl`} />
      <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none">
        <div className={`absolute -top-20 -right-20 w-60 h-60 rounded-full bg-gradient-to-br ${accent} opacity-20 blur-3xl`} />
      </div>

      <div className="relative flex flex-col h-full">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.25em] text-white/40 mb-2 font-medium">{subtitle}</div>
            <h3 className="font-display text-3xl md:text-4xl font-semibold tracking-tight leading-tight">{title}</h3>
          </div>
          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${accent} flex items-center justify-center`}>
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-ink-950" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>

        <p className="mt-4 text-white/60 text-sm leading-relaxed max-w-md">{description}</p>

        <div className="mt-auto pt-6 flex items-end justify-between">
          <div className="grid grid-cols-3 gap-4">
            {meta.map((m) => (
              <div key={m.label}>
                <div className="text-[10px] uppercase tracking-widest text-white/35">{m.label}</div>
                <div className="text-sm font-semibold text-white/90">{m.value}</div>
              </div>
            ))}
          </div>
          <div className="group flex items-center gap-2 text-sm font-medium text-white/80 hover:text-white transition-colors">
            {cta}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 transition-transform group-hover:translate-x-1">
              <path d="M5 12h14M13 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </div>

      {/* Shine sweep */}
      <motion.div
        className="absolute inset-0 rounded-3xl pointer-events-none overflow-hidden"
        initial={false}
      >
        <motion.div
          className="absolute -inset-y-4 w-24 bg-gradient-to-r from-transparent via-white/10 to-transparent -skew-x-12"
          animate={{ x: ['-200%', '400%'] }}
          transition={{ duration: 4, repeat: Infinity, repeatDelay: 6, ease: 'easeInOut' }}
        />
      </motion.div>
    </motion.button>
  )
}
