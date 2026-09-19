// Locates the js-libp2p-noise checkout that provides noise() and noiseHFS().
//
// Override with the NOISE_IMPL_DIR environment variable to point at any
// checkout of the implementation (it must be built: `pnpm build` so that
// dist/src/index.js exists, and its node_modules must be installed). If unset,
// we fall back to a sibling working tree so the demo runs out of the box in the
// research workspace. No absolute paths are hard-coded here.

import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

// Candidate locations, relative to this file, tried in order.
const candidates = [
  process.env.NOISE_IMPL_DIR,
  resolve(here, '../../../PQC-Research/wt-js-rename'),
  resolve(here, '../../../wt-js-rename'),
  resolve(here, '../../js-libp2p-noise')
].filter(Boolean)

function looksBuilt (dir) {
  return existsSync(resolve(dir, 'dist/src/index.js')) && existsSync(resolve(dir, 'node_modules'))
}

const found = candidates.find(looksBuilt)

if (found == null) {
  throw new Error(
    'Could not locate a built js-libp2p-noise checkout. Set NOISE_IMPL_DIR to a ' +
    'checkout that has been built (dist/src/index.js present) with its ' +
    'node_modules installed.'
  )
}

export const implDir = found
