import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Dashboard        from './pages/Dashboard'
import BlindTestAdmin   from './games/blindtest/Admin'
import BlindTestOverlay from './games/blindtest/Overlay'
import BullsRaceAdmin   from './games/bulls-race/Admin'
import BullsRaceOverlay from './games/bulls-race/Overlay'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Dashboard principal */}
        <Route path="/"                        element={<Dashboard />} />

        {/* Blind Test */}
        <Route path="/blindtest"               element={<BlindTestAdmin />} />
        <Route path="/blindtest/overlay"       element={<BlindTestOverlay />} />

        {/* Bulls Race */}
        <Route path="/bulls-race"              element={<BullsRaceAdmin />} />
        <Route path="/bulls-race/overlay"      element={<BullsRaceOverlay />} />

        {/* Fallback */}
        <Route path="*"                        element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
