import { apiUrl, parseJsonResponse } from '@/api/client'
import { fetchWithAuthRecovery } from '@/api/authorizedFetch'

export type AgreementContentBlock =
  | { type: 'docTitle'; text: string }
  | { type: 'meta'; label: string; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'party'; text: string }
  | { type: 'sectionHeading'; text: string }
  | { type: 'subheading'; text: string }
  | { type: 'bullet'; text: string }

export type FinancingAgreementDocument = {
  id: string
  version: string
  title: string
  contentHash: string
  blocks: AgreementContentBlock[]
  fileUrl: string
  isCurrent?: boolean
  createdAt?: string | null
  acceptanceCount?: number
}

export async function fetchCurrentFinancingAgreement(): Promise<FinancingAgreementDocument> {
  return parseJsonResponse<FinancingAgreementDocument>(
    await fetch(apiUrl('/evidence/agreements/current/')),
  )
}

function tokenHeader(accessToken: string): string {
  const token = accessToken.trim()
  return /^Token\s+\S+/i.test(token) ? token : `Token ${token}`
}

export async function fetchAdminAgreements(accessToken: string): Promise<FinancingAgreementDocument[]> {
  const response = await fetchWithAuthRecovery(apiUrl('/evidence/agreements/'), {
    headers: { Authorization: tokenHeader(accessToken) },
  })
  const data = await parseJsonResponse<{ agreements: FinancingAgreementDocument[] }>(response)
  return data.agreements
}

