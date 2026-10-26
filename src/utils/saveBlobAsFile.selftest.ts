/**
 * Mobile export save plan — run with:
 *   npx --yes tsx src/utils/saveBlobAsFile.selftest.ts
 */
import { isInAppWebViewUserAgent, planBlobSave } from './saveBlobAsFile'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

assert(planBlobSave({ mobile: false, inAppWebView: false, canShareFiles: true, userGesture: false }) === 'download', 'desktop downloads')
assert(planBlobSave({ mobile: true, inAppWebView: true, canShareFiles: true, userGesture: true }) === 'share', 'phone with a tap shares')
assert(planBlobSave({ mobile: true, inAppWebView: false, canShareFiles: true, userGesture: false }) === 'needs-gesture', 'phone after a fetch waits for a tap')
assert(planBlobSave({ mobile: true, inAppWebView: true, canShareFiles: false, userGesture: true }) === 'blocked', 'wallet webview without share is blocked')
assert(planBlobSave({ mobile: true, inAppWebView: false, canShareFiles: false, userGesture: true }) === 'download', 'mobile safari falls back to a link')

const zerion = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
const safari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
const chromeIos = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1'
const androidWebView = 'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.230 Mobile Safari/537.36'

assert(isInAppWebViewUserAgent(zerion), 'zerion webview')
assert(!isInAppWebViewUserAgent(safari), 'mobile safari')
assert(!isInAppWebViewUserAgent(chromeIos), 'chrome ios')
assert(isInAppWebViewUserAgent(androidWebView), 'android webview')

console.log('saveBlobAsFile.selftest: ok')
