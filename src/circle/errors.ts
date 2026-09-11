export class CircleUserRejectedError extends Error {
  readonly code = 4001

  constructor(message = 'The Circle Wallet request was cancelled.') {
    super(message)
    this.name = 'CircleUserRejectedError'
  }
}

export function isCircleUserRejectedError(error: unknown): boolean {
  if (error instanceof CircleUserRejectedError) return true
  const msg = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  return /pin.*(cancel|closed|denied)|challenge (cancel|denied|closed)|user cancelled the (pin|challenge)|cancelled the circle/i.test(
    msg,
  )
}
