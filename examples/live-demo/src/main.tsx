import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { RiffrecProvider } from 'riffrec'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RiffrecProvider forceEnable live={{}}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </RiffrecProvider>
  </StrictMode>,
)
