import { PageHeader } from '@/components/account/page-header'
import { SignOutButton, ThemeChoice } from '@/components/account/settings-controls'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { requireAccount } from '@/server/account'

export const dynamic = 'force-dynamic'

// #140 mockups, Settings: only what exists today.
export default async function AccountSettings() {
  const account = await requireAccount('/account/settings')
  return (
    <>
      <PageHeader
        title="Settings"
        description="Your sign-in email, how the site looks, and signing out."
      />
      <div className="flex max-w-3xl flex-col gap-4 px-4 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle>Email</CardTitle>
            <CardDescription>You sign in with a code sent here.</CardDescription>
          </CardHeader>
          <CardContent>
            <Field>
              <FieldLabel htmlFor="account-email">Email</FieldLabel>
              <Input id="account-email" value={account.email} readOnly />
              <FieldDescription>
                To use another address, sign out and sign in with it. Claims and plans stay with
                this one.
              </FieldDescription>
            </Field>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Applies on this device.</CardDescription>
          </CardHeader>
          <CardContent>
            <ThemeChoice />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Sign out</CardTitle>
            <CardDescription>Ends your session in this browser.</CardDescription>
          </CardHeader>
          <CardFooter>
            <SignOutButton />
          </CardFooter>
        </Card>
      </div>
    </>
  )
}
