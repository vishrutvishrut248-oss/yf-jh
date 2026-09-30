# arcin

A cinematic 3D camera-tracked workspace where every interaction moves the camera with studio-quality motion.

## Stack
- Vite + React + TypeScript
- Tailwind CSS
- Framer Motion

## Develop
```bash
npm install
npm run dev        # dev server on http://localhost:5173
```

## Production preview
```bash
npm run build
npx vite preview   # serves production bundle on http://localhost:5173
```

## What it feels like
- Click any glass panel → the virtual camera dollies in, tilts to frame it, and a detail panel rises
- Move your mouse → the scene tilts with subtle parallax
- Hover the dock → icons magnify with spring physics (macOS-style)
- Every click has a ripple; every card has a slow light sweep; ambient orbs drift in the background
