import { motion } from 'framer-motion'

export default function TopBar() {
  return (
    <motion.div
      initial={{ y: -30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1], delay: 0.2 }}
      className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-5"
    >
      <div className="flex items-center gap-3">
        <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-accent via-accent-glow to-accent-cyan flex items-center justify-center glow-violet">
          <svg viewBox="0 0 24 24" className="w-5 h-5 text-ink-950" fill="currentColor">
            <path d="M4 6h3l4 6-4 6H4l4-6-4-6zm9 0h3l4 6-4 6h-3l4-6-4-6z" />
          </svg>
        </div>
        <div className="flex flex-col leading-none">
          <span className="font-display font-semibold text-lg tracking-tight">arcin</span>
          <span className="text-[10px] uppercase tracking-[0.2em] text-white/40">cinematic workspace</span>
        </div>
      </div>

      <nav className="hidden md:flex items-center gap-1 glass rounded-full px-2 py-1.5 text-sm">
        {['Overview', 'Projects', 'Studio', 'Analytics', 'Team'].map((item, i) => (
          <button
            key={item}
            className={`interactive px-4 py-1.5 rounded-full transition-colors ${
              i === 0 ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white'
            }`}
          >
            {item}
          </button>
        ))}
      </nav>

      <div className="flex items-center gap-3">
        <button className="interactive relative w-9 h-9 rounded-full glass flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0a3 3 0 11-6 0" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-accent-hot animate-pulse-slow" />
        </button>
        <button className="interactive w-9 h-9 rounded-full bg-gradient-to-br from-accent-glow to-accent flex items-center justify-center text-sm font-semibold text-ink-950">
          A
        </button>
      </div>
    </motion.div>
  )
}
