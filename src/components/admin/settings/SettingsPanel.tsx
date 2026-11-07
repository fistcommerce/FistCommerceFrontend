import type { ReactNode } from 'react'

import { AdminStatusPill } from '@/components/admin/primitives'

export function shortAddress(value: string): string {
  const raw = value.trim()
  if (!raw || raw.length <= 14) return raw
  // EVM 0x… or Stellar C… / G… contract & account ids
  if (raw.startsWith('0x') || /^[CG][A-Z0-9]{55}$/i.test(raw)) {
    return `${raw.slice(0, 6)}…${raw.slice(-4)}`
  }
  return raw
}

type SettingsPanelProps = {
  title: string
  description?: string
  badge?: { label: string; variant: 'neutral' | 'pending' | 'rejected' | 'approved' }
  children: ReactNode
  actions?: ReactNode
}

export function SettingsPanel({ title, description, badge, children, actions }: SettingsPanelProps) {
  return (
    <section className="rounded-[10px] border border-[#E6E8EC] bg-white px-6 py-6 shadow-sm flex flex-col gap-6">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-[#0B1220] text-[18px] font-bold leading-tight">{title}</h2>
          {badge ? (
            <AdminStatusPill variant={badge.variant}>{badge.label}</AdminStatusPill>
          ) : null}
        </div>
        {description ? <p className="mt-2 text-[#6B7488] text-[14px]">{description}</p> : null}
      </div>
      {children}
      {actions ? <div className="pt-1 border-t border-[#EEF0F4]">{actions}</div> : null}
    </section>
  )
}

type SettingsFieldProps = {
  id: string
  label: string
  value: string
  onChange?: (value: string) => void
  placeholder?: string
  type?: string
  suffix?: string
  disabled?: boolean
  readOnly?: boolean
  hint?: string
  mono?: boolean
}

export function SettingsField({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  suffix,
  disabled,
  readOnly,
  hint,
  mono,
}: SettingsFieldProps) {
  const inputClass = [
    'h-[44px] w-full rounded-[8px] px-3 text-[15px] font-medium text-[#0B1220] outline-none placeholder:text-[#B0B7C4]',
    readOnly || disabled ? 'bg-[#F8F9FB] text-[#6B7488] cursor-default' : 'bg-[#F0F2F5] focus:ring-2 focus:ring-[#195EBC]/25',
    mono ? 'font-mono text-[14px]' : '',
    disabled ? 'opacity-60 cursor-not-allowed' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <label htmlFor={id} className="text-[13px] font-medium text-[#6B7488]">
          {label}
        </label>
      ) : null}
      {suffix ? (
        <div className="flex h-[44px] items-center rounded-[8px] bg-[#F0F2F5] px-3 gap-2">
          <input
            id={id}
            type={type}
            autoComplete="off"
            value={value}
            placeholder={placeholder}
            disabled={disabled || readOnly}
            readOnly={readOnly}
            onChange={onChange ? (e) => onChange(e.target.value) : undefined}
            className="min-w-0 flex-1 bg-transparent text-[15px] font-medium text-[#0B1220] outline-none placeholder:text-[#B0B7C4] disabled:cursor-not-allowed"
          />
          <span className="shrink-0 text-[15px] font-medium text-[#6B7488]" aria-hidden>
            {suffix}
          </span>
        </div>
      ) : (
        <input
          id={id}
          type={type}
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          disabled={disabled || readOnly}
          readOnly={readOnly}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          className={inputClass}
        />
      )}
      {hint ? <p className="text-[12px] text-[#9CA3AF]">{hint}</p> : null}
    </div>
  )
}

type SettingsSectionActionsProps = {
  onCancel: () => void
  onSave: () => void
  saveLabel?: string
  disabled?: boolean
  saving?: boolean
}

export function SettingsSectionActions({
  onCancel,
  onSave,
  saveLabel = 'Save Changes',
  disabled,
  saving,
}: SettingsSectionActionsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
      <button
        type="button"
        onClick={onCancel}
        disabled={disabled || saving}
        className="h-[48px] w-full rounded-[8px] bg-[#E8EFFB] text-[#195EBC] text-[15px] font-semibold transition-colors hover:bg-[#DCE8F8] disabled:opacity-60 disabled:cursor-not-allowed"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={disabled || saving}
        className="h-[48px] w-full rounded-[8px] bg-[#195EBC] text-white text-[15px] font-semibold transition-colors hover:bg-[#154a9e] disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {saving ? 'Saving…' : saveLabel}
      </button>
    </div>
  )
}

export function ReadOnlyBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-[#EEF0F4] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#6B7488]">
      Read only
    </span>
  )
}
