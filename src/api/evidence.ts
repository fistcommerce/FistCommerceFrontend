import { fetchWithAuthRecovery } from '@/api/authorizedFetch'
import { apiUrl, parseJsonResponse, requireApiBaseUrl } from '@/api/client'

function tokenAuthHeaderValue(accessToken: string): string {
  const t = accessToken.trim()
  return /^Token\s+\S+/i.test(t) ? t : `Token ${t}`
}

export type EvidenceTxLink = {
  txHash: string | null
  shortHash: string
  explorerUrl: string | null
  eventType: string
  amount: string | null
  loanName: string | null
  receivableId: string | null
  blockNumber: number | null
  createdAt: string | null
}

export type VerificationSummary = {
  method: string
  status: string
  evidence: string
  verificationDate: string | null
  subjectType?: string
  verified?: boolean
  reviewer?: string | null
  reviewDate?: string | null
  provider?: string
  providerSessionId?: string | null
}

export type VerificationNftLink = {
  contractAddress: string | null
  tokenId: string | null
  explorerUrl: string | null
}

export type EvidenceDateRange = {
  from?: string
  to?: string
}

export type EvidenceTimelineStep = {
  key: string
  label: string
  status: 'complete' | 'pending' | string
  occurredAt: string | null
  amount: string | null
  detail: string | null
  tx: EvidenceTxLink | null
}

export type ReceivableTimeline = {
  principalAmount: string
  repaidAmount: string
  interestAmount: string | null
  receivableTx: EvidenceTxLink | null
  steps: EvidenceTimelineStep[]
}

export type EvidenceCompleteness = {
  complete: boolean
  items: Record<string, boolean>
}

export type ReceivableEvidenceBundle = {
  loanId: string
  receivableId: string | null
  loanName: string | null
  merchantWallet?: string | null
  loanAmount: string
  loanStatus: string
  chainId: number
  merchant: Record<string, unknown> | null
  identityVerification?: VerificationSummary | null
  authorityVerification?: VerificationSummary | null
  verification: VerificationSummary | null
  verificationNft?: VerificationNftLink | null
  agreement: Record<string, unknown> | null
  invoice: { invoiceReference?: string; filename?: string; documentKey?: string } | null
  payoutDestination: Record<string, unknown> | null
  transactions: EvidenceTxLink[]
  timeline?: ReceivableTimeline | null
  completeness: EvidenceCompleteness
  payoutReadiness?: { ready: boolean; failures: { code: string; message: string }[] } | null
  updatedAt?: string | null
}

export type EvidenceRegisterRow = {
  loanId: string
  merchant: string
  agreementFilename: string | null
  agreementLink: string | null
  verificationMethodEvidence: string | null
  invoiceReference: string | null
  amountFinanced: string
  receivableId: string | null
  loanName: string | null
  loanStatus: string
  transactions: EvidenceTxLink[]
  completeness: EvidenceCompleteness
}

export async function fetchReceivableEvidence(
  accessToken: string,
  loanId: string,
): Promise<ReceivableEvidenceBundle> {
  const res = await fetchWithAuthRecovery(apiUrl(`/evidence/receivables/${loanId}/`), {
    headers: {
      Accept: 'application/json',
      Authorization: tokenAuthHeaderValue(accessToken),
    },
  })
  return parseJsonResponse<ReceivableEvidenceBundle>(res)
}

export async function fetchMerchantEvidence(
  accessToken: string,
  merchantUserId: number | string,
): Promise<Record<string, unknown>> {
  const res = await fetchWithAuthRecovery(apiUrl(`/evidence/merchants/${merchantUserId}/`), {
    headers: {
      Accept: 'application/json',
      Authorization: tokenAuthHeaderValue(accessToken),
    },
  })
  return parseJsonResponse(res)
}

