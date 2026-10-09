import type { Metadata } from 'next'
import { stateOf } from '@/app/account/_mock/data'
import { LoginMock } from './login-mock'

export const metadata: Metadata = { title: 'Sign in · SERP DR', robots: { index: false } }

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return <LoginMock state={await stateOf(searchParams)} />
}
