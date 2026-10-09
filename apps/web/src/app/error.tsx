'use client'

import { ErrorState } from '@/components/error-state'

// Any page's server error, including the account layout's (its own boundary sits inside it).
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-16">
      <ErrorState error={error} retry={retry} />
    </main>
  )
}
