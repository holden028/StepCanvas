import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

function renderFatal(message: string): void {
  const root = document.getElementById('root')
  if (!root) return
  root.innerHTML = `
    <div style="padding:24px;font-family:Inter,Arial,sans-serif;color:#111">
      <h2 style="margin:0 0 12px">StepCanvas failed to load</h2>
      <p style="margin:0 0 8px">A renderer startup error occurred.</p>
      <pre style="white-space:pre-wrap;background:#f5f5f5;padding:12px;border-radius:8px">${message}</pre>
    </div>
  `
}

window.addEventListener('error', (event) => {
  console.error('Renderer error:', event.error || event.message)
})

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason)
})

async function bootstrap(): Promise<void> {
  const rootElement = document.getElementById('root')
  if (!rootElement) return
  try {
    const { default: App } = await import('./App.tsx')
    createRoot(rootElement).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error)
    renderFatal(message)
    console.error('Renderer bootstrap failed:', error)
  }
}

void bootstrap()
