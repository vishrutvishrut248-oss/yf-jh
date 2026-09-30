import { motion } from 'framer-motion'

export default function SideRail() {
  return (
    <motion.div
      initial={{ x: -30, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1], delay: 0.4 }}
      className="absolute left-6 top-1/2 -translate-y-1/2 z-40 flex flex-col items-center gap-4"
    >
      <div className="glass-strong rounded-full py-4 px-2 flex flex-col items-center gap-3">
        {[
          { c: 'bg-accent', active: true },
          { c: 'bg-accent-cyan' },
          { c: 'bg-accent-hot' },
          { c: 'bg-white/30' },
          { c: 'bg-white/20' },
        ].map((d, i) => (
          <button
            key={i}
            className={`interactive w-2.5 h-2.5 rounded-full ${d.c} transition-transform hover:scale-150 ${
              d.active ? 'ring-2 ring-white/50 scale-125' : ''
            }`}
          />
        ))}
      </div>
      <div className="flex flex-col items-center gap-3 pt-4 text-[10px] uppercase tracking-[0.2em] text-white/40 font-mono">
        <div className="flex flex-col items-center gap-1">
          <span>Z</span>
          <span className="text-white/20">|</span>
          <span>24</span>
        </div>
      </div>
    </motion.div>
  )
}
