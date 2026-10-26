import { isAbortError } from '@/utils/abortError'

export type BlobSavePlan = 'share' | 'download' | 'needs-gesture' | 'blocked'

export type SaveBlobResult = 'shared' | 'downloaded' | 'cancelled' | 'needs-gesture' | 'blocked'

const MIME_BY_EXTENSION: Record<string, string> = {
  csv: 'text/csv',
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

/** A share sheet the user actually dismisses stays open longer than a webview rejecting the call. */
const SHARE_CANCEL_MIN_MS = 700

/** Decide how to hand a file to the user. Mobile wallet browsers ignore hidden blob downloads. */
export function planBlobSave(input: {
  mobile: boolean
  inAppWebView: boolean
  canShareFiles: boolean
  userGesture: boolean
}): BlobSavePlan {
  if (!input.mobile) return 'download'
  if (!input.userGesture) return 'needs-gesture'
  if (input.canShareFiles) return 'share'
  if (input.inAppWebView) return 'blocked'
  return 'download'
}

export function shareAbortWasCancel(error: unknown, elapsedMs: number): boolean {
  return isAbortError(error) && elapsedMs >= SHARE_CANCEL_MIN_MS
}

export function isIosUserAgent(ua: string, platform = '', maxTouchPoints = 0): boolean {
  if (/iPad|iPhone|iPod/.test(ua)) return true
  return platform === 'MacIntel' && maxTouchPoints > 1
}

export function isAndroidUserAgent(ua: string): boolean {
  return /Android/i.test(ua)
}

/** Real mobile Safari includes `Safari/`. Wallet webviews (Zerion and others) omit it. */
export function isInAppWebViewUserAgent(ua: string, platform = '', maxTouchPoints = 0): boolean {
  if (/Zerion|MetaMask|Trust\/|Rainbow|CoinbaseWallet|Phantom|OKX|imToken|TokenPocket/i.test(ua)) {
    return true
  }
  if (isIosUserAgent(ua, platform, maxTouchPoints) && /AppleWebKit/.test(ua) && !/Safari\//.test(ua)) {
    return true
  }
  if (isAndroidUserAgent(ua) && /\bwv\b/.test(ua)) return true
  return false
}

export function isMobileBrowser(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  return isIosUserAgent(ua, navigator.platform, navigator.maxTouchPoints) || isAndroidUserAgent(ua)
}

export function isInAppWebView(): boolean {
  if (typeof navigator === 'undefined') return false
  return isInAppWebViewUserAgent(navigator.userAgent || '', navigator.platform, navigator.maxTouchPoints)
}

function mimeForFilename(filename: string): string {
  const extension = filename.split('.').pop()?.toLowerCase() || ''
  return MIME_BY_EXTENSION[extension] || 'application/octet-stream'
}

function fileFromBlob(blob: Blob, filename: string): File {
  const type = blob.type?.split(';')[0]?.trim() || mimeForFilename(filename)
  return new File([blob], filename, { type: type || mimeForFilename(filename) })
}

function canShareFile(file: File): boolean {
  return typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })
}

function triggerAnchorDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

async function shareFiles(file: File, filename: string): Promise<'shared' | 'cancelled' | 'failed'> {
  const started = performance.now()
  try {
    await navigator.share({ files: [file], title: filename })
    return 'shared'
  } catch (error) {
    if (shareAbortWasCancel(error, performance.now() - started)) return 'cancelled'
    return 'failed'
  }
}

async function shareText(filename: string, text: string): Promise<'shared' | 'cancelled' | 'failed'> {
  const started = performance.now()
  try {
    await navigator.share({ title: filename, text })
    return 'shared'
  } catch (error) {
    if (shareAbortWasCancel(error, performance.now() - started)) return 'cancelled'
    return 'failed'
  }
}

/**
 * Save a fetched file.
 * Phones always need a second tap. Zerion drops the click that follows `await`, and a fast
 * `AbortError` from its webview means sharing is unavailable, not that the user dismissed a sheet.
 */
export async function saveBlobAsFile(
  blob: Blob,
  filename: string,
  options?: { fromUserGesture?: boolean; textOnly?: boolean; csvText?: string | null },
): Promise<SaveBlobResult> {
  const mobile = isMobileBrowser()
  const inAppWebView = isInAppWebView()
  if (mobile && !options?.fromUserGesture) return 'needs-gesture'

  if (options?.textOnly) {
    const text = options.csvText?.trim()
    if (!text || typeof navigator.share !== 'function') return 'blocked'
    const shared = await shareText(filename, text)
    if (shared === 'failed') return 'blocked'
    return shared
  }

  const file = fileFromBlob(blob, filename)
  if (canShareFile(file)) {
    const shared = await shareFiles(file, filename)
    if (shared === 'shared' || shared === 'cancelled') return shared
  }

  if (inAppWebView) return 'blocked'
  triggerAnchorDownload(file, filename)
  return 'downloaded'
}
