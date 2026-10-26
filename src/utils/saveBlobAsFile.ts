import { isAbortError } from '@/utils/abortError'

export type BlobSavePlan = 'share' | 'download' | 'needs-gesture' | 'blocked'

export type SaveBlobResult = 'shared' | 'downloaded' | 'cancelled' | 'needs-gesture' | 'blocked'

const MIME_BY_EXTENSION: Record<string, string> = {
  csv: 'text/csv',
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

/** Decide how to hand a file to the user. Mobile wallet browsers ignore hidden blob downloads. */
export function planBlobSave(input: {
  mobile: boolean
  inAppWebView: boolean
  canShareFiles: boolean
  userGesture: boolean
}): BlobSavePlan {
  if (!input.mobile) return 'download'
  if (input.canShareFiles && input.userGesture) return 'share'
  if (!input.userGesture) return 'needs-gesture'
  if (input.inAppWebView) return 'blocked'
  return 'download'
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

function isMobileBrowser(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  return isIosUserAgent(ua, navigator.platform, navigator.maxTouchPoints) || isAndroidUserAgent(ua)
}

function isInAppWebView(): boolean {
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

function userGestureIsActive(): boolean {
  return Boolean(navigator.userActivation?.isActive)
}

function triggerAnchorDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/**
 * Save a fetched file.
 * Desktop uses a real link click. Phones use the system share sheet, which needs a fresh tap
 * after the export request finishes — wallet browsers drop the click that follows `await`.
 */
export async function saveBlobAsFile(
  blob: Blob,
  filename: string,
  options?: { fromUserGesture?: boolean },
): Promise<SaveBlobResult> {
  const file = fileFromBlob(blob, filename)
  const mobile = isMobileBrowser()
  const inAppWebView = isInAppWebView()
  const canShareFiles = canShareFile(file)
  const userGesture = Boolean(options?.fromUserGesture) || userGestureIsActive()
  let plan = planBlobSave({ mobile, inAppWebView, canShareFiles, userGesture })

  if (plan === 'share') {
    try {
      await navigator.share({ files: [file], title: filename })
      return 'shared'
    } catch (error) {
      if (isAbortError(error)) return 'cancelled'
      plan = planBlobSave({
        mobile,
        inAppWebView,
        canShareFiles: false,
        userGesture: Boolean(options?.fromUserGesture),
      })
    }
  }

  if (plan === 'needs-gesture') return 'needs-gesture'
  triggerAnchorDownload(file, filename)
  if (plan === 'blocked') return 'blocked'
  return 'downloaded'
}
