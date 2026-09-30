export type CardId = 'hero' | 'projects' | 'studio' | 'analytics' | 'team' | 'compose'

export interface CardData {
  id: CardId
  title: string
  subtitle: string
  description: string
  accent: string
  glow: string
  position: { x: number; y: number }
  size: { w: number; h: number }
  depth: number
  rotate: { x: number; y: number }
  meta: { label: string; value: string }[]
  cta: string
}

// Positions are in pixels relative to viewport center.
export const CARDS: CardData[] = [
  {
    id: 'hero',
    title: 'Craft in motion.',
    subtitle: 'Welcome back, Alex',
    description:
      'Arcin is your cinematic workspace. Pick any surface — the camera dollys in, the world responds, and every detail animates with intention.',
    accent: 'from-accent via-accent-glow to-accent-cyan',
    glow: 'glow-violet',
    position: { x: -420, y: -180 },
    size: { w: 560, h: 360 },
    depth: -30,
    rotate: { x: 6, y: -8 },
    meta: [
      { label: 'Projects', value: '24 active' },
      { label: 'Rendering', value: '4 in queue' },
      { label: 'Today', value: '3 sessions' },
    ],
    cta: 'Start the tour',
  },
  {
    id: 'projects',
    title: 'Projects',
    subtitle: 'Recent work',
    description: 'A living shelf of timelines, scenes, and exports. Scroll through thumbnails that drift with parallax.',
    accent: 'from-accent-cyan to-accent',
    glow: 'glow-cyan',
    position: { x: 260, y: -220 },
    size: { w: 400, h: 300 },
    depth: -60,
    rotate: { x: -4, y: 10 },
    meta: [
      { label: 'Ember', value: '82% edited' },
      { label: 'Helios', value: 'Review' },
      { label: 'Noir', value: 'Draft' },
    ],
    cta: 'Open shelf',
  },
  {
    id: 'studio',
    title: 'Studio',
    subtitle: 'Live canvas',
    description: 'A node-based editor where ideas materialize. Connect clips, grade, and arrange with cinematic easing.',
    accent: 'from-accent-hot to-accent',
    glow: 'glow-pink',
    position: { x: -200, y: 220 },
    size: { w: 420, h: 300 },
    depth: -20,
    rotate: { x: -6, y: -6 },
    meta: [
      { label: 'Nodes', value: '128' },
      { label: 'Tracks', value: '12' },
      { label: 'FPS', value: '60' },
    ],
    cta: 'Enter studio',
  },
  {
    id: 'analytics',
    title: 'Analytics',
    subtitle: 'Audience pulse',
    description: 'Soft-glow metrics: retention, play-through, heat. The numbers breathe; the trends bloom.',
    accent: 'from-accent-glow to-accent-cyan',
    glow: 'glow-violet',
    position: { x: 380, y: 180 },
    size: { w: 380, h: 300 },
    depth: -80,
    rotate: { x: 5, y: 8 },
    meta: [
      { label: 'Views', value: '1.2M' },
      { label: 'Watch', value: '4m 12s' },
      { label: 'Growth', value: '+18%' },
    ],
    cta: 'Open report',
  },
]

export const COMPOSE_CARD: CardData = {
  id: 'compose',
  title: 'New Composition',
  subtitle: 'Quick start',
  description: 'Begin a fresh scene. Choose a template, a frame rate, and a mood — the camera pans into the studio.',
  accent: 'from-white/30 to-white/10',
  glow: 'glow-violet',
  position: { x: 0, y: 0 },
  size: { w: 640, h: 440 },
  depth: 0,
  rotate: { x: 0, y: 0 },
  meta: [
    { label: 'Templates', value: '12 ready' },
    { label: 'Presets', value: '24' },
  ],
  cta: 'Create',
}
