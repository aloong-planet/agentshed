import React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { App } from './App'
import { createQueryClient } from './query-client'
import './theme.css'

// One client for the app's lifetime (ADR-0028): its cache is what makes a revisit instant.
const queryClient = createQueryClient()

const el = document.getElementById('root')
if (el) {
  createRoot(el).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </React.StrictMode>
  )
}
