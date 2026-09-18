import { useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Footer } from './components/Footer'
import { Header } from './components/Header'
import { Sidebar } from './components/Sidebar'
import { ActivityPage } from './pages/ActivityPage'
import { DashboardPage } from './pages/DashboardPage'
import { SettingsPage } from './pages/SettingsPage'

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <div className={`app ${sidebarOpen ? 'app--sidebar-open' : 'app--sidebar-closed'}`}>
      <Header onToggleSidebar={() => setSidebarOpen((open) => !open)} sidebarOpen={sidebarOpen} />
      <div className="app__body">
        <Sidebar open={sidebarOpen} />
        <main className="app__main" id="main">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/activity" element={<ActivityPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
      <Footer />
    </div>
  )
}
