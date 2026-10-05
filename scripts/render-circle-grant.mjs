import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const backend = join(root, '..', 'FistCommerceBackend')
const outDir = join(root, 'docs', 'circle-grant')
mkdirSync(outDir, { recursive: true })

function readFe(rel) {
  return readFileSync(join(root, rel), 'utf8')
}

function readBe(rel) {
  return readFileSync(join(backend, rel), 'utf8')
}

function sliceLines(src, start, end) {
  const lines = src.replace(/\n$/, '').split('\n')
  return lines.slice(start - 1, end).join('\n')
}

function escapeHtml(s) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function codeBlock({ path, lang, start = 1, source }) {
  const lines = source.replace(/\n$/, '').split('\n')
  const body = lines
    .map((line, i) => {
      const n = String(start + i).padStart(3, ' ')
      return `<div class="ln"><span class="n">${n}</span><span class="c">${escapeHtml(line) || ' '}</span></div>`
    })
    .join('')
  return `<figure class="file" id="${path.replaceAll(/[^a-z0-9]+/gi, '-')}">
    <figcaption>
      <span class="dot"></span>
      <span class="path">${escapeHtml(path)}</span>
      <span class="lang">${lang}</span>
    </figcaption>
    <pre class="code" data-lang="${lang}">${body}</pre>
  </figure>`
}

const css = `
:root { --ink:#111318; --muted:#5c6473; --line:#e6e8ee; --bg:#f6f7f9; --card:#fff; --accent:#0b5cab; --code:#0f1419; --codefg:#d6deea; --num:#6b7380; }
* { box-sizing: border-box; }
html, body { margin:0; padding:0; background:var(--bg); color:var(--ink); font: 15px/1.45 ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; }
page, .page { display:block; }
.wrap { max-width: 1180px; margin: 0 auto; padding: 28px 28px 48px; }
.hero { display:flex; justify-content:space-between; gap:24px; align-items:flex-end; border-bottom:1px solid var(--line); padding-bottom:18px; margin-bottom:22px; }
.kicker { color:var(--accent); font-weight:600; letter-spacing:.04em; font-size:12px; text-transform:uppercase; }
h1 { margin:6px 0 0; font-size:28px; letter-spacing:-.03em; }
.sub { margin:8px 0 0; color:var(--muted); max-width: 62ch; }
.meta { text-align:right; color:var(--muted); font-size:13px; }
.meta b { display:block; color:var(--ink); font-size:14px; }
.grid { display:grid; grid-template-columns: 1fr 1fr; gap:14px; }
.grid3 { display:grid; grid-template-columns: repeat(3, 1fr); gap:12px; }
.card { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:14px 16px; }
.card h3 { margin:0 0 6px; font-size:14px; }
.card p, .card li { margin:0; color:var(--muted); font-size:13px; }
.card ul { margin:8px 0 0; padding-left:18px; }
.flow { display:grid; grid-template-columns: repeat(5, 1fr); gap:8px; margin:18px 0 8px; }
.step { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:12px; min-height:92px; }
.step b { display:block; font-size:13px; margin-bottom:4px; }
.step span { color:var(--muted); font-size:12px; }
.arrow { display:flex; align-items:center; justify-content:center; color:var(--accent); font-weight:700; }
table { width:100%; border-collapse:collapse; background:var(--card); border:1px solid var(--line); border-radius:10px; overflow:hidden; }
th, td { text-align:left; padding:9px 12px; border-bottom:1px solid var(--line); font-size:13px; vertical-align:top; }
th { background:#eef2f7; font-weight:600; }
.file { margin:16px 0 0; background:var(--code); border-radius:10px; overflow:hidden; border:1px solid #1c2430; }
.file figcaption { display:flex; align-items:center; gap:8px; padding:8px 12px; background:#161c24; color:#9aa7b8; font-size:12px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.file .path { color:#e8eef7; flex:1; }
.file .lang { text-transform:uppercase; letter-spacing:.04em; font-size:10px; }
.dot { width:8px; height:8px; border-radius:50%; background:#3b82f6; display:inline-block; }
.code { margin:0; padding:10px 0 14px; overflow:auto; font: 12px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; color:var(--codefg); }
.ln { display:flex; }
.n { flex:0 0 46px; text-align:right; padding:0 10px 0 8px; color:var(--num); user-select:none; }
.c { white-space: pre; padding-right:16px; }
.note { margin-top:14px; color:var(--muted); font-size:12px; }
@media (max-width: 900px) { .grid, .grid3, .flow { grid-template-columns: 1fr; } .hero { flex-direction:column; align-items:flex-start; } }
`

