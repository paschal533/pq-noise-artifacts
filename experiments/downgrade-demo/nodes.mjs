// Builds real js-libp2p nodes that negotiate their connection encrypter over
// multistream-select. Both nodes advertise the hybrid post-quantum encrypter
// FIRST and classical /noise second, which is exactly the deployment shape the
// audit finding A-1 targets.
//
// The libp2p / tcp / yamux packages are resolved from the js-libp2p-noise
// checkout's node_modules (linked in by setup.mjs). The noise implementation
// itself is imported from that checkout's built dist by absolute file URL so we
// exercise the exact code under audit rather than a published copy.

import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { yamux } from '@chainsafe/libp2p-yamux'
import { generateKeyPairFromSeed } from '@libp2p/crypto/keys'
import { implDir } from './impl-path.mjs'

const noiseUrl = pathToFileURL(resolve(implDir, 'dist/src/index.js')).href
const { noise, noiseHFS } = await import(noiseUrl)

export const ECHO_PROTOCOL = '/downgrade-demo/echo/1.0.0'

// Deterministic identities so PeerIds are stable across runs.
function seed (byte) {
  const s = new Uint8Array(32)
  s.fill(byte)
  return s
}

// The security protocols these nodes offer, in preference order. Passed to
// the encrypters when the defence is on so each peer can state, inside the
// encrypted handshake, what it actually offered.
export const OFFERED_PROTOCOLS = ['/noise-mlkem768-hfs/0.2.0', '/noise']

export async function makeNode ({ seedByte, listen = false, defended = false }) {
  // When defended, both encrypters bind the handshake to the offered list
  // and abort a session whose negotiated protocol contradicts it.
  const binding = defended
    ? { transcriptBinding: { mode: 'enforce', securityProtocols: OFFERED_PROTOCOLS } }
    : {}
  const privateKey = await generateKeyPairFromSeed('Ed25519', seed(seedByte))
  const node = await createLibp2p({
    privateKey,
    addresses: listen ? { listen: ['/ip4/127.0.0.1/tcp/0'] } : { listen: [] },
    transports: [tcp()],
    // Hybrid first, classical second: a peer that prefers post-quantum but
    // remains backward compatible.
    connectionEncrypters: [noiseHFS(binding), noise(binding)],
    streamMuxers: [yamux()],
    connectionGater: {
      // Loopback-only demo; keep the dial policy permissive and local.
      denyDialMultiaddr: async () => false
    },
    start: true
  })
  return node
}
