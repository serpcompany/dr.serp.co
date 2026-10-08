import { spawn } from 'node:child_process'

const FORWARDED_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP']

// Runs a command as a child that stops when this process is told to stop: SIGINT, SIGTERM and
// SIGHUP are passed on, and this process then exits the way the child did. Without it, stopping a
// wrapper leaves its child running.
export function runForwardingSignals(command, args, options = {}) {
  const child = spawn(command, args, { stdio: 'inherit', ...options })
  const forward = signal => child.kill(signal)
  for (const signal of FORWARDED_SIGNALS) process.on(signal, forward)

  child.on('exit', (code, signal) => {
    for (const forwarded of FORWARDED_SIGNALS) process.off(forwarded, forward)
    if (signal) process.kill(process.pid, signal)
    else process.exit(code ?? 0)
  })
  return child
}
