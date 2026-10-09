'use client'

import { ErrorState } from '@/components/error-state'

// An account page's server error, inside the sidebar and header.
export default function AccountError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="px-4 lg:px-6">
      <ErrorState error={error} retry={retry} />
    </div>
  )
}
