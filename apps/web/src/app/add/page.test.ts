import { describe, expect, it } from "vitest"

import { Home } from "@/app/_components/home"

describe("add site page", () => {
  it("renders the add-site workflow", async () => {
    const addPageModule = await import("./page")
    const element = addPageModule.default()

    expect(element.type).toBe(Home)
  })

  it("runs on the Node runtime", async () => {
    const addPageModule = await import("./page")

    expect(addPageModule.runtime).toBe("nodejs")
  })
})
