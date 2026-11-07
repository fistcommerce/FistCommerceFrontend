import { Link } from 'react-router-dom'

import investorPoolImage from '@/assets/investor_pool.png'
import arrowIcon from '@/assets/arrow.png'

import type { LendingPoolOpportunityCardProps } from '@/components/dashboard/shared/types'

/** Shared pool card used by investor and merchant lending pool sections. */
const LendingPoolOpportunityCard = ({
  viewDetailsTo,
  poolTitle = 'Fist Commerce Lending Pool',
  tagline = 'For short-duration loans with stable returns.',
  apyDisplay = '—',
  tvlDisplay = '—',
  minDepositDisplay = '—',
  utilizationDisplay = '—',
}: LendingPoolOpportunityCardProps) => {
  const detailsLinkLabel = (
    <span className="hidden lg:inline text-[#195EBC] underline text-[20px] whitespace-nowrap pt-1">
      Click to view details
    </span>
  )

  const detailsLinkIcon = (
    <img src={arrowIcon} alt="view details" className="lg:hidden w-[22px] h-[22px] object-contain" />
  )

  const cardInner = (
    <>
      <img
        src={investorPoolImage}
        alt="lending pool"
        className="h-[110px] w-[120px] sm:h-[140px] sm:w-[170px] lg:h-full lg:w-[300px] lg:min-h-[200px] object-cover rounded-[3px] shrink-0"
      />

      <div className="flex-1 flex flex-col justify-start">
        <div className="flex items-start justify-between gap-4">
          <h4 className="text-[#0B1220] font-semibold text-[16px] sm:text-[18px] lg:text-[32px] leading-tight">
            {poolTitle}
          </h4>

          <span className={['inline-flex items-start pt-1', viewDetailsTo ? '' : 'cursor-default'].join(' ')}>
            {detailsLinkLabel}
            {detailsLinkIcon}
          </span>
        </div>

        <p className="text-[#3A4356] text-[12px] sm:text-[14px] lg:text-[20px] mt-1 lg:mt-2">{tagline}</p>

        <div className="mt-2 lg:mt-3 space-y-1 lg:space-y-2 text-[12px] sm:text-[14px] lg:text-[20px]">
          <div className="flex items-center gap-2">
            <span className="text-[#ACACAC] font-normal">APY:</span>
            <span className="text-[#0B1220] font-medium">{apyDisplay}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[#ACACAC] font-normal">TVL:</span>
            <span className="text-[#0B1220] font-medium">{tvlDisplay}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[#ACACAC] font-normal">Minimum Deposit:</span>
            <span className="text-[#0B1220] font-medium">{minDepositDisplay}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[#ACACAC] font-normal">Utilization:</span>
            <span className="text-[#0B1220] font-medium">{utilizationDisplay}</span>
          </div>
        </div>
      </div>
    </>
  )

  const cardClassName =
    'bg-white border border-[#DFE2E8] rounded-[6px] p-4 flex items-stretch gap-4 lg:gap-6'

  if (viewDetailsTo) {
    return (
      <Link
        to={viewDetailsTo}
        className={[cardClassName, 'cursor-pointer hover:bg-[#FAFBFD] transition-colors'].join(' ')}
        aria-label={`View details for ${poolTitle}`}
      >
        {cardInner}
      </Link>
    )
  }

  return <div className={cardClassName}>{cardInner}</div>
}

export default LendingPoolOpportunityCard
