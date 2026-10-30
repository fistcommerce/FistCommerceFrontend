import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type ReactNode } from 'react'

import {
  AdminPageFrame,
  AdminPanel,
  AdminSegmentedTabs,
  AdminStatCard,
  AdminStatGrid,
  AdminStatusPill,
} from '@/components/admin/primitives'
import AgreementDocumentBody from '@/components/dashboard/merchant/loan/AgreementDocumentBody'
import {
  blocksToEditorHtml,
  deleteAdminAgreement,
  domToBlocks,
  fetchAdminAgreements,
  fetchCurrentFinancingAgreement,
  publishAdminAgreement,
  sourceToBlocks,
  updateAdminAgreement,
  type FinancingAgreementDocument,
} from '@/components/dashboard/merchant/loan/fistReceivableFinancingAgreement'
import AdminConfirmModal from '@/components/admin/AdminConfirmModal'
import { toUserFacingError } from '@/api/client'
import { useAppSelector } from '@/store/hooks'

type Mode = 'read' | 'draft'
type DraftSurface = 'edit' | 'preview'

function formatWhen(value: string | null | undefined): string {
  if (!value) return 'Date not recorded'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date not recorded'
  return date.toLocaleDateString(undefined, { dateStyle: 'medium' })
}

function mergeAgreements(
  current: FinancingAgreementDocument | null,
  rows: FinancingAgreementDocument[],
): FinancingAgreementDocument[] {
  const next = current && !rows.some((row) => row.version === current.version) ? [current, ...rows] : [...rows]
  next.sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent))
  return next
}

