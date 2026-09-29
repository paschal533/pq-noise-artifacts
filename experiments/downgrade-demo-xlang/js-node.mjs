// A real js-libp2p node for the cross-language downgrade experiment.
//
// Same shape as the JS-only demo's nodes.mjs: TCP, yamux, and
// connectionEncrypters: [noiseHFS(), noise()] (hybrid first, classical
// fallback). Two additions:
//
//   - the listen port can be pinned, so the Python peer knows where to dial;
//   - each encrypter's secureInbound/secureOutbound is wrapped so that every
//     handshake this node runs is recorded: which encrypter ran, and, on
//     failure, the exact error name, code and message thrown by the
//     implementation. Without this the listener's view of a refused handshake
//     is invisible (libp2p only logs it). The wrapper only observes; it
//     rethrows the original error unchanged.

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
export const HYBRID_ID = '/noise-mlkem768-hfs/0.2.0'
export const CLASSICAL_ID = '/noise'
// The real offer order of both peers. With the defence on, this is the list
// each peer signs into its handshake payload.
export const OFFERED_PROTOCOLS = [HYBRID_ID, CLASSICAL_ID]

function seed (byte) {
  return new Uint8Array(32).fill(byte)
}

function describeError (err) {
  return {
    name: err?.name ?? null,
    code: err?.code ?? null,
    message: String(err?.message ?? err)
  }
}

// Wrap an encrypter factory so every handshake it runs is appended to `events`.
function recording (factory, events) {
  return (components) => {
    const enc = factory(components)
    for (const [method, side] of [['secureInbound', 'inbound'], ['secureOutbound', 'outbound']]) {
      const original = enc[method].bind(enc)
      enc[method] = async (...args) => {
        try {
          const out = await original(...args)
          events.push({ event: 'secure-ok', side, encrypter: enc.protocol })
          return out
        } catch (err) {
          events.push({ event: 'secure-error', side, encrypter: enc.protocol, error: describeError(err) })
          throw err
        }
      }
    }
    return enc
  }
}

export async function makeJsNode ({ seedByte, listenPort = null, defended = false }) {
  const binding = defended
    ? { transcriptBinding: { mode: 'enforce', variant: 'extension', securityProtocols: OFFERED_PROTOCOLS } }
    : {}
  const events = []
  const privateKey = await generateKeyPairFromSeed('Ed25519', seed(seedByte))
  const node = await createLibp2p({
    privateKey,
    addresses: listenPort != null ? { listen: [`/ip4/127.0.0.1/tcp/${listenPort}`] } : { listen: [] },
    transports: [tcp()],
    connectionEncrypters: [recording(noiseHFS(binding), events), recording(noise(binding), events)],
    streamMuxers: [yamux()],
    connectionGater: { denyDialMultiaddr: async () => false },
    start: true
  })
  // Record every connection this node opens, as this node sees it, at the
  // moment it opens. Reading getConnections() later is not enough: in the
  // py->js direction the Python peer has usually hung up by then.
  const connections = []
  node.addEventListener('connection:open', (evt) => {
    const c = evt.detail
    connections.push({
      remotePeer: c.remotePeer.toString(),
      direction: c.direction,
      encryption: c.encryption,
      muxer: c.multiplexer ?? null
    })
  })
  return { node, events, connections }
}

export { describeError }