export async function fetchPayoutReadiness(
  accessToken: string,
  loanId: string,
): Promise<{ ready: boolean; failures: { code: string; message: string }[] }> {
  const res = await fetchWithAuthRecovery(
    apiUrl(`/evidence/receivables/${loanId}/payout-readiness/`),
    {
      headers: {
        Accept: 'application/json',
        Authorization: tokenAuthHeaderValue(accessToken),
      },
    },
  )
  return parseJsonResponse(res)
}

export async function verifyPayoutDestination(
  accessToken: string,
  merchantUserId: number | string,
): Promise<Record<string, unknown>> {
  const res = await fetchWithAuthRecovery(
    apiUrl(`/evidence/merchants/${merchantUserId}/payout-destination/verify/`),
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: tokenAuthHeaderValue(accessToken),
      },
    },
  )
  return parseJsonResponse(res)
}

function evidenceQuery(range?: EvidenceDateRange, extra?: Record<string, string>): string {
  const params = new URLSearchParams()
  if (range?.from) params.set('from', range.from)
  if (range?.to) params.set('to', range.to)
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value) params.set(key, value)
    }
  }
  const query = params.toString()
  return query ? `?${query}` : ''
}

async function downloadEvidenceFile(
  accessToken: string,
  path: string,
): Promise<Blob> {
  const base = requireApiBaseUrl()
  const root = base.endsWith('/api') ? base : `${base}/api`
  const res = await fetchWithAuthRecovery(`${root}${path}`, {
    headers: {
      Authorization: tokenAuthHeaderValue(accessToken),
    },
  })
  if (!res.ok) {
    throw new Error(`Export failed (${res.status})`)
  }
  return res.blob()
}
export async function fetchEvidenceRegister(
  accessToken: string,
  range?: EvidenceDateRange,
): Promise<{ rows: EvidenceRegisterRow[]; count: number }> {
  const res = await fetchWithAuthRecovery(
    apiUrl(`/evidence/register/${evidenceQuery(range)}`),
    {
      headers: {
        Accept: 'application/json',
        Authorization: tokenAuthHeaderValue(accessToken),
      },
    },
  )
  return parseJsonResponse(res)
}

export async function downloadEvidenceRegisterExport(
  accessToken: string,
  exportFormat: 'csv' | 'xlsx' | 'pdf',
  range?: EvidenceDateRange,
): Promise<Blob> {
  return downloadEvidenceFile(
    accessToken,
    `/evidence/register/export/${evidenceQuery(range, { export_format: exportFormat })}`,
  )
}

export async function fetchInvestorPoolDocuments(
  accessToken: string,
  range?: EvidenceDateRange,
): Promise<{ documents: ReceivableEvidenceBundle[] }> {
  const res = await fetchWithAuthRecovery(
    apiUrl(`/evidence/investor/pool-documents/${evidenceQuery(range)}`),
    {
      headers: {
        Accept: 'application/json',
        Authorization: tokenAuthHeaderValue(accessToken),
      },
    },
  )
  return parseJsonResponse(res)
}

export async function fetchMerchantDocuments(
  accessToken: string,
  range?: EvidenceDateRange,
): Promise<{ documents: ReceivableEvidenceBundle[] }> {
  const res = await fetchWithAuthRecovery(
    apiUrl(`/evidence/merchant/documents/${evidenceQuery(range)}`),
    {
      headers: {
        Accept: 'application/json',
        Authorization: tokenAuthHeaderValue(accessToken),
      },
    },
  )
  return parseJsonResponse(res)
}

export async function downloadPoolDocumentsExport(
  accessToken: string,
  audience: 'investor' | 'merchant',
  exportFormat: 'csv' | 'xlsx' | 'pdf',
  range?: EvidenceDateRange,
): Promise<Blob> {
  const path =
    audience === 'merchant'
      ? '/evidence/merchant/documents/export/'
      : '/evidence/investor/pool-documents/export/'
  return downloadEvidenceFile(
    accessToken,
    `${path}${evidenceQuery(range, { export_format: exportFormat })}`,
  )
}
