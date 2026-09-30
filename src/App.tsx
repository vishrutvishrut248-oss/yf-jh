import { useCallback, useMemo, useState } from 'react'
import Scene, { defaultTarget } from './components/Scene'
import Background from './components/Background'
import TopBar from './components/TopBar'
import SideRail from './components/SideRail'
import Dock from './components/Dock'
import Card from './components/Card'
import FocusPanel from './components/FocusPanel'
import StatusTicker from './components/StatusTicker'
import CommandHint from './components/CommandHint'
import Cursor from './components/Cursor'
import { CARDS, CardId, COMPOSE_CARD } from './data'
import { useMousePosition } from './hooks/useMousePosition'

type Target = typeof defaultTarget

/**
 * Compute a camera target that dollys/rotates the world so a card appears centered and larger.
 * We move the world opposite to the card's position (camera dollies "to" it), add a slight
 * tilt opposite to the card's rotation so it faces the viewer, and zoom in.
 */
function targetForCard(card: (typeof CARDS)[number]): Target {
  return {
    x: -card.position.x * 0.75,
    y: -card.position.y * 0.7 - 60,
    z: 120 - card.depth,
    rotX: -card.rotate.x * 0.3,
    rotY: -card.rotate.y * 0.4,
    zoom: 1.15,
  }
}

const ALL_CARDS = [...CARDS, COMPOSE_CARD]

export default function App() {
  const [activeId, setActiveId] = useState<CardId | null>(null)
  const [camera, setCamera] = useState<Target>(defaultTarget)
  const mouse = useMousePosition()

  const focusCard = useCallback((id: string) => {
    const card = ALL_CARDS.find((c) => c.id === id)
    if (!card) return
    setActiveId(card.id as CardId)
    setCamera(targetForCard(card))
  }, [])

  const resetCamera = useCallback(() => {
    setActiveId(null)
    setCamera(defaultTarget)
  }, [])

  const openCompose = useCallback(() => {
    focusCard('compose')
  }, [focusCard])

  // Subtle idle parallax only when not focused
  const mouseTilt = useMemo(
    () => (activeId ? null : { nx: mouse.nx, ny: mouse.ny }),
    [activeId, mouse.nx, mouse.ny],
  )

  return (
    <div className="relative w-screen h-screen grain cursor-none">
      <Cursor />
      <Background />

      <Scene target={camera} mouseTilt={mouseTilt}>
        {/* Ambient floating labels */}
        <div
          className="absolute left-1/2 top-1/2 pointer-events-none"
          style={{ transform: 'translate(-50%, -50%) translateZ(-200px)' }}
        >
          <div className="font-display text-[18rem] font-bold leading-none text-white/[0.025] tracking-tighter select-none">
            arcin
          </div>
        </div>

        {CARDS.map((c, i) => (
          <Card key={c.id} data={c} index={i} onFocus={focusCard} />
        ))}

        {/* Compose floating chip (centered, top) */}
        <button
          onClick={openCompose}
          className="interactive ripple absolute glass rounded-full px-5 py-2.5 text-sm font-medium flex items-center gap-2 hover:bg-white/10 transition"
          style={{
            left: 'calc(50% - 100px)',
            top: 'calc(50% - 260px)',
            transform: 'translateZ(50px)',
          }}
        >
          <span className="w-2 h-2 rounded-full bg-accent-hot animate-pulse" />
          New composition
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
        </button>
      </Scene>

      <TopBar />
      <SideRail />
      <StatusTicker />
      <CommandHint />
      <Dock onHome={resetCamera} onCompose={openCompose} />

      <FocusPanel activeId={activeId} onClose={resetCamera} />

      {/* Bottom branding line */}
      <div className="absolute top-1/2 -right-10 -translate-y-1/2 z-30 rotate-90 origin-center text-[10px] uppercase tracking-[0.4em] text-white/20 font-mono">
        arcin · cinematic workspace · v1.0
      </div>
    </div>
  )
}
