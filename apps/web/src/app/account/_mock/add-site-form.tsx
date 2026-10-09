'use client'

import { SearchIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'

export function AddSiteForm({ value = '' }: { value?: string }) {
  return (
    <form
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      onSubmit={event => event.preventDefault()}
    >
      <Field className="flex-1">
        <FieldLabel htmlFor="add-domain" className="sr-only">
          Domain
        </FieldLabel>
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput id="add-domain" placeholder="example.com" defaultValue={value} />
        </InputGroup>
        <FieldDescription className="sr-only">
          A domain, without https:// or a path.
        </FieldDescription>
      </Field>
      <Button type="submit">Look up</Button>
    </form>
  )
}
