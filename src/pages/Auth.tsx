import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { z } from 'zod'
import { toast } from 'sonner'
import Icon from '../components/Icon'

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
})

const signupSchema = z.object({
  email: z.string().email('Please enter a valid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  confirmPassword: z.string().min(1, 'Please confirm your password.'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match.',
  path: ['confirmPassword'],
})

export default function Auth() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLogin, setIsLogin] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [showForgot, setShowForgot] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')

  const calculateStrength = (pwd: string) => {
    if (!pwd) return { level: 0, label: '', color: 'bg-outline-variant', percent: 0 }
    let strength = 0
    if (pwd.length >= 8) strength++
    if (pwd.length >= 12) strength++
    if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) strength++
    if (/\d/.test(pwd)) strength++
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd)) strength++
    if (strength <= 2) return { level: 1, label: 'Weak', color: 'bg-error', percent: 33 }
    if (strength <= 3) return { level: 2, label: 'Moderate', color: 'bg-tertiary', percent: 66 }
    return { level: 3, label: 'Strong', color: 'bg-secondary', percent: 100 }
  }

  const strength = calculateStrength(password)
  const passwordsMatch = password === confirmPassword || isLogin
  const canSubmit = email && password && (isLogin ? true : strength.level === 3 && passwordsMatch)

  const handleSubmit = async () => {
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      if (isLogin) {
        const result = loginSchema.safeParse({ email, password })
        if (!result.success) {
          setError(result.error.issues[0].message)
          toast.error(result.error.issues[0].message)
          setLoading(false)
          return
        }
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) {
          setError(error.message)
          toast.error(error.message)
        } else {
          toast.success('Signed in successfully!')
        }
      } else {
        const result = signupSchema.safeParse({ email, password, confirmPassword })
        if (!result.success) {
          setError(result.error.issues[0].message)
          toast.error(result.error.issues[0].message)
          setLoading(false)
          return
        }
        if (strength.level !== 3) {
          const msg = 'Password must be Strong.'
          setError(msg)
          toast.error(msg)
          setLoading(false)
          return
        }
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        })
        if (error) {
          setError(error.message)
          toast.error(error.message)
        } else {
          const msg = 'Account created! Check your email to verify.'
          setSuccess(msg)
          toast.success(msg)
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred.'
      setError(msg)
      toast.error(msg)
    }
    setLoading(false)
  }

  const toggleMode = () => {
    setIsLogin(!isLogin)
    setEmail('')
    setPassword('')
    setConfirmPassword('')
    setError('')
    setSuccess('')
    setShowPassword(false)
    setShowConfirmPassword(false)
    setShowForgot(false)
    setForgotEmail('')
  }

  const handleForgotPassword = async () => {
    if (!forgotEmail) {
      toast.error('Please enter your email')
      return
    }
    setLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      })
      if (error) throw error
      toast.success('Password reset link sent! Check your email.')
      setShowForgot(false)
      setForgotEmail('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send reset link')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-surface">
      <div className="w-full max-w-md fade-up">
        {/* Logo */}
        <div className="mb-10 text-center">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <Icon name="school" className="text-on-primary text-xl" />
            </div>
            <span className="font-headline-md text-headline-md font-extrabold text-primary">StudyAI</span>
          </div>
          <p className="text-on-surface-variant text-sm font-body-md">Your intelligent study companion</p>
        </div>

        {/* Card */}
        <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-8 shadow-sm">
          {showForgot ? (
            <>
              <h2 className="font-headline-md text-headline-md font-bold mb-6 text-on-background">Reset Password</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-on-surface-variant mb-1 block font-label-md">Email</label>
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={e => setForgotEmail(e.target.value)}
                    placeholder="you@example.com"
                    disabled={loading}
                    onKeyDown={e => e.key === 'Enter' && handleForgotPassword()}
                    className="w-full bg-surface-container border border-outline-variant rounded-xl px-4 py-3 text-sm text-on-surface placeholder-on-surface-variant focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all disabled:opacity-50"
                  />
                </div>
                <button
                  onClick={handleForgotPassword}
                  disabled={loading || !forgotEmail}
                  className="w-full bg-primary text-on-primary font-bold py-3 rounded-xl hover:opacity-90 transition-all duration-150 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {loading ? 'Please wait...' : 'Send Reset Link'}
                </button>
                <p className="text-center text-on-surface-variant text-sm mt-4">
                  <button onClick={() => setShowForgot(false)} className="text-primary hover:underline font-semibold">
                    Back to sign in
                  </button>
                </p>
              </div>
            </>
          ) : (
            <>
              <h2 className="font-headline-md text-headline-md font-bold mb-6 text-on-background">
                {isLogin ? 'Welcome back' : 'Create account'}
              </h2>

              <div className="space-y-4">
            {/* Email */}
            <div>
              <label className="text-xs text-on-surface-variant mb-1 block font-label-md">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={loading}
                className="w-full bg-surface-container border border-outline-variant rounded-xl px-4 py-3 text-sm text-on-surface placeholder-on-surface-variant focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all disabled:opacity-50"
              />
            </div>

            {/* Password */}
            <div>
              <label className="text-xs text-on-surface-variant mb-1 block font-label-md">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={loading}
                  onKeyDown={e => e.key === 'Enter' && canSubmit && handleSubmit()}
                  className="w-full bg-surface-container border border-outline-variant rounded-xl px-4 py-3 pr-10 text-sm text-on-surface placeholder-on-surface-variant focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={loading}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface transition-colors disabled:opacity-50"
                >
                  <Icon name={showPassword ? 'visibility_off' : 'visibility'} className="text-lg" />
                </button>
              </div>

              {!isLogin && password && (
                <div className="mt-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-on-surface-variant">Strength:</span>
                    <span className={`text-xs font-semibold ${strength.level === 1 ? 'text-error' : strength.level === 2 ? 'text-tertiary' : 'text-secondary'}`}>
                      {strength.label}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-outline-variant rounded-full overflow-hidden">
                    <div className={`h-full ${strength.color} transition-all duration-300`} style={{ width: `${strength.percent}%` }} />
                  </div>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            {!isLogin && (
              <div>
                <label className="text-xs text-on-surface-variant mb-1 block font-label-md">Confirm Password</label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    disabled={loading}
                    onKeyDown={e => e.key === 'Enter' && canSubmit && handleSubmit()}
                    className="w-full bg-surface-container border border-outline-variant rounded-xl px-4 py-3 pr-10 text-sm text-on-surface placeholder-on-surface-variant focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    disabled={loading}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface transition-colors disabled:opacity-50"
                  >
                    <Icon name={showConfirmPassword ? 'visibility_off' : 'visibility'} className="text-lg" />
                  </button>
                </div>
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-xs text-error mt-1">Passwords do not match</p>
                )}
              </div>
            )}

            {error && <p className="text-error text-xs bg-error-container rounded-lg px-3 py-2">{error}</p>}
            {success && <p className="text-secondary text-xs bg-secondary-container rounded-lg px-3 py-2">{success}</p>}

            <button
              onClick={handleSubmit}
              disabled={loading || !canSubmit}
              className="w-full bg-primary text-on-primary font-bold py-3 rounded-xl hover:opacity-90 transition-all duration-150 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-sm"
            >
              {loading ? (
                <span className="animate-pulse">Please wait...</span>
              ) : (
                <>
                  <span>{isLogin ? 'Sign In' : 'Create Account'}</span>
                </>
              )}
            </button>
          </div>

          {isLogin && (
            <p className="text-center text-on-surface-variant text-sm mt-4">
              <button
                onClick={() => setShowForgot(true)}
                disabled={loading}
                className="text-primary hover:underline disabled:opacity-50 font-semibold"
              >
                Forgot password?
              </button>
            </p>
          )}
          <p className="text-center text-on-surface-variant text-sm mt-4">
            {isLogin ? "Don't have an account? " : 'Already have an account? '}
            <button
              onClick={toggleMode}
              disabled={loading}
              className="text-primary hover:underline disabled:opacity-50 font-semibold"
            >
              {isLogin ? 'Sign up' : 'Sign in'}
            </button>
          </p>
          </>
        )}
        </div>
      </div>
    </div>
  )
}