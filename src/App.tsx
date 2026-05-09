import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Auth from './pages/Auth'
import Chat from './pages/Chat'
import AuthCallback from './pages/AuthCallback'
import NotFound from './pages/NotFound'
import ErrorBoundary from './components/ErrorBoundary'
import type { Session } from '@supabase/supabase-js'

function AppRoutes() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-surface">
      <div className="flex flex-col items-center gap-sm animate-pulse">
        <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
          <span className="text-on-primary font-bold text-xl">S</span>
        </div>
        <span className="text-primary font-headline-md text-headline-md font-bold">Loading...</span>
      </div>
    </div>
  )

  return (
    <Routes>
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/auth" element={session ? <Navigate to="/" replace /> : <Auth />} />
      <Route path="/" element={session ? <Chat session={session} /> : <Navigate to="/auth" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <AppRoutes />
      </ErrorBoundary>
    </BrowserRouter>
  )
}