#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const viteNode = resolve(root, 'node_modules/vite-node/vite-node.mjs')
const runner = resolve(root, 'scripts/preset-lab/build-neutral-gothic-noto-seed-v0.ts')

execFileSync(process.execPath, [viteNode, runner], {
  cwd: root,
  stdio: 'inherit',
})
