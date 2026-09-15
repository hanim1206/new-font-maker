import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const children = []
let stopping = false
const apiOnly = process.argv.includes('--api-only')

function startProcess(command, args) {
  const child = spawn(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
  })
  children.push(child)
  return child
}

function stop(exitCode) {
  if (stopping) return
  stopping = true
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM')
  }
  process.exitCode = exitCode
}

const python = startProcess('python3', ['scripts/reference-lab/server.py'])
const vite = apiOnly ? null : startProcess(process.execPath, [
    'node_modules/vite/bin/vite.js',
    '--host',
    '127.0.0.1',
    '--port',
    '5173',
    '--strictPort',
  ])

for (const child of [python, vite].filter(Boolean)) {
  child.on('error', (error) => {
    console.error(error)
    stop(1)
  })
  child.on('exit', (code, signal) => {
    if (!stopping) {
      if (signal) console.error(`reference lab process stopped by ${signal}`)
      stop(code ?? 1)
    }
  })
}

process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))