export default function AdminAgreementsPage() {
  const accessToken = useAppSelector((s) => s.auth.accessToken) ?? ''
  const sessionKind = useAppSelector((s) => s.auth.sessionKind)
  const [agreements, setAgreements] = useState<FinancingAgreementDocument[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('read')
  const [draftSurface, setDraftSurface] = useState<DraftSurface>('edit')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [version, setVersion] = useState('')
  const [draftHtml, setDraftHtml] = useState('')
  const [publishedFile, setPublishedFile] = useState<{ version: string; fileUrl: string } | null>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const draftHtmlRef = useRef('')
  draftHtmlRef.current = draftHtml
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!accessToken.trim() || sessionKind !== 'admin') return
    setLoading(true)
    const current = await fetchCurrentFinancingAgreement().catch(() => null)
    if (current) {
      setAgreements((existing) => mergeAgreements(current, existing))
      setSelectedId((existing) => existing ?? current.id)
    }
    try {
      const rows = await fetchAdminAgreements(accessToken)
      const merged = mergeAgreements(current, rows)
      setAgreements(merged)
      const shown = merged.find((row) => row.isCurrent) ?? merged[0]
      setSelectedId((existing) => existing ?? shown?.id ?? null)
    } catch (err) {
      setError(toUserFacingError(err, 'The agreements could not be loaded.'))
    } finally {
      setLoading(false)
    }
  }, [accessToken, sessionKind])

  useEffect(() => {
    let cancelled = false
    load().catch((err) => {
      if (!cancelled) setError(toUserFacingError(err, 'The agreements could not be loaded.'))
    })
    return () => {
      cancelled = true
    }
  }, [load])

  useEffect(() => {
    if (mode !== 'draft' || draftSurface !== 'edit' || !editorRef.current) return
    editorRef.current.innerHTML = draftHtmlRef.current
  }, [mode, draftSurface])

  const selected = agreements.find((row) => row.id === selectedId) ?? null
  const current = agreements.find((row) => row.isCurrent) ?? null
  const hasDraft = Boolean(version.trim() || draftHtml.replace(/<[^>]+>/g, '').trim())
  const loansUseSelected = (selected?.acceptanceCount ?? 0) > 0
  const canEdit = Boolean(selected?.blocks?.length) && !loansUseSelected
  const canDelete = Boolean(selected) && agreements.length > 1 && !loansUseSelected
  const deleteSuccessor = selected?.isCurrent
    ? agreements
        .filter((row) => row.id !== selected.id)
        .sort((a, b) => Date.parse(b.createdAt || '') - Date.parse(a.createdAt || ''))[0]
    : null

  function openDraft() {
    setError(null)
    setNotice(null)
    setPublishedFile(null)
    setEditingId(null)
    setConfirmingDelete(false)
    setDraftSurface('edit')
    setMode('draft')
  }

  function openEdit(row: FinancingAgreementDocument) {
    setError(null)
    setNotice(null)
    setPublishedFile(null)
    setConfirmingDelete(false)
    setEditingId(row.id)
    setVersion(row.version)
    const markup = blocksToEditorHtml(row.blocks)
    setDraftHtml(markup)
    setDraftSurface('edit')
    setMode('draft')
    if (editorRef.current) editorRef.current.innerHTML = markup
  }

  function cancelDraft() {
    if (editingId) {
      setEditingId(null)
      setVersion('')
      setDraftHtml('')
    }
    setDraftSurface('edit')
    setMode('read')
  }

  function showSurface(next: DraftSurface) {
    if (next === 'preview' && editorRef.current) {
      setDraftHtml(editorRef.current.innerHTML)
    }
    setDraftSurface(next)
  }

  function useCurrentAsDraft() {
    if (!current) return
    const markup = blocksToEditorHtml(current.blocks)
    setDraftHtml(markup)
    setDraftSurface('edit')
    setMode('draft')
    if (editorRef.current) editorRef.current.innerHTML = markup
  }

  function clearDraft() {
    setDraftHtml('')
    if (editorRef.current) editorRef.current.innerHTML = ''
  }

  function onPaste(event: ClipboardEvent<HTMLDivElement>) {
    const html = event.clipboardData.getData('text/html')
    const text = event.clipboardData.getData('text/plain')
    if (!html.trim() && !text.trim()) return
    event.preventDefault()
    try {
      const markup = blocksToEditorHtml(sourceToBlocks(html, text))
      const editor = event.currentTarget
      if (!editor.innerText.trim()) {
        editor.innerHTML = markup
      } else {
        const selection = window.getSelection()
        if (!selection?.rangeCount) {
          editor.insertAdjacentHTML('beforeend', markup)
        } else {
          const range = selection.getRangeAt(0)
          range.deleteContents()
          const template = document.createElement('template')
          template.innerHTML = markup
          range.insertNode(template.content)
        }
      }
      setDraftHtml(editor.innerHTML)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The agreement text could not be read.')
    }
  }

  async function publish() {
    setError(null)
    setNotice(null)
    const holder = document.createElement('div')
    holder.innerHTML = editorRef.current?.innerHTML || draftHtmlRef.current
    let blocks
    try {
      blocks = domToBlocks(holder)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The agreement text could not be read.')
      return
    }
    if (!version.trim()) {
      setError('Enter the version label for this agreement, such as 1.1.')
      return
    }
    setPublishing(true)
    try {
      const created = editingId
        ? await updateAdminAgreement(accessToken, editingId, { version: version.trim(), blocks })
        : await publishAdminAgreement(accessToken, { version: version.trim(), blocks })
      const latest = await fetchCurrentFinancingAgreement().catch(() => created)
      let rows = await fetchAdminAgreements(accessToken)
      rows = mergeAgreements(latest, rows)
      if (!rows.some((row) => row.id === created.id)) rows = [created, ...rows]
      setAgreements(rows)
      setSelectedId(created.id)
      const wasEdit = Boolean(editingId)
      setEditingId(null)
      setVersion('')
      setDraftHtml('')
      setDraftSurface('edit')
      setMode('read')
      setPublishedFile(created.fileUrl ? { version: created.version, fileUrl: created.fileUrl } : null)
      setNotice(
        wasEdit
          ? `Version ${created.version} was updated.`
          : `Version ${created.version} is now the agreement for new loans. Loans already opened stay on the version they used.`,
      )
    } catch (err) {
      setError(toUserFacingError(err, editingId ? 'The agreement could not be saved.' : 'The agreement could not be published.'))
    } finally {
      setPublishing(false)
    }
  }

  async function removeSelected() {
    if (!selected) return
    setError(null)
    setNotice(null)
    setDeleting(true)
    try {
      const removedVersion = selected.version
      await deleteAdminAgreement(accessToken, selected.id)
      const latest = await fetchCurrentFinancingAgreement().catch(() => null)
      let rows = await fetchAdminAgreements(accessToken)
      rows = mergeAgreements(latest, rows).filter((row) => row.id !== selected.id)
      setAgreements(rows)
      const shown = rows.find((row) => row.isCurrent) ?? rows[0]
      setSelectedId(shown?.id ?? null)
      setConfirmingDelete(false)
      setPublishedFile(null)
      setNotice(`Version ${removedVersion} was deleted.`)
    } catch (err) {
      setError(toUserFacingError(err, 'The agreement could not be deleted.'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <AdminPageFrame>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[22px] font-bold leading-tight text-[#0B1220]">Financing agreements</h1>
          <p className="mt-2 max-w-[640px] text-[14px] leading-relaxed text-[#6B7488]">
            One version is current. New loan requests follow it. A published version stays attached to the loans that already used it.
          </p>
        </div>
        {mode === 'read' ? (
          <button
            type="button"
            onClick={openDraft}
            className="inline-flex h-10 shrink-0 items-center rounded-[6px] bg-[#195EBC] px-4 text-[14px] font-semibold text-white hover:bg-[#154a9a]"
          >
            {hasDraft ? 'Continue draft' : 'Add agreement'}
          </button>
        ) : null}
      </div>

      <AdminStatGrid columnsClassName="grid-cols-1 sm:grid-cols-3">
        <AdminStatCard title="Current version" titleTone="muted" value={current ? current.version : loading ? '…' : 'None'} />
        <AdminStatCard title="Versions on file" titleTone="muted" value={loading && !agreements.length ? '…' : String(agreements.length)} />
        <AdminStatCard title="Applies to" titleTone="muted" value="New loans" />
      </AdminStatGrid>

      {error ? (
        <p className="rounded-[8px] border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-[14px] text-[#B91C1C]">{error}</p>
      ) : null}
      {notice ? (
        <div className="flex flex-col gap-3 rounded-[8px] border border-[#BBF7D0] bg-[#E7F6EC] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[14px] text-[#16A34A]">{notice}</p>
          {publishedFile?.fileUrl ? (
            <a
              href={publishedFile.fileUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-[6px] bg-[#195EBC] px-4 text-[14px] font-semibold text-white hover:bg-[#154a9a]"
            >
              Download agreement
            </a>
          ) : null}
        </div>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <AdminPanel>
          <div className="border-b border-[#E6E8EC] px-4 py-3">
            <h2 className="text-[14px] font-semibold text-[#0B1220]">Versions</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-[#6B7488]">Select a version to read it.</p>
          </div>
          {loading && !agreements.length ? (
            <p className="px-4 py-6 text-[14px] text-[#6B7488]">Loading versions…</p>
          ) : null}
          {!loading && !agreements.length ? (
            <p className="px-4 py-6 text-[14px] text-[#6B7488]">No agreement has been published yet.</p>
          ) : null}
          <ul>
            {agreements.map((row) => {
              const active = mode === 'read' && row.id === selectedId
              return (
                <li key={row.id} className="border-b border-[#E6E8EC] last:border-b-0">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(row.id)
                      setConfirmingDelete(false)
                      setMode('read')
                    }}
                    className={`flex w-full flex-col gap-2 px-4 py-3 text-left ${active ? 'bg-[#F4F7FB]' : 'bg-white hover:bg-[#F9FAFB]'}`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[14px] font-semibold text-[#0B1220]">Version {row.version}</span>
                      <AdminStatusPill variant={row.isCurrent ? 'active' : 'neutral'}>
                        {row.isCurrent ? 'Current' : 'Previous'}
                      </AdminStatusPill>
                    </span>
                    <span className="text-[12px] leading-relaxed text-[#6B7488]">
                      {row.isCurrent ? 'New loans use this version.' : `Opened ${formatWhen(row.createdAt)}. Loans on this version keep it.`}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </AdminPanel>

        {mode === 'read' ? (
          <AdminPanel>
            <div className="flex flex-col gap-3 border-b border-[#E6E8EC] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-wide text-[#6B7488]">Reading</p>
                <h2 className="mt-1 text-[18px] font-semibold text-[#0B1220]">
                  {selected ? `Version ${selected.version}` : 'No version selected'}
                </h2>
                <p className="mt-1 text-[13px] text-[#6B7488]">
                  {loansUseSelected
                    ? 'Loans already use this version, so it cannot be edited or deleted.'
                    : selected && agreements.length < 2
                      ? 'This is the only agreement on file. You can edit it. Publish another version before deleting it.'
                      : selected?.isCurrent
                      ? 'This is the agreement a merchant accepts on a new loan.'
                      : selected
                        ? 'This version is kept for loans that were opened while it was current.'
                        : 'Choose a version from the list.'}
                </p>
              </div>
              {selected ? (
                <div className="flex shrink-0 items-center gap-3">
                  <div className="flex items-center rounded-[8px] border border-[#E6E8EC] bg-white p-1">
                    <AgreementIconButton
                      label="Edit agreement"
                      hint={canEdit ? 'Edit this version' : 'Loans already use this version.'}
                      disabled={!canEdit}
                      onClick={() => openEdit(selected)}
                      tone="default"
                    >
                      <PencilIcon />
                    </AgreementIconButton>
                    <span className="mx-1 h-5 w-px bg-[#E6E8EC]" aria-hidden />
                    <AgreementIconButton
                      label="Delete agreement"
                      hint={
                        canDelete
                          ? 'Delete this version'
                          : loansUseSelected
                            ? 'Loans already use this version.'
                            : 'Publish another version before deleting this one.'
                      }
                      disabled={!canDelete || deleting}
                      pressed={confirmingDelete}
                      onClick={() => setConfirmingDelete(true)}
                      tone="danger"
                    >
                      <TrashIcon />
                    </AgreementIconButton>
                  </div>
                  {selected.fileUrl ? (
                    <a
                      href={selected.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-10 items-center rounded-[6px] bg-[#195EBC] px-4 text-[14px] font-semibold text-white hover:bg-[#154a9a]"
                    >
                      Download agreement
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="max-h-[70vh] overflow-y-auto bg-[#F8FAFC] px-4 py-5 sm:px-6">
              {selected?.blocks?.length ? (
                <AgreementDocumentBody blocks={selected.blocks} />
              ) : (
                <p className="text-[14px] text-[#6B7488]">
                  {loading ? 'Loading the agreement…' : 'Select a version to read the agreement.'}
                </p>
              )}
            </div>
          </AdminPanel>
        ) : (
          <AdminPanel>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                void publish()
              }}
            >
              <div className="flex flex-col gap-3 border-b border-[#E6E8EC] px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-wide text-[#6B7488]">
                    {editingId ? 'Edit agreement' : 'Add agreement'}
                  </p>
                  <h2 className="mt-1 text-[18px] font-semibold text-[#0B1220]">
                    {editingId ? `Edit version ${version || ''}`.trim() : 'Write the next version'}
                  </h2>
                  <p className="mt-1 max-w-[560px] text-[13px] leading-relaxed text-[#6B7488]">
                    {editingId
                      ? 'Update the text, then save. Switch to Preview to read it before saving.'
                      : 'Paste formatted text or Markdown. After you publish, only new loans follow this version.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={cancelDraft}
                  className="inline-flex h-10 items-center rounded-[6px] border border-[#E6E8EC] bg-white px-4 text-[14px] font-semibold text-[#0B1220] hover:bg-[#F9FAFB]"
                >
                  Cancel
                </button>
              </div>

              <div className="space-y-4 px-5 py-5">
                <label className="block text-[13px] font-semibold text-[#0B1220]">
                  Version label
                  <input
                    value={version}
                    onChange={(event) => setVersion(event.target.value)}
                    className="mt-1 w-full max-w-[280px] rounded-[6px] border border-[#DFE2E8] px-3 py-2 text-[14px] font-normal"
                    placeholder="1.1"
                  />
                  <span className="mt-1 block font-normal text-[#6B7488]">
                    {editingId
                      ? 'The label stored on this version.'
                      : `A new label, different from ${current ? `version ${current.version}` : 'the current version'}.`}
                  </span>
                </label>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <AdminSegmentedTabs
                    items={[
                      { value: 'edit', label: 'Edit' },
                      { value: 'preview', label: 'Preview' },
                    ]}
                    value={draftSurface}
                    onChange={showSurface}
                  />
                  {draftSurface === 'edit' ? (
                    <div className="flex flex-wrap gap-2">
                      {editingId ? null : (
                        <button
                          type="button"
                          onClick={useCurrentAsDraft}
                          disabled={!current}
                          className="inline-flex h-9 items-center rounded-[6px] border border-[#E6E8EC] bg-white px-3 text-[13px] font-semibold text-[#195EBC] hover:bg-[#F4F7FB] disabled:opacity-50"
                        >
                          Start from the current agreement
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={clearDraft}
                        className="inline-flex h-9 items-center rounded-[6px] border border-[#E6E8EC] bg-white px-3 text-[13px] font-semibold text-[#6B7488] hover:bg-[#F9FAFB]"
                      >
                        Clear text
                      </button>
                    </div>
                  ) : (
                    <p className="text-[13px] text-[#6B7488]">This is how the agreement will read after you publish.</p>
                  )}
                </div>

                {draftSurface === 'edit' ? (
                  <div
                    ref={editorRef}
                    contentEditable
                    role="textbox"
                    aria-multiline="true"
                    aria-label="Agreement text"
                    data-placeholder="Paste formatted text or Markdown"
                    onPaste={onPaste}
                    onInput={(event) => setDraftHtml(event.currentTarget.innerHTML)}
                    className="max-h-[70vh] min-h-[360px] w-full overflow-y-auto rounded-[6px] border border-[#DFE2E8] bg-white px-4 py-3 text-[14px] font-normal leading-relaxed text-[#0B1220] outline-none empty:before:text-[#6B7488] empty:before:content-[attr(data-placeholder)] [&_blockquote]:my-2 [&_blockquote]:rounded-[6px] [&_blockquote]:border [&_blockquote]:border-[#E6E8EC] [&_blockquote]:bg-[#F8FAFC] [&_blockquote]:px-3 [&_blockquote]:py-2 [&_h1]:text-center [&_h1]:text-[16px] [&_h1]:font-bold [&_h2]:mt-4 [&_h2]:text-[15px] [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:font-semibold [&_li]:text-[#334155] [&_p]:mt-2 [&_p]:font-normal [&_p]:text-[#334155] [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5"
                  />
                ) : (
                  <div className="max-h-[70vh] min-h-[360px] overflow-y-auto rounded-[8px] border border-[#E6E8EC] bg-[#F8FAFC] px-4 py-5">
                    <DraftPreview html={draftHtml} />
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3 border-t border-[#E6E8EC] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-[520px] text-[13px] leading-relaxed text-[#6B7488]">
                  {editingId
                    ? `Saving updates version ${version.trim() || 'this agreement'} and its PDF.`
                    : version.trim()
                      ? `Publishing version ${version.trim()} makes it the agreement for new loans. Existing loans are not changed.`
                      : 'Enter a version label before publishing.'}
                </p>
                <button
                  type="submit"
                  disabled={publishing || !version.trim()}
                  className="inline-flex h-10 items-center justify-center rounded-[6px] bg-[#195EBC] px-4 text-[14px] font-semibold text-white hover:bg-[#154a9a] disabled:opacity-60"
                >
                  {publishing
                    ? editingId
                      ? 'Saving…'
                      : 'Publishing…'
                    : editingId
                      ? 'Save changes'
                      : version.trim()
                        ? `Publish version ${version.trim()}`
                        : 'Publish'}
                </button>
              </div>
            </form>
          </AdminPanel>
        )}
      </div>
      <AdminConfirmModal
        open={confirmingDelete && Boolean(selected)}
        variant="destructive"
        title={selected ? `Delete version ${selected.version}?` : 'Delete this version?'}
        description={
          selected?.isCurrent && deleteSuccessor
            ? `Version ${deleteSuccessor.version} becomes the agreement for new loans.`
            : 'This version will be removed from the list.'
        }
        confirmLabel="Delete version"
        confirmLoading={deleting}
        dismissible={!deleting}
        onConfirm={() => void removeSelected()}
        onCancel={() => {
          if (!deleting) setConfirmingDelete(false)
        }}
      />
    </AdminPageFrame>
  )
}

function DraftPreview({ html }: { html: string }) {
  const [blocks, setBlocks] = useState<ReturnType<typeof domToBlocks> | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

  useEffect(() => {
    if (!html.trim()) {
      setBlocks(null)
      setPreviewError(null)
      return
    }
    const holder = document.createElement('div')
    holder.innerHTML = html
    try {
      setBlocks(domToBlocks(holder))
      setPreviewError(null)
    } catch (err) {
      setBlocks(null)
      setPreviewError(err instanceof Error ? err.message : 'The preview could not be read.')
    }
  }, [html])

  if (!html.trim()) {
    return <p className="px-2 text-[13px] text-[#6B7488]">Paste or start from the current agreement to see a preview.</p>
  }
  if (previewError) return <p className="px-2 text-[13px] text-[#9B2C2C]">{previewError}</p>
  if (!blocks?.length) return null
  return <AgreementDocumentBody blocks={blocks} />
}

function AgreementIconButton({
  label,
  hint,
  disabled,
  pressed,
  onClick,
  tone,
  children,
}: {
  label: string
  hint: string
  disabled?: boolean
  pressed?: boolean
  onClick: () => void
  tone: 'default' | 'danger'
  children: ReactNode
}) {
  const toneClass =
    tone === 'danger'
      ? 'text-[#B91C1C] hover:bg-[#FEF2F2]'
      : 'text-[#195EBC] hover:bg-[#F4F7FB]'
  return (
    <span title={hint} className="inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed || undefined}
        disabled={disabled}
        onClick={onClick}
        className={[
          'inline-flex h-8 w-8 items-center justify-center rounded-[6px] transition-colors',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#195EBC]',
          disabled ? 'cursor-not-allowed text-[#C5CAD3] hover:bg-transparent' : toneClass,
          pressed && !disabled ? 'bg-[#FEF2F2]' : '',
        ].join(' ')}
      >
        {children}
      </button>
    </span>
  )
}

function PencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  )
}
