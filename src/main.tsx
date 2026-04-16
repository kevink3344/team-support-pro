import { Component, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/work-sans/400.css'
import '@fontsource/work-sans/500.css'
import '@fontsource/work-sans/600.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/600.css'
import './index.css'
import App from './App.tsx'

class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    console.error('Frontend render error:', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: '24px',
          fontFamily: 'Work Sans, sans-serif',
          background: '#0d1d2a',
          color: '#f3f8fb',
        }}>
          <div style={{ maxWidth: '720px', textAlign: 'center' }}>
            <h1 style={{ marginBottom: '12px', fontSize: '28px' }}>TeamSupportPro failed to load</h1>
            <p style={{ opacity: 0.9, lineHeight: 1.5 }}>
              A frontend runtime error occurred. Refresh the page. If it continues, clear site data for this domain and retry.
            </p>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
