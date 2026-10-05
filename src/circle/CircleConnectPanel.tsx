import React from 'react'

import { isCircleAuthMethodConfigured } from '@/circle/enabled'
import { readCirclePinUserId } from '@/circle/storage'
import type { CircleAuthMethod } from '@/circle/types'

type CircleConnectPanelProps = {
  busy: boolean
  connectingMethod: CircleAuthMethod | null
  onConnect: (method: CircleAuthMethod, options?: { email?: string; pinUserId?: string }) => void
}

type SocialMethod = Extract<CircleAuthMethod, 'google' | 'apple' | 'facebook'>

const SOCIAL: { method: SocialMethod; label: string; mark: string }[] = [
  { method: 'google', label: 'Google', mark: 'G' },
  { method: 'apple', label: 'Apple', mark: '' },
  { method: 'facebook', label: 'Facebook', mark: 'f' },
]

function MethodMark({ method, mark }: { method: SocialMethod; mark: string }) {
  if (method === 'apple') {
    return (
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#111827] text-white" aria-hidden>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M16.365 1.43c0 1.14-.42 2.2-1.2 3.02-.9.96-2.02 1.55-3.16 1.45-.1-1.1.42-2.26 1.2-3.08.9-.96 2.14-1.58 3.16-1.39zM20.9 17.3c-.52 1.16-.77 1.68-1.44 2.7-.94 1.4-2.26 3.14-3.9 3.16-1.46.02-1.84-.96-3.82-.95-1.98.01-2.4.97-3.86.95-1.64-.02-2.9-1.6-3.84-3-1.92-2.86-3.36-8.08-1.4-10.96.98-1.44 2.54-2.36 4.06-2.36 1.52 0 2.48.98 3.74.98 1.22 0 1.96-1 3.84-.98 1.34.02 2.76.76 3.74 2.06-3.3 1.82-2.76 6.56.88 7.4z" />
        </svg>
      </span>
    )
  }
  if (method === 'google') {
    return (
      <span
        className="flex h-9 w-9 items-center justify-center rounded-full border border-[#E5E7EB] bg-white text-[15px] font-bold text-[#4285F4]"
        aria-hidden
      >
        {mark}
      </span>
    )
  }
  return (
    <span
      className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1877F2] text-[16px] font-bold text-white"
      aria-hidden
    >
      {mark}
    </span>
  )
}

