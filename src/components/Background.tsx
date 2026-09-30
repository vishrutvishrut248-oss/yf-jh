import { motion } from 'framer-motion'

export default function Background() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Orbiting rings */}
      <motion.div
        className="absolute left-1/2 top-1/2 orbit"
        style={{ width: 900, height: 900, x: '-50%', y: '-50%' }}
        animate={{ rotate: 360 }}
        transition={{ duration: 120, repeat: Infinity, ease: 'linear' }}
      />
      <motion.div
        className="absolute left-1/2 top-1/2 orbit"
        style={{ width: 1300, height: 1300, x: '-50%', y: '-50%' }}
        animate={{ rotate: -360 }}
        transition={{ duration: 200, repeat: Infinity, ease: 'linear' }}
      />
      <motion.div
        className="absolute left-1/2 top-1/2 orbit"
        style={{ width: 1800, height: 1800, x: '-50%', y: '-50%', borderColor: 'rgba(124,92,255,0.07)' }}
        animate={{ rotate: 360 }}
        transition={{ duration: 300, repeat: Infinity, ease: 'linear' }}
      />

      {/* Floating gradient orbs */}
      <motion.div
        className="absolute w-[520px] h-[520px] rounded-full"
        style={{
          top: '-10%', left: '-8%',
          background: 'radial-gradient(circle, rgba(124,92,255,0.35), transparent 60%)',
          filter: 'blur(40px)',
        }}
        animate={{ x: [0, 40, 0], y: [0, 30, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute w-[480px] h-[480px] rounded-full"
        style={{
          bottom: '-15%', right: '-6%',
          background: 'radial-gradient(circle, rgba(34,211,238,0.28), transparent 60%)',
          filter: 'blur(40px)',
        }}
        animate={{ x: [0, -50, 0], y: [0, -20, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute w-[360px] h-[360px] rounded-full"
        style={{
          top: '40%', right: '20%',
          background: 'radial-gradient(circle, rgba(255,92,138,0.22), transparent 60%)',
          filter: 'blur(40px)',
        }}
        animate={{ x: [0, 30, -20, 0], y: [0, -40, 20, 0] }}
        transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Grid */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
          maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
        }}
      />
    </div>
  )
}
