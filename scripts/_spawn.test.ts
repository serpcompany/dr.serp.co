import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const spawnModule = fileURLToPath(new URL("./_spawn.mjs", import.meta.url))

// Starts a wrapper process that runs `childSource` through runForwardingSignals.
function startWrapper(childSource: string) {
  const wrapperSource = [
    `import { runForwardingSignals } from ${JSON.stringify(spawnModule)}`,
    `runForwardingSignals(process.execPath, ["-e", ${JSON.stringify(childSource)}])`,
  ].join("\n")
  return spawn(process.execPath, ["--input-type=module", "-e", wrapperSource], {
    stdio: ["ignore", "pipe", "inherit"],
  })
}

function exitOf(child: ReturnType<typeof spawn>) {
  return new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) =>
    child.on("exit", (code, signal) => resolve({ code, signal })),
  )
}

function isRunning(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

describe("runForwardingSignals", () => {
  it("stops the child when the wrapper gets SIGTERM", async () => {
    const wrapper = startWrapper("console.log(process.pid); setInterval(() => {}, 1000)")
    const childPid = await new Promise<number>((resolve) =>
      wrapper.stdout!.once("data", (chunk) => resolve(Number(String(chunk).trim()))),
    )
    expect(isRunning(childPid)).toBe(true)

    const exited = exitOf(wrapper)
    wrapper.kill("SIGTERM")

    expect((await exited).signal).toBe("SIGTERM")
    expect(isRunning(childPid)).toBe(false)
  })

  it("exits with the child's exit code", async () => {
    const wrapper = startWrapper("process.exit(3)")
    expect((await exitOf(wrapper)).code).toBe(3)
  })
})
