// Makes the js-libp2p / @libp2p/tcp / @chainsafe/libp2p-yamux packages
// resolvable from this experiment WITHOUT installing anything, by linking this
// directory's node_modules to the js-libp2p-noise checkout's node_modules.
//
// This deliberately reuses the exact dependency set the implementation was
// built and audited against, which avoids the dual-package hazard that a
// separate `npm install` of libp2p would introduce (two copies of
// @libp2p/interface -> broken instanceof/symbol checks). Because the link
// resolves to the same physical node_modules that the noise dist imports from,
// every package is a single shared instance.
//
// fs.symlink(..., 'junction') creates a directory junction on Windows and a
// directory symlink elsewhere, so this is cross-platform. It creates a link
// only; it never writes into the implementation checkout.

import { existsSync, symlinkSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { implDir } from './impl-path.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const linkPath = resolve(here, 'node_modules')
const target = resolve(implDir, 'node_modules')

export function ensureNodeModules () {
  if (existsSync(linkPath)) {
    // Already present (link or real dir). Leave it as-is.
    return { linkPath, target, created: false }
  }
  try {
    symlinkSync(target, linkPath, 'junction')
    return { linkPath, target, created: true }
  } catch (err) {
    throw new Error(`Failed to link node_modules -> ${target}: ${err.message}`)
  }
}
