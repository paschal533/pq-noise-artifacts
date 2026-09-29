// Locates the two implementations under test.
//
// NOISE_IMPL_DIR : a built js-libp2p-noise checkout that provides noise() and
//                  noiseHFS() (dist/src/index.js present, node_modules
//                  installed).
// PY_LIBP2P_DIR  : a py-libp2p checkout with the XXhfs transport and
//                  transcript binding.
// PY_LIBP2P_PYTHON : the interpreter to run it with. Defaults to the
//                  checkout's own .venv.
//
// If unset, sibling locations in the research workspace are tried so the
// experiment runs out of the box there.

import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

function firstMatch (candidates, test) {
  return candidates.filter(Boolean).find(test)
}

const noiseDir = firstMatch([
  process.env.NOISE_IMPL_DIR,
  resolve(here, '../../../PQC-Research/wt-js-rename'),
  resolve(here, '../../../wt-js-rename')
], (dir) => existsSync(resolve(dir, 'dist/src/index.js')) && existsSync(resolve(dir, 'node_modules')))

if (noiseDir == null) {
  throw new Error('Could not locate a built js-libp2p-noise checkout. Set NOISE_IMPL_DIR.')
}

const pyDir = firstMatch([
  process.env.PY_LIBP2P_DIR,
  resolve(here, '../../../py-libp2p/py-libp2p')
], (dir) => existsSync(resolve(dir, 'libp2p/security/noise/transcript_binding.py')))

if (pyDir == null) {
  throw new Error('Could not locate a py-libp2p checkout with transcript binding. Set PY_LIBP2P_DIR.')
}

const venvPython = process.platform === 'win32'
  ? resolve(pyDir, '.venv/Scripts/python.exe')
  : resolve(pyDir, '.venv/bin/python')

export const implDir = noiseDir
export const pyLibp2pDir = pyDir
export const pythonExe = process.env.PY_LIBP2P_PYTHON ?? venvPython