function page({ title, kicker, sub, metaRight, body }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>${css}</style>
</head>
<body>
  <div class="wrap">
    <header class="hero">
      <div>
        <div class="kicker">${escapeHtml(kicker)}</div>
        <h1>${escapeHtml(title)}</h1>
        <p class="sub">${escapeHtml(sub)}</p>
      </div>
      <div class="meta">${metaRight}</div>
    </header>
    ${body}
    <p class="note">FistCommerce Circle integration only — Programmable Wallets (W3S) and CCTP / Bridge Kit. API keys are server-side and are not shown.</p>
  </div>
</body>
</html>`
}

const feSdk = readFe('src/circle/sdk.ts')
const feAdapter = readFe('src/circle/adapter.ts')
const feApi = readFe('src/circle/api.ts')
const feChain = readFe('src/circle/chainMap.ts')
const feIndex = readFe('src/circle/index.ts')
const feProvider = readFe('src/circle/CircleWalletProvider.tsx')
const feCctp = readFe('src/bridge/cctpBridge.ts')
const beClient = readBe('circle_handler/circle_client.py')
const beUrls = readBe('circle_handler/urls.py')
const beModels = readBe('circle_handler/models.py')
const beServices = readBe('circle_handler/services.py')
const beIris = readBe('bridge_handler/iris.py')
const beCctp = readBe('utils/cctp.py')

writeFileSync(
  join(outDir, '01-architecture.html'),
  page({
    title: 'Circle integration architecture',
    kicker: 'FistCommerce · Circle grant evidence',
    sub: 'Isolated Programmable Wallets and CCTP modules. The rest of the lending app is not shown.',
    metaRight: '<b>Frontend</b>src/circle + src/bridge<br/><b>Backend</b>circle_handler + bridge_handler',
    body: `
      <div class="flow">
        <div class="step"><b>1. Connect</b><span>Google, Apple, Facebook, email OTP, or PIN via @circle-fin/w3s-pw-web-sdk</span></div>
        <div class="step"><b>2. Server proxy</b><span>Django circle_handler talks to api.circle.com with CIRCLE_API_KEY</span></div>
        <div class="step"><b>3. EOA wallet</b><span>Ensure/create user-controlled wallet on Arc / Arb / hop chains</span></div>
        <div class="step"><b>4. Sign / send</b><span>EIP-1193 adapter: typed data + contract execution challenges</span></div>
        <div class="step"><b>5. CCTP to Arc</b><span>@circle-fin/bridge-kit burn + Circle Forwarder mint, Iris attestation</span></div>
      </div>
      <div class="grid" style="margin-top:16px">
        <div class="card">
          <h3>Frontend packages</h3>
          <ul>
            <li>@circle-fin/w3s-pw-web-sdk — PIN / social / email challenges</li>
            <li>@circle-fin/bridge-kit — CCTP USDC burn to Arc Testnet</li>
            <li>@circle-fin/adapter-viem-v2 — EIP-1193 → Bridge Kit adapter</li>
          </ul>
        </div>
        <div class="card">
          <h3>Backend Circle APIs</h3>
          <ul>
            <li>POST /api/circle/auth/{social,email}/token/</li>
            <li>POST /api/circle/auth/complete/ and /sessions/</li>
            <li>POST /api/circle/wallets/ensure/</li>
            <li>POST /api/circle/sign/typed-data/ and /transactions/send/</li>
            <li>GET /api/circle/challenges/:id/</li>
            <li>GET /api/bridge/config|balances + Iris reconcile</li>
          </ul>
        </div>
      </div>
      <table style="margin-top:16px">
        <thead><tr><th>Layer</th><th>Module</th><th>Circle product</th></tr></thead>
        <tbody>
          <tr><td>Frontend</td><td>src/circle/*</td><td>User-Controlled Wallets (EOA)</td></tr>
          <tr><td>Frontend</td><td>src/bridge/cctpBridge.ts</td><td>Bridge Kit CCTP v2 + Forwarder</td></tr>
          <tr><td>Backend</td><td>circle_handler/circle_client.py</td><td>W3S REST: /v1/w3s/*</td></tr>
          <tr><td>Backend</td><td>bridge_handler/iris.py</td><td>Iris attestation /v2/messages</td></tr>
          <tr><td>Backend</td><td>utils/cctp.py</td><td>Arc USDC + CCTP source domains</td></tr>
        </tbody>
      </table>
      ${codeBlock({ path: 'src/circle/index.ts', lang: 'ts', source: feIndex })}
    `,
  }),
)

writeFileSync(
  join(outDir, '02-frontend-sdk-adapter.html'),
  page({
    title: 'Frontend · Programmable Wallets SDK',
    kicker: 'FistCommerceFrontend · src/circle',
    sub: 'W3S web SDK login/challenge execution and an EIP-1193 provider so Circle wallets plug into the same signing path as any injected wallet.',
    metaRight: '<b>SDKs</b>w3s-pw-web-sdk<br/>adapter-viem-v2',
    body: `
      ${codeBlock({
        path: 'src/circle/sdk.ts — load @circle-fin/w3s-pw-web-sdk',
        lang: 'ts',
        start: 55,
        source: sliceLines(feSdk, 55, 110),
      })}
      ${codeBlock({
        path: 'src/circle/sdk.ts — Google / Apple / Facebook login',
        lang: 'ts',
        start: 174,
        source: sliceLines(feSdk, 174, 229),
      })}
      ${codeBlock({
        path: 'src/circle/sdk.ts — execute PIN / challenge',
        lang: 'ts',
        start: 323,
        source: sliceLines(feSdk, 323, 356),
      })}
      ${codeBlock({
        path: 'src/circle/adapter.ts — EIP-1193 eth_signTypedData_v4 + eth_sendTransaction',
        lang: 'ts',
        start: 71,
        source: sliceLines(feAdapter, 71, 180),
      })}
    `,
  }),
)

writeFileSync(
  join(outDir, '03-frontend-api-session.html'),
  page({
    title: 'Frontend · Circle API + session',
    kicker: 'FistCommerceFrontend · src/circle',
    sub: 'Browser calls Fist /api/circle/* only. The Circle API key never ships in VITE_*.',
    metaRight: '<b>Auth</b>X-Circle-User-Token<br/><b>Wallets</b>EOA per chain',
    body: `
      ${codeBlock({
        path: 'src/circle/api.ts — auth headers (Fist token + X-Circle-User-Token)',
        lang: 'ts',
        start: 16,
        source: sliceLines(feApi, 16, 27),
      })}
      ${codeBlock({
        path: 'src/circle/api.ts — social / email / complete / PIN session',
        lang: 'ts',
        start: 74,
        source: sliceLines(feApi, 74, 195),
      })}
      ${codeBlock({
        path: 'src/circle/api.ts — ensure wallet, sign typed data, send transaction',
        lang: 'ts',
        start: 241,
        source: sliceLines(feApi, 241, 331),
      })}
      ${codeBlock({
        path: 'src/circle/chainMap.ts — Circle blockchain codes',
        lang: 'ts',
        source: feChain,
      })}
      ${codeBlock({
        path: 'src/circle/CircleWalletProvider.tsx — social / email / PIN connect + ensure wallet',
        lang: 'tsx',
        start: 304,
        source: sliceLines(feProvider, 304, 410),
      })}
    `,
  }),
)

writeFileSync(
  join(outDir, '04-backend-w3s-proxy.html'),
  page({
    title: 'Backend · Circle W3S proxy',
    kicker: 'FistCommerceBackend · circle_handler',
    sub: 'Django app holds CIRCLE_API_KEY and proxies User-Controlled Wallet REST calls. Endpoints match the frontend client.',
    metaRight: '<b>Base</b>https://api.circle.com<br/><b>Prefix</b>/v1/w3s',
    body: `
      ${codeBlock({ path: 'circle_handler/urls.py', lang: 'py', source: beUrls })}
      ${codeBlock({
        path: 'circle_handler/circle_client.py — Circle API base + Bearer auth',
        lang: 'py',
        start: 1,
        source: sliceLines(beClient, 1, 45),
      })}
      ${codeBlock({
        path: 'circle_handler/circle_client.py — social token, email OTP, initialize, create wallet',
        lang: 'py',
        start: 139,
        source: sliceLines(beClient, 139, 264),
      })}
      ${codeBlock({
        path: 'circle_handler/circle_client.py — contract execution + challenge poll',
        lang: 'py',
        start: 305,
        source: sliceLines(beClient, 305, 360),
      })}
      ${codeBlock({
        path: 'circle_handler/services.py — social/email complete session',
        lang: 'py',
        start: 271,
        source: sliceLines(beServices, 271, 385),
      })}
      ${codeBlock({
        path: 'circle_handler/services.py — ensure EOA wallet (409 + challengeId)',
        lang: 'py',
        start: 530,
        source: sliceLines(beServices, 530, 588),
      })}
      ${codeBlock({
        path: 'circle_handler/services.py — sign typed data + contract execution',
        lang: 'py',
        start: 591,
        source: sliceLines(beServices, 591, 678),
      })}
      ${codeBlock({ path: 'circle_handler/models.py', lang: 'py', source: beModels })}
    `,
  }),
)

writeFileSync(
  join(outDir, '05-cctp-bridge-kit.html'),
  page({
    title: 'CCTP · Bridge Kit + Iris',
    kicker: 'Frontend src/bridge · Backend bridge_handler',
    sub: 'Native USDC burn on a CCTP source, Circle Forwarder mint on Arc Testnet, Iris attestation for transfer tracking.',
    metaRight: '<b>Kit</b>@circle-fin/bridge-kit<br/><b>Iris</b>iris-api-sandbox.circle.com',
    body: `
      ${codeBlock({ path: 'src/bridge/cctpBridge.ts', lang: 'ts', source: feCctp })}
      ${codeBlock({
        path: 'utils/cctp.py — Arc USDC + Bridge Kit source chains',
        lang: 'py',
        start: 1,
        source: sliceLines(beCctp, 1, 90),
      })}
      ${codeBlock({
        path: 'bridge_handler/iris.py — Circle Iris v2 messages',
        lang: 'py',
        start: 1,
        source: sliceLines(beIris, 1, 80),
      })}
    `,
  }),
)

const index = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>FistCommerce · Circle grant screenshots</title>
  <style>${css}</style>
</head>
<body>
  <div class="wrap">
    <header class="hero">
      <div>
        <div class="kicker">FistCommerce · Circle grant evidence</div>
        <h1>Circle integration screenshot set</h1>
        <p class="sub">Five pages covering only the Circle Programmable Wallets and CCTP modules.</p>
      </div>
    </header>
    <div class="grid3">
      <a class="card" href="01-architecture.html"><h3>01 Architecture</h3><p>Module map, packages, public @/circle surface.</p></a>
      <a class="card" href="02-frontend-sdk-adapter.html"><h3>02 Frontend SDK</h3><p>W3S SDK + EIP-1193 adapter.</p></a>
      <a class="card" href="03-frontend-api-session.html"><h3>03 Frontend API</h3><p>Proxy client, chain map, connect flow.</p></a>
      <a class="card" href="04-backend-w3s-proxy.html"><h3>04 Backend W3S</h3><p>circle_handler REST proxy and models.</p></a>
      <a class="card" href="05-cctp-bridge-kit.html"><h3>05 CCTP Bridge</h3><p>Bridge Kit, Arc USDC, Iris.</p></a>
    </div>
  </div>
</body>
</html>`
writeFileSync(join(outDir, 'index.html'), index)
console.log('wrote', outDir)
