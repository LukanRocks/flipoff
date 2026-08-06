import { useCallback, useMemo, useState } from 'react'

export type StatusTone = '' | 'success' | 'error'

export interface Status {
  message: string
  tone: StatusTone
}

export interface StatusApi extends Status {
  set: (message: string, tone?: StatusTone) => void
  clear: () => void
  /**
   * Runs an async action, reporting progress and then either the caller's
   * success line or whatever the server said went wrong. Returns whether it
   * succeeded, so callers can skip their follow-up work on failure.
   */
  run: (pending: string, action: () => Promise<void>, success?: string) => Promise<boolean>
}

export function useStatus(): StatusApi {
  const [status, setStatus] = useState<Status>({ message: '', tone: '' })

  const set = useCallback((message: string, tone: StatusTone = ''): void => setStatus({ message, tone }), [])
  const clear = useCallback((): void => setStatus({ message: '', tone: '' }), [])

  const run = useCallback(async (pending: string, action: () => Promise<void>, success?: string): Promise<boolean> => {
    setStatus({ message: pending, tone: '' })
    try {
      await action()
      setStatus(success ? { message: success, tone: 'success' } : { message: '', tone: '' })
      return true
    } catch (caught) {
      setStatus({ message: caught instanceof Error ? caught.message : 'Something went wrong.', tone: 'error' })
      return false
    }
  }, [])

  return useMemo(() => ({ ...status, set, clear, run }), [status, set, clear, run])
}