export default function CircleConnectPanel({
  busy,
  connectingMethod,
  onConnect,
}: CircleConnectPanelProps) {
  const socialMethods = SOCIAL.filter((m) => isCircleAuthMethodConfigured(m.method))
  const emailEnabled = isCircleAuthMethodConfigured('email')
  const pinEnabled = isCircleAuthMethodConfigured('pin')

  const [view, setView] = React.useState<'methods' | 'email' | 'pin'>('methods')
  const [email, setEmail] = React.useState('')
  const [pinUserId, setPinUserId] = React.useState(() => readCirclePinUserId() || '')

  if (!socialMethods.length && !emailEnabled && !pinEnabled) return null

  if (view === 'email') {
    return (
      <div className="rounded-md border border-[#EAEAEA] bg-white px-4 py-4">
        <button
          type="button"
          onClick={() => setView('methods')}
          disabled={busy}
          className="mb-3 text-[13px] font-medium text-[#6B7488] hover:text-[#374151] disabled:opacity-60"
        >
          ← Back to Circle options
        </button>
        <h4 className="text-[15px] font-bold text-black">Sign in with email</h4>
        <p className="mt-1 text-[13px] text-[#6B7488]">
          We’ll send a one-time code to verify your email, then open Circle’s wallet PIN if needed.
        </p>
        <label className="mt-4 block text-[13px] font-medium text-[#374151]" htmlFor="circle-email">
          Email address
        </label>
        <input
          id="circle-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="mt-1.5 w-full rounded-md border border-[#EAEAEA] px-3 py-2.5 text-[14px] outline-none focus:border-[#195EBC]"
          disabled={busy}
        />
        <button
          type="button"
          onClick={() => onConnect('email', { email })}
          disabled={busy || !email.trim().includes('@')}
          className="mt-3 w-full rounded-md bg-[#195EBC] px-4 py-2.5 text-[14px] font-semibold text-white disabled:opacity-60"
        >
          {connectingMethod === 'email' ? 'Sending code…' : 'Continue with email'}
        </button>
      </div>
    )
  }

  if (view === 'pin') {
    return (
      <div className="rounded-md border border-[#EAEAEA] bg-white px-4 py-4">
        <button
          type="button"
          onClick={() => setView('methods')}
          disabled={busy}
          className="mb-3 text-[13px] font-medium text-[#6B7488] hover:text-[#374151] disabled:opacity-60"
        >
          ← Back to Circle options
        </button>
        <h4 className="text-[15px] font-bold text-black">Sign in with PIN user ID</h4>
        <p className="mt-1 text-[13px] text-[#6B7488]">
          Use the same ID every time to recover this Circle wallet after clearing browser data.
        </p>
        <label className="mt-4 block text-[13px] font-medium text-[#374151]" htmlFor="circle-pin-user">
          User ID
        </label>
        <input
          id="circle-pin-user"
          type="text"
          autoComplete="username"
          value={pinUserId}
          onChange={(e) => setPinUserId(e.target.value)}
          placeholder="e.g. alice-wallet"
          minLength={5}
          className="mt-1.5 w-full rounded-md border border-[#EAEAEA] px-3 py-2.5 text-[14px] outline-none focus:border-[#195EBC]"
          disabled={busy}
        />
        <p className="mt-1.5 text-[12px] text-[#9CA3AF]">5–50 characters. You’ll set a PIN on the next screen.</p>
        <button
          type="button"
          onClick={() => onConnect('pin', { pinUserId })}
          disabled={busy || pinUserId.trim().length < 5}
          className="mt-3 w-full rounded-md bg-[#195EBC] px-4 py-2.5 text-[14px] font-semibold text-white disabled:opacity-60"
        >
          {connectingMethod === 'pin' ? 'Opening…' : 'Continue with PIN'}
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-md border border-[#EAEAEA] bg-white px-4 py-4">
      <div className="mb-3">
        <h4 className="text-[15px] font-bold text-black">Circle Wallet</h4>
        <p className="mt-1 text-[13px] text-[#6B7488]">
          Choose how to sign in. Pick one method and stick with it — Google, email, and PIN each create a
          different wallet.
        </p>
      </div>

      {socialMethods.length > 0 ? (
        <div
          className={
            socialMethods.length === 1
              ? 'grid grid-cols-1 gap-2'
              : socialMethods.length === 2
                ? 'grid grid-cols-2 gap-2'
                : 'grid grid-cols-3 gap-2'
          }
        >
          {socialMethods.map(({ method, label, mark }) => (
            <button
              key={method}
              type="button"
              onClick={() => onConnect(method)}
              disabled={busy}
              className="flex flex-col items-center gap-2 rounded-md border border-[#EAEAEA] bg-[#FAFBFC] px-2 py-3 hover:border-[#195EBC]/40 hover:bg-white disabled:opacity-60"
            >
              <MethodMark method={method} mark={mark} />
              <span className="text-[13px] font-semibold text-[#111827]">
                {connectingMethod === method ? 'Opening…' : label}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {(emailEnabled || pinEnabled) && socialMethods.length > 0 ? (
        <div className="my-3 flex items-center gap-3">
          <div className="h-px flex-1 bg-[#EAEAEA]" />
          <span className="text-[12px] uppercase tracking-wide text-[#9CA3AF]">or</span>
          <div className="h-px flex-1 bg-[#EAEAEA]" />
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        {emailEnabled ? (
          <button
            type="button"
            onClick={() => setView('email')}
            disabled={busy}
            className="flex items-center justify-between rounded-md border border-[#EAEAEA] px-3 py-2.5 text-left hover:bg-[#F9FAFB] disabled:opacity-60"
          >
            <span className="text-[14px] font-semibold text-black">Continue with email</span>
            <span className="text-[13px] text-[#6B7488]">OTP →</span>
          </button>
        ) : null}
        {pinEnabled ? (
          <button
            type="button"
            onClick={() => setView('pin')}
            disabled={busy}
            className="flex items-center justify-between rounded-md border border-[#EAEAEA] px-3 py-2.5 text-left hover:bg-[#F9FAFB] disabled:opacity-60"
          >
            <span className="text-[14px] font-semibold text-black">Continue with PIN user ID</span>
            <span className="text-[13px] text-[#6B7488]">PIN →</span>
          </button>
        ) : null}
      </div>
    </div>
  )
}
