/**
 * Capture each Circle grant page region (overview + each code block) as one or
 * more PNGs so every line of integration code is fully visible.
 */
import { createServer } from 'node:http'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const grantDir = join(root, 'docs', 'circle-grant')
const outDir = join(grantDir, 'screenshots')
const chrome =
  process.env.CHROME_PATH ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const PAGES = [
  '01-architecture.html',
  '02-frontend-sdk-adapter.html',
  '03-frontend-api-session.html',
  '04-backend-w3s-proxy.html',
  '05-cctp-bridge-kit.html',
]

const TILE_H = 1700
const OVERLAP = 140
const WIDTH = 1440

function cleanOldShots() {
  mkdirSync(outDir, { recursive: true })
  for (const name of readdirSync(outDir)) {
    if (!name.endsWith('.png') && name !== 'manifest.json') continue
    unlinkSync(join(outDir, name))
  }
}

function startServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      try {
        const url = new URL(req.url || '/', 'http://127.0.0.1')
        let rel = decodeURIComponent(url.pathname)
        if (rel === '/') rel = '/index.html'
        const file = join(grantDir, rel.replace(/^\//, ''))
        if (!file.startsWith(grantDir) || !existsSync(file)) {
          res.writeHead(404)
          res.end('missing')
          return
        }
        const data = readFileSync(file)
        const type = file.endsWith('.html')
          ? 'text/html; charset=utf-8'
          : 'application/octet-stream'
        res.writeHead(200, { 'Content-Type': type })
        res.end(data)
      } catch (e) {
        res.writeHead(500)
        res.end(String(e))
      }
    })
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port })
    })
  })
}

function slugFromPath(pathLabel, index) {
  const base = String(pathLabel || `block-${index}`)
    .split('—')[0]
    .trim()
    .replaceAll(/[^a-zA-Z0-9._-]+/g, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/^-|-$/g, '')
    .slice(0, 64)
  return base || `block-${index}`
}

async function capturePage(browser, baseUrl, pageName) {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: 900 } })
  await page.goto(`${baseUrl}/${pageName}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(200)

  const stem = pageName.replace(/\.html$/, '')
  // Code blocks only — skip overview / explanation chrome.
  const regions = await page.evaluate(() => {
    const scrollY = window.scrollY
    const scrollX = window.scrollX
    return [...document.querySelectorAll('.file')].map((el, i) => {
      const r = el.getBoundingClientRect()
      const path =
        el.querySelector('.path')?.textContent?.trim() || `code-block-${i + 1}`
      return {
        kind: 'file',
        label: path,
        x: Math.max(0, r.left + scrollX - 4),
        y: Math.max(0, r.top + scrollY - 4),
        width: Math.ceil(r.width + 8),
        height: Math.ceil(r.height + 8),
      }
    })
  })

  const written = []
  let part = 1

  for (const region of regions) {
    const tiles = []
    if (region.height <= TILE_H) {
      tiles.push({ y: region.y, height: region.height })
    } else {
      let y = region.y
      const end = region.y + region.height
      while (y < end) {
        const height = Math.min(TILE_H, end - y)
        tiles.push({ y, height })
        if (y + height >= end) break
        y += TILE_H - OVERLAP
      }
    }

    for (let t = 0; t < tiles.length; t++) {
      const tile = tiles[t]
      const suffix =
        tiles.length === 1
          ? `p${String(part).padStart(2, '0')}`
          : `p${String(part).padStart(2, '0')}-t${t + 1}`
      const fileName = `${stem}-${suffix}-${slugFromPath(region.label, part)}.png`
      const outPath = join(outDir, fileName)

      // Playwright clip is viewport-relative. Scroll so the tile is near the top,
      // then size the viewport tall enough to contain the whole tile.
      const scrollTo = Math.max(0, Math.floor(tile.y - 8))
      await page.setViewportSize({
        width: WIDTH,
        height: Math.min(2200, Math.max(500, Math.ceil(tile.height + 40))),
      })
      await page.evaluate((yy) => window.scrollTo(0, yy), scrollTo)
      await page.waitForTimeout(80)

      const metrics = await page.evaluate(() => ({
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        innerH: window.innerHeight,
        innerW: window.innerWidth,
      }))

      const clip = {
        x: Math.max(0, region.x - metrics.scrollX),
        y: Math.max(0, tile.y - metrics.scrollY),
        width: Math.min(region.width, metrics.innerW - Math.max(0, region.x - metrics.scrollX)),
        height: Math.min(tile.height, metrics.innerH - Math.max(0, tile.y - metrics.scrollY)),
      }
      if (clip.width < 2 || clip.height < 2) {
        throw new Error(`Invalid clip for ${fileName}: ${JSON.stringify({ clip, tile, metrics })}`)
      }
      await page.screenshot({ path: outPath, clip, type: 'png' })
      written.push(fileName)
      console.log('wrote', fileName, `${Math.round(clip.width)}x${Math.round(clip.height)}`)
    }
    part += 1
  }

  await page.close()
  return written
}

async function main() {
  cleanOldShots()
  const { server, port } = await startServer()
  const baseUrl = `http://127.0.0.1:${port}`
  console.log('serving', baseUrl)

  const browser = await chromium.launch({
    executablePath: chrome,
    headless: true,
  })

  const manifest = []
  try {
    for (const pageName of PAGES) {
      console.log('---', pageName)
      const parts = await capturePage(browser, baseUrl, pageName)
      manifest.push({ page: pageName, parts })
    }
  } finally {
    await browser.close()
    server.close()
  }

  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log('done', outDir)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
