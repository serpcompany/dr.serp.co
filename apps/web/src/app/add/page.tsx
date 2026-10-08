import type { Metadata } from "next"

import { Home } from "@/app/_components/home"

export const runtime = "nodejs"

export const metadata: Metadata = {
  title: "Add Site | SERP DR",
  description: "Look up a domain rating and generate an embeddable SERP DR badge.",
}

export default function AddSitePage() {
  return <Home />
}
