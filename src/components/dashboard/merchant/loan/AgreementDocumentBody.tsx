import type { AgreementContentBlock } from '@/components/dashboard/merchant/loan/fistReceivableFinancingAgreement'

function groupBulletRuns(blocks: readonly AgreementContentBlock[]) {
  const groups: Array<
    | { kind: 'single'; block: AgreementContentBlock; index: number }
    | { kind: 'bullets'; items: string[]; startIndex: number }
  > = []

  let i = 0
  while (i < blocks.length) {
    const block = blocks[i]!
    if (block.type === 'bullet') {
      const items: string[] = []
      const startIndex = i
      while (i < blocks.length && blocks[i]!.type === 'bullet') {
        items.push((blocks[i] as Extract<AgreementContentBlock, { type: 'bullet' }>).text)
        i += 1
      }
      groups.push({ kind: 'bullets', items, startIndex })
      continue
    }
    groups.push({ kind: 'single', block, index: i })
    i += 1
  }
  return groups
}

export default function AgreementDocumentBody({ blocks }: { blocks: readonly AgreementContentBlock[] }) {
  const groups = groupBulletRuns(blocks)

  return (
    <article className="mx-auto max-w-[640px]">
      <div className="rounded-[8px] border border-[#E6E8EC] bg-[#FCFCFD] px-4 py-5 sm:px-6 sm:py-6">
        {groups.map((group) => {
          if (group.kind === 'bullets') {
            return (
              <ul
                key={`bullets-${group.startIndex}`}
                className="mt-2 list-disc space-y-1.5 pl-5 text-[13px] leading-relaxed text-[#334155]"
              >
                {group.items.map((item, itemIndex) => (
                  <li key={`${group.startIndex}-${itemIndex}`}>{item}</li>
                ))}
              </ul>
            )
          }

          const { block, index } = group
          switch (block.type) {
            case 'docTitle':
              return (
                <h3
                  key={index}
                  className="text-center text-[15px] font-bold tracking-wide text-[#0B1220] sm:text-[16px]"
                >
                  {block.text}
                </h3>
              )
            case 'meta':
              return (
                <div
                  key={index}
                  className={`${index === 1 ? 'mt-4' : 'mt-2'} flex flex-col gap-0.5 text-[13px] sm:flex-row sm:gap-2`}
                >
                  <span className="shrink-0 font-semibold text-[#0B1220]">{block.label}:</span>
                  <span className="text-[#334155]">{block.text}</span>
                </div>
              )
            case 'party':
              return (
                <p
                  key={index}
                  className="mt-2 rounded-[6px] border border-[#E6E8EC] bg-white px-3 py-2 text-[13px] leading-relaxed text-[#0B1220]"
                >
                  {block.text}
                </p>
              )
            case 'sectionHeading':
              return (
                <h4 key={index} className="mt-6 text-[15px] font-semibold text-[#0B1220]">
                  {block.text}
                </h4>
              )
            case 'subheading':
              return (
                <p key={index} className="mt-3 text-[13px] font-semibold text-[#0B1220]">
                  {block.text}
                </p>
              )
            case 'paragraph':
              return (
                <p key={index} className="mt-2 text-[13px] leading-relaxed text-[#334155]">
                  {block.text}
                </p>
              )
            default:
              return null
          }
        })}
      </div>
    </article>
  )
}
