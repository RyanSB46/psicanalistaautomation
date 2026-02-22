import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { GlobalErrorBoundary } from './interfaces/components/global-error-boundary'
import { applyThemePreference, resolveInitialThemePreference } from './shared/theme/theme-preference'

const queryClient = new QueryClient()
applyThemePreference(resolveInitialThemePreference())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GlobalErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </GlobalErrorBoundary>
  </StrictMode>,
)
