import { useEffect } from 'react'

import { formatWeiToEth } from '@/api/adminServicerWallet'
import { isArcTestnetContractNetwork } from '@/contract_config/contractNetwork'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { refreshAdminServicerWallet } from '@/store/slices/adminServicerWalletSlice'

const AdminServicerWalletPanel = () => {
  const dispatch = useAppDispatch()
  const accessToken = useAppSelector((s) => s.auth.accessToken)
  const sessionKind = useAppSelector((s) => s.auth.sessionKind)
  const authChainId = useAppSelector((s) => s.auth.chainId)
  const { wallet, status } = useAppSelector((s) => s.adminServicerWallet)
  const nativeSymbol = isArcTestnetContractNetwork(authChainId) ? 'USDC' : 'ETH'

  useEffect(() => {
    if (!accessToken?.trim() || sessionKind !== 'admin') return
    void dispatch(refreshAdminServicerWallet())
  }, [dispatch, accessToken, sessionKind])

  if (status === 'loading' && !wallet) {
    return (
      <div className="rounded-[10px] border border-[#E6E8EC] bg-white px-5 py-4 text-[#6B7488] text-[14px]">
        Loading servicer wallet…
      </div>
    )
  }

  if (!wallet) return null

  return (
    <div className="rounded-[10px] border border-[#E6E8EC] bg-white px-5 py-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[#0B1220] font-semibold text-[15px]">Servicer wallet</p>
          <p className="text-[#6B7488] text-[13px] mt-1">
            Funds on-chain servicer operations: loan fund, disbursement, default, and write-off.
          </p>
        </div>
        <div className="text-right">
          <p className="text-[#0B1220] font-bold text-[20px]">{formatWeiToEth(wallet.nativeBalanceWei)} {nativeSymbol}</p>
          <p className="text-[#6B7488] text-[12px] font-mono mt-1">{wallet.address || '—'}</p>
        </div>
      </div>
      {wallet.lowBalanceWarning ? (
        <div className="rounded-[8px] border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3 text-[#92400E] text-[14px]">
          Low balance warning — servicer may be unable to submit transactions. Threshold:{' '}
          {formatWeiToEth(wallet.lowBalanceThresholdWei)} {nativeSymbol}
        </div>
      ) : null}
    </div>
  )
}

export default AdminServicerWalletPanel
