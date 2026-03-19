import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Admin   from './pages/Admin'
import Overlay from './pages/Overlay'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"        element={<Admin />} />
        <Route path="/admin"   element={<Admin />} />
        <Route path="/overlay" element={<Overlay />} />
        <Route path="*"        element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
