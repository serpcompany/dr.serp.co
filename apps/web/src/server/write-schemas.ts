import { z } from 'zod'

// The body each write route accepts. They check types only: the 16 KB body cap bounds sizes, and
// each route keeps its own checks on values (normalizeTarget, the email pattern, the plan sizes),
// so input main accepted, such as a long pasted search, isn't refused here. Unknown keys, such
// as the `email` some clients still send, are dropped.

const domain = z.string({ message: 'Valid domain required' })

export const DomainBody = z.object({ domain })

export const CheckoutBody = z.object({
  domains: z.number({ message: 'Invalid domain tier.' }),
  billing: z.string({ message: 'Invalid billing period.' })
})

export const PruneAuditBody = z.object({
  olderThanDays: z.number().nullable().optional(),
  dryRun: z.boolean().optional()
})

export const BackfillBody = z.object({
  dryRun: z.boolean().optional(),
  limit: z.number().nullable().optional(),
  offset: z.number().nullable().optional(),
  query: z.string().optional()
})

export const CleanupBody = z.object({
  dryRun: z.boolean().optional(),
  scanAll: z.boolean().optional()
})
