import { motion } from 'framer-motion'

export default function CommandHint() {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.8, delay: 1.0, ease: [0.2, 0.8, 0.2, 1] }}
      className="absolute bottom-8 right-8 z-40"
    >
      <div className="glass-strong rounded-full px-4 py-2 text-xs flex items-center gap-2 font-mono text-white/60">
        <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/90 text-[10px]">⌘</kbd>
        <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/90 text-[10px]">K</kbd>
        <span>Command</span>
        <span className="text-white/30">·</span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          Click any panel to focus
        </span>
      </div>
    </motion.div>
  )
}
