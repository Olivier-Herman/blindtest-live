import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard'

const BlindTestAdmin   = lazy(() => import('./games/blindtest/Admin'))
const BlindTestOverlay = lazy(() => import('./games/blindtest/Overlay'))
const BullsRaceAdmin   = lazy(() => import('./games/bulls-race/Admin'))
const BullsRaceOverlay = lazy(() => import('./games/bulls-race/Overlay'))

const Loader = () => (
  <div style={{ background: '#07070f', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,.2)', fontFamily: 'monospace', letterSpacing: '0.3em' }}>
    CHARGEMENT...
  </div>
)

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Loader />}>
        <Routes>
          <Route path="/"                   element={<Dashboard />} />
          <Route path="/blindtest"          element={<BlindTestAdmin />} />
          <Route path="/blindtest/overlay"  element={<BlindTestOverlay />} />
          <Route path="/bulls-race"         element={<BullsRaceAdmin />} />
          <Route path="/bulls-race/overlay" element={<BullsRaceOverlay />} />
          <Route path="*"                   element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
