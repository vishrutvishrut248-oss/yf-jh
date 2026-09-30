import { useEffect, useState } from 'react'

export function useMousePosition() {
  const [pos, setPos] = useState({ x: 0, y: 0, nx: 0, ny: 0 })
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      setPos({
        x: e.clientX,
        y: e.clientY,
        nx: (e.clientX / window.innerWidth) * 2 - 1,
        ny: (e.clientY / window.innerHeight) * 2 - 1,
      })
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])
  return pos
}
