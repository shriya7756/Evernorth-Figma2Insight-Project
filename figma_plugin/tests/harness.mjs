// Runs the plugin's real code.js outside Figma with a mocked `figma` global, using a
// Figma REST export as the canvas. It exercises serialization, the health check and the
// /ingest request exactly as the plugin performs them.
//
// Usage (API running locally on :8001):
//   node figma_plugin/tests/harness.mjs dataset/dashboards/dashboard17.json [local|production]

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import vm from 'node:vm'

const [designPath, target = 'local'] = process.argv.slice(2)
if (!designPath) {
  console.error('Usage: node harness.mjs <figma-export.json> [local|production]')
  process.exit(2)
}

const exportJson = JSON.parse(readFileSync(designPath, 'utf8').replace(/^﻿/, ''))
const page = exportJson.document.children.find((n) => n.type === 'CANVAS' || n.type === 'PAGE') ?? exportJson.document.children[0]
const frames = page.children ?? []
const messages = []
let resolveDone
const done = new Promise((resolve) => (resolveDone = resolve))

const figma = {
  root: { name: exportJson.name ?? 'Harness file' },
  currentPage: { id: page.id, name: page.name, children: frames, selection: frames.slice(0, 1) },
  showUI() {},
  on() {},
  notify() {},
  openExternal(url) { messages.push({ type: 'openExternal', url }) },
  closePlugin() {},
  clientStorage: { getAsync: async () => ({ target }), setAsync: async () => {} },
  ui: {
    onmessage: null,
    postMessage(msg) {
      messages.push(msg)
      const { type, ...rest } = msg
      console.log(`[ui] ${type}`, JSON.stringify(rest).slice(0, 300))
      if (type === 'done' || type === 'error') resolveDone(msg)
    },
  },
}

const here = path.dirname(fileURLToPath(import.meta.url))
const code = readFileSync(path.join(here, '..', 'code.js'), 'utf8')
vm.runInNewContext(code, { figma, __html__: '', fetch, setTimeout, console, JSON, Promise, String, Error })

await figma.ui.onmessage({ type: 'init' })
await figma.ui.onmessage({ type: 'send-design', scope: 'selection' })
const result = await done

const connection = messages.filter((m) => m.type === 'connection').at(-1)
const ok = connection?.state === 'online' && result.type === 'done' && result.result?.importCode && result.result?.widgets > 0
console.log(ok ? '\nPLUGIN HARNESS: PASS' : '\nPLUGIN HARNESS: FAIL')
process.exit(ok ? 0 : 1)
