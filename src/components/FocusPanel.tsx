import { motion, AnimatePresence } from 'framer-motion'
import { CARDS, CardData, COMPOSE_CARD } from '../data'

interface FocusPanelProps {
  activeId: string | null
  onClose: () => void
}

/**
 * The detail panel that slides / scales in over the scene when a card is focused.
 * Because the camera dollies in first, this feels like we've entered that surface.
 */
export default function FocusPanel({ activeId, onClose }: FocusPanelProps) {
  const all = [...CARDS, COMPOSE_CARD]
  const card: CardData | undefined = all.find((c) => c.id === activeId)

  return (
    <AnimatePresence>
      {card && (
        <motion.div
          className="absolute inset-0 z-40 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-ink-950/40 backdrop-blur-md"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          <motion.div
            key={card.id}
            layoutId={`card-${card.id}`}
            initial={{ opacity: 0, scale: 0.9, y: 30, rotateX: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0, rotateX: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10, transition: { duration: 0.3 } }}
            transition={{ type: 'spring', stiffness: 160, damping: 22, mass: 0.7 }}
            className={`relative glass-strong rounded-3xl p-10 w-[min(920px,92vw)] max-h-[80vh] overflow-auto thin-scroll ${card.glow}`}
          >
            <div className={`absolute -top-px -left-px w-56 h-56 rounded-tl-3xl bg-gradient-to-br ${card.accent} opacity-30 blur-3xl`} />

            <div className="flex items-start justify-between relative">
              <div>
                <div className="text-[11px] uppercase tracking-[0.3em] text-white/40 font-medium">
                  {card.subtitle}
                </div>
                <h2 className="font-display text-5xl md:text-6xl font-semibold tracking-tight mt-2 shimmer">
                  {card.title}
                </h2>
              </div>
              <button
                onClick={onClose}
                className="interactive w-10 h-10 rounded-full glass flex items-center justify-center hover:bg-white/10 transition"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6l-12 12" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <p className="mt-5 text-white/70 text-lg leading-relaxed max-w-2xl relative">
              {card.description}
            </p>

            <div className="mt-8 grid md:grid-cols-3 gap-4 relative">
              {card.meta.map((m) => (
                <motion.div
                  key={m.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 }}
                  className="glass rounded-2xl p-5"
                >
                  <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">{m.label}</div>
                  <div className="text-2xl font-semibold font-display mt-1">{m.value}</div>
                </motion.div>
              ))}
            </div>

            <div className="mt-8 relative">
              <div className="text-[11px] uppercase tracking-[0.25em] text-white/40 mb-3">Preview</div>
              <div className="relative h-48 rounded-2xl overflow-hidden glass">
                <div className={`absolute inset-0 bg-gradient-to-br ${card.accent} opacity-40`} />
                <svg viewBox="0 0 800 200" className="absolute inset-0 w-full h-full">
                  <defs>
                    <linearGradient id={`ln-${card.id}`} x1="0" x2="1" y1="0" y2="0">
                      <stop offset="0%" stopColor="rgba(255,255,255,0)" />
                      <stop offset="50%" stopColor="rgba(255,255,255,0.6)" />
                      <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                    </linearGradient>
                  </defs>
                  <motion.path
                    d="M0,140 C120,80 240,180 360,120 C480,60 600,160 800,80"
                    fill="none"
                    stroke={`url(#ln-${card.id})`}
                    strokeWidth="2"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: 1.2, ease: 'easeInOut', delay: 0.3 }}
                  />
                  <motion.path
                    d="M0,140 C120,80 240,180 360,120 C480,60 600,160 800,80 L800,200 L0,200 Z"
                    fill={`url(#ln-${card.id})`}
                    opacity="0.08"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.12 }}
                    transition={{ duration: 1, delay: 0.8 }}
                  />
                </svg>
                <motion.div
                  className="absolute w-2 h-2 rounded-full bg-white"
                  initial={{ cx: 0 }}
                  animate={{ cx: 800 }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                  style={{ top: 78, left: 0, filter: 'drop-shadow(0 0 8px rgba(255,255,255,0.9))' }}
                />
              </div>
            </div>

            <div className="mt-8 flex items-center gap-3 relative">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className={`interactive ripple px-6 py-3 rounded-full bg-gradient-to-r ${card.accent} text-ink-950 font-semibold text-sm shadow-lg flex items-center gap-2`}
              >
                {card.cta}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-4 h-4">
                  <path d="M5 12h14M13 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </motion.button>
              <button
                onClick={onClose}
                className="interactive px-6 py-3 rounded-full glass text-sm font-medium hover:bg-white/10 transition"
              >
                Back to space
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
