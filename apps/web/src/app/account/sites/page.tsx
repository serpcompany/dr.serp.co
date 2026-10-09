import { AddSiteDialog } from '@/components/account/add-site-dialog'
import { PageHeader } from '@/components/account/page-header'
import { SitesTable } from '@/components/account/sites-table'
import { requireAccount } from '@/server/account'
import { badgeUrls } from '../badge-urls'
import { NoSites } from '../no-sites'

export const dynamic = 'force-dynamic'

export default async function AccountSites({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const site = typeof params.site === 'string' ? params.site : undefined
  const add = params.add === '1'
  const query = new URLSearchParams()
  if (site) query.set('site', site)
  if (add) query.set('add', '1')
  const account = await requireAccount(`/account/sites${query.size ? `?${query}` : ''}`)
  const { plan } = account
  return (
    <>
      <PageHeader
        title="Sites"
        description={
          plan.domains === null || plan.kind === 'free'
            ? 'Your claimed sites. Open one for its badge and history.'
            : `${account.sites.length} of ${plan.domains} claimed on your plan. Open a site for its badge and history.`
        }
      />
      <SitesTable
        data={account.sites}
        urls={badgeUrls()}
        dofollow={plan.kind !== 'free'}
        openSite={site}
        empty={<NoSites />}
      />
      <AddSiteDialog open={add} canClaim={account.canClaim} limit={plan.domains} />
    </>
  )
}