export async function publishAdminAgreement(
  accessToken: string,
  body: { version: string; blocks: AgreementContentBlock[] },
): Promise<FinancingAgreementDocument> {
  const response = await fetchWithAuthRecovery(apiUrl('/evidence/agreements/'), {
    method: 'POST',
    headers: {
      Authorization: tokenHeader(accessToken),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  return parseJsonResponse<FinancingAgreementDocument>(response)
}

export async function updateAdminAgreement(
  accessToken: string,
  agreementId: string,
  body: { version: string; blocks: AgreementContentBlock[] },
): Promise<FinancingAgreementDocument> {
  const response = await fetchWithAuthRecovery(apiUrl(`/evidence/agreements/${agreementId}/`), {
    method: 'PATCH',
    headers: {
      Authorization: tokenHeader(accessToken),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  return parseJsonResponse<FinancingAgreementDocument>(response)
}

export async function deleteAdminAgreement(accessToken: string, agreementId: string): Promise<void> {
  const response = await fetchWithAuthRecovery(apiUrl(`/evidence/agreements/${agreementId}/`), {
    method: 'DELETE',
    headers: { Authorization: tokenHeader(accessToken) },
  })
  if (response.status === 204) return
  await parseJsonResponse(response)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function cleanText(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

function classifyLine(line: string, hasTitle: boolean): AgreementContentBlock | null {
  const title = /^title\s+(.+)$/i.exec(line)
  if (title?.[1]) return { type: 'docTitle', text: title[1].trim() }
  const metaLine = /^meta\s+(.+)$/i.exec(line)
  if (metaLine?.[1]) {
    const divider = metaLine[1].indexOf('|')
    if (divider < 0) throw new Error('A meta line needs a label and text separated by |.')
    const label = metaLine[1].slice(0, divider).trim()
    const text = metaLine[1].slice(divider + 1).trim()
    if (!label || !text) throw new Error('A meta line needs a label and text.')
    return { type: 'meta', label, text }
  }
  const party = /^(?:party|>)\s+(.+)$/i.exec(line)
  if (party?.[1]) return { type: 'party', text: party[1].trim() }
  const heading = /^heading\s+(.+)$/i.exec(line)
  if (heading?.[1]) return { type: 'sectionHeading', text: heading[1].trim() }
  const subheading = /^subheading\s+(.+)$/i.exec(line)
  if (subheading?.[1]) return { type: 'subheading', text: subheading[1].trim() }
  const markdownHeading = /^(#{1,6})\s+(.+)$/.exec(line)
  if (markdownHeading?.[1] && markdownHeading[2]) {
    const level = markdownHeading[1].length
    const text = markdownHeading[2].replace(/\s+#+$/, '').trim()
    if (!text) return null
    if (level === 1 && !hasTitle) return { type: 'docTitle', text }
    if (level <= 2) return { type: 'sectionHeading', text }
    return { type: 'subheading', text }
  }
  const bullet = /^(?:[-*+•]|\d+[.)])\s+(.+)$/.exec(line)
  if (bullet?.[1]) return { type: 'bullet', text: bullet[1].trim() }
  const marked = /^\*\*([^*]+?):\*\*\s*(.+)$/.exec(line) ?? /^\*\*([^*]+?)\*\*:\s*(.+)$/.exec(line)
  if (marked?.[1] && marked[2]) return { type: 'meta', label: marked[1].trim(), text: marked[2].trim() }
  return null
}

/** Plain text, Markdown, or the older one-block-per-line prefixes. */
export function textToBlocks(source: string): AgreementContentBlock[] {
  const blocks: AgreementContentBlock[] = []
  let paragraph: string[] = []
  let hasTitle = false
  const flush = () => {
    const text = paragraph.join(' ').replace(/\s+/g, ' ').trim()
    paragraph = []
    if (text) blocks.push({ type: 'paragraph', text })
  }
  for (const rawLine of source.replace(/\r\n/g, '\n').split('\n')) {
    const line = rawLine.trim()
    if (!line) {
      flush()
      continue
    }
    const special = classifyLine(line, hasTitle)
    if (!special) {
      paragraph.push(line)
      continue
    }
    flush()
    if (special.type === 'docTitle') hasTitle = true
    blocks.push(special)
  }
  flush()
  if (!blocks.length) throw new Error('Agreement text is required.')
  return blocks
}

export function editorTextToBlocks(source: string): AgreementContentBlock[] {
  return textToBlocks(source)
}

function elementText(element: HTMLElement): string {
  return cleanText(element.innerText || element.textContent || '')
}

function metaFromElement(element: HTMLElement): AgreementContentBlock | null {
  const labelElement = element.querySelector('strong, b')
  if (!labelElement) return null
  const rawLabel = cleanText(labelElement.textContent || '')
  if (!rawLabel.endsWith(':')) return null
  const label = rawLabel.replace(/:\s*$/, '').trim()
  const full = elementText(element)
  const text = full.slice(rawLabel.length).replace(/^:\s*/, '').trim()
  if (!label || !text || label.length > 80) return null
  return { type: 'meta', label, text }
}

function appendElement(element: HTMLElement, blocks: AgreementContentBlock[], hasTitle: { value: boolean }) {
  const tag = element.tagName
  if (tag === 'SCRIPT' || tag === 'STYLE') return
  if (tag === 'UL' || tag === 'OL') {
    for (const item of element.querySelectorAll(':scope > li')) {
      const text = elementText(item as HTMLElement)
      if (text) blocks.push({ type: 'bullet', text })
    }
    return
  }
  if (tag === 'BLOCKQUOTE') {
    const text = elementText(element)
    if (text) blocks.push({ type: 'party', text })
    return
  }
  if (tag === 'H1' || tag === 'H2' || tag === 'H3' || tag === 'H4') {
    const text = elementText(element)
    if (!text) return
    if (tag === 'H1' && !hasTitle.value) {
      hasTitle.value = true
      blocks.push({ type: 'docTitle', text })
      return
    }
    blocks.push({ type: tag === 'H1' || tag === 'H2' ? 'sectionHeading' : 'subheading', text })
    return
  }
  if (tag === 'P' || tag === 'DIV' || tag === 'LI') {
    if (element.querySelector('h1,h2,h3,h4,ul,ol,blockquote,p')) {
      for (const child of element.children) appendElement(child as HTMLElement, blocks, hasTitle)
      return
    }
    const meta = metaFromElement(element)
    if (meta) {
      blocks.push(meta)
      return
    }
    const text = elementText(element)
    if (!text) return
    const onlyBold = element.children.length === 1 && /^(STRONG|B)$/.test(element.children[0]?.tagName || '')
    if (onlyBold && text.length <= 120) {
      blocks.push({ type: hasTitle.value ? 'sectionHeading' : 'docTitle', text })
      if (!hasTitle.value) hasTitle.value = true
      return
    }
    blocks.push({ type: 'paragraph', text })
    return
  }
  for (const child of element.children) appendElement(child as HTMLElement, blocks, hasTitle)
}

/** Pasted rich text from a document editor. */
export function htmlToBlocks(html: string): AgreementContentBlock[] {
  const document = new DOMParser().parseFromString(html, 'text/html')
  const blocks: AgreementContentBlock[] = []
  const hasTitle = { value: false }
  for (const child of document.body.children) appendElement(child as HTMLElement, blocks, hasTitle)
  if (!blocks.length) {
    const text = cleanText(document.body.innerText || '')
    if (text) return textToBlocks(text)
  }
  if (!blocks.length) throw new Error('Agreement text is required.')
  return blocks
}

function htmlHasStructure(html: string): boolean {
  return /<(h[1-6]|ul|ol|li|blockquote|table|strong|b)\b/i.test(html)
}

/** Use rich text when the paste has document structure, otherwise Markdown or plain text. */
export function sourceToBlocks(html: string, text: string): AgreementContentBlock[] {
  if (html.trim() && htmlHasStructure(html)) return htmlToBlocks(html)
  return textToBlocks(text || html)
}

export function blocksToEditorHtml(blocks: readonly AgreementContentBlock[]): string {
  const parts: string[] = []
  let bullets: string[] = []
  const flushBullets = () => {
    if (!bullets.length) return
    parts.push(`<ul>${bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`)
    bullets = []
  }
  for (const block of blocks) {
    if (block.type !== 'bullet') flushBullets()
    const text = escapeHtml(block.text)
    switch (block.type) {
      case 'docTitle':
        parts.push(`<h1>${text}</h1>`)
        break
      case 'meta':
        parts.push(`<p><strong>${escapeHtml(block.label)}:</strong> ${text}</p>`)
        break
      case 'party':
        parts.push(`<blockquote>${text}</blockquote>`)
        break
      case 'sectionHeading':
        parts.push(`<h2>${text}</h2>`)
        break
      case 'subheading':
        parts.push(`<h3>${text}</h3>`)
        break
      case 'bullet':
        bullets.push(block.text)
        break
      default:
        parts.push(`<p>${text}</p>`)
    }
  }
  flushBullets()
  return parts.join('')
}

export function domToBlocks(root: HTMLElement): AgreementContentBlock[] {
  const blocks: AgreementContentBlock[] = []
  const hasTitle = { value: false }
  for (const child of root.children) appendElement(child as HTMLElement, blocks, hasTitle)
  if (!blocks.length) return textToBlocks(root.innerText || '')
  return blocks
}
