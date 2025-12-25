import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from "react-error-boundary";
import "@github/spark/spark"
import { Toaster } from 'sonner'

import App from './App.tsx'
import { ErrorFallback } from './ErrorFallback.tsx'

import "./main.css"

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary FallbackComponent={ErrorFallback}>
    <App />
    <Toaster position="top-right" />
   </ErrorBoundary>
)
