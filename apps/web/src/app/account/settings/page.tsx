import { LogOutIcon, MonitorIcon, MoonIcon, SunIcon } from 'lucide-react'
import { PageHeader } from '@/components/account/page-header'
import { Button } from '@/components/ui/button'
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { USER } from '../_mock/data'

export default function AccountSettings() {
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
              <Input id="account-email" value={USER.email} readOnly />
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
            <ToggleGroup defaultValue={['system']} variant="outline" spacing={0} aria-label="Theme">
              <ToggleGroupItem value="light">
                <SunIcon />
                Light
              </ToggleGroupItem>
              <ToggleGroupItem value="dark">
                <MoonIcon />
                Dark
              </ToggleGroupItem>
              <ToggleGroupItem value="system">
                <MonitorIcon />
                System
              </ToggleGroupItem>
            </ToggleGroup>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Sign out</CardTitle>
            <CardDescription>Ends your session in this browser.</CardDescription>
          </CardHeader>
          <CardFooter>
            <Button variant="outline">
              <LogOutIcon />
              Sign out
            </Button>
          </CardFooter>
        </Card>
      </div>
    </>
  )
}
