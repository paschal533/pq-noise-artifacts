// Cross-language version of the security-protocol downgrade experiment.
//
// One js-libp2p node and one py-libp2p host, both configured hybrid first
// (/noise-mlkem768-hfs/0.2.0) then classical /noise, connect through the same
// on-path TCP proxy the JS-only demo uses. Both directions are run:
//
//   js->py : JS dialer -> proxy -> Python listener
//   py->js : Python dialer -> proxy -> JS listener
//
// and in each direction these phases:
//
//   tap              : relay unmodified, defence off (control)
//   tap-defended     : relay unmodified, defence on both peers
//   attack           : strip the hybrid proposal, defence off
//   attack-defended  : strip the hybrid proposal, defence on both peers
//
// "Defence on" means transcript binding, extension variant, mode enforce, on
// BOTH encrypters of BOTH peers, each listing the real offer order
// [hybrid, /noise]. The negotiation outcome and every handshake success or
// failure is recorded from each side independently, plus the proxy's
// multistream-select transcript.
//
// Loopback only. Ports 9700-9799.

import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureNodeModules } from './setup.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(here, 'output')
mkdirSync(outDir, { recursive: true })
const link = ensureNodeModules()

const { multiaddr } = await import('@multiformats/multiaddr')
const { fromString } = await import('uint8arrays/from-string')
const { toString } = await import('uint8arrays/to-string')
const { startProxy } = await import('./proxy.mjs')
const { makeJsNode, ECHO_PROTOCOL, HYBRID_ID, CLASSICAL_ID, describeError } = await import('./js-node.mjs')
const { implDir, pyLibp2pDir, pythonExe } = await import('./impl-path.mjs')

const SEED_LISTENER = 0x11
const SEED_DIALER = 0x22
const PY_SETTLE_MS = 1500

const logLines = []
function log (line = '') {
  console.log(line)
  logLines.push(line)
}

function asBytes (data) {
  return data.subarray ? data.subarray() : data
}

function sleep (ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---- provenance (no absolute local paths) ----
function git (dir, args) {
  try { return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim() } catch { return null }
}
function readJson (p) {
  try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return null }
}
function depVersion (pkg) {
  return readJson(resolve(implDir, 'node_modules', pkg, 'package.json'))?.version ?? null
}
const pyVersion = (() => {
  try { return execFileSync(pythonExe, ['-c', 'import sys;print(sys.version.split()[0])'], { encoding: 'utf8' }).trim() } catch { return null }
})()
const provenance = {
  js: {
    implementation: basename(implDir),
    packageName: readJson(resolve(implDir, 'package.json'))?.name ?? null,
    packageVersion: readJson(resolve(implDir, 'package.json'))?.version ?? null,
    gitHead: git(implDir, ['rev-parse', 'HEAD']),
    gitBranch: git(implDir, ['rev-parse', '--abbrev-ref', 'HEAD']),
    gitClean: git(implDir, ['status', '--porcelain']) === '',
    node: process.version,
    deps: {
      libp2p: depVersion('libp2p'),
      '@libp2p/tcp': depVersion('@libp2p/tcp'),
      '@chainsafe/libp2p-yamux': depVersion('@chainsafe/libp2p-yamux'),
      '@libp2p/multistream-select': depVersion('@libp2p/multistream-select')
    }
  },
  python: {
    implementation: basename(pyLibp2pDir),
    gitHead: git(pyLibp2pDir, ['rev-parse', 'HEAD']),
    gitBranch: git(pyLibp2pDir, ['rev-parse', '--abbrev-ref', 'HEAD']),
    gitClean: git(pyLibp2pDir, ['status', '--porcelain']) === '',
    python: pyVersion
  }
}

// ---- Python host process ----
function spawnPy (args) {
  const child = spawn(pythonExe, [resolve(here, 'py_host.py'), ...args], {
    cwd: here,
    env: { ...process.env, PYTHONPATH: pyLibp2pDir, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' },
    stdio: ['pipe', 'pipe', 'pipe']
  })
  const events = []
  const stderr = []
  const waiters = []
  let buf = ''
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    buf += chunk
    let nl
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trimEnd()
      buf = buf.slice(nl + 1)
      if (!line.startsWith('EVT ')) { stderr.push(`[stdout] ${line}`); continue }
      const evt = JSON.parse(line.slice(4))
      events.push(evt)
      for (const w of [...waiters]) {
        if (w.match(evt)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(evt) }
      }
    }
  })
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (c) => { stderr.push(c) })
  const exited = new Promise((resolve) => child.on('exit', (code, signal) => resolve({ code, signal })))

  function waitFor (match, ms, what) {
    const hit = events.find(match)
    if (hit != null) return Promise.resolve(hit)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out waiting for python ${what}`)), ms)
      waiters.push({ match, resolve: (e) => { clearTimeout(timer); resolve(e) } })
    })
  }

  async function stop (ms = 15000) {
    try { child.stdin.write('stop\n'); child.stdin.end() } catch {}
    const timer = setTimeout(() => { try { child.kill() } catch {} }, ms)
    const res = await exited
    clearTimeout(timer)
    return res
  }

  return { child, events, stderr, waitFor, stop, exited }
}

// ---- helpers ----
async function jsEchoRoundTrip (node, ma) {
  const stream = await node.dialProtocol(ma, ECHO_PROTOCOL, { signal: AbortSignal.timeout(10000) })
  const msg = 'PING-downgrade-demo'
  const got = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('echo timeout')), 8000)
    stream.addEventListener('message', (evt) => {
      clearTimeout(timer)
      resolve(toString(asBytes(evt.data)))
      stream.close().catch(() => {})
    })
    stream.addEventListener('close', (evt) => {
      if (evt.error != null) { clearTimeout(timer); reject(evt.error) }
    })
    stream.send(fromString(msg))
  })
  return { sent: msg, received: got, ok: got === msg }
}

function wireSummary (transcript) {
  // The security negotiation frames only (the muxer negotiation that follows
  // is encrypted, so the proxy never sees it).
  return transcript
    .filter(e => e.action === 'forward' || e.action === 'rewrite')
    .map(e => e.action === 'rewrite'
      ? `${e.dir}: "${e.from}" REWRITTEN to "${e.to}"`
      : `${e.dir}: "${e.protocol}"`)
}

function wireSelected (transcript) {
  // The security protocol the listener echoed back, i.e. what
  // multistream-select actually settled on, as seen on the wire.
  const echoed = transcript.filter(e => e.dir === 'listener->dialer' && e.action === 'forward' && (e.protocol === HYBRID_ID || e.protocol === CLASSICAL_ID))
  return echoed.length > 0 ? echoed[echoed.length - 1].protocol : null
}

// For each proxied TCP connection: which side hung up first (a FIN, or a
// reset surfacing as a socket error on that side), and the bytes that had
// crossed in each direction by then. In a connected phase this is just the
// harness tearing down; in a refused phase it names the side that walked away.
function hangups (transcript) {
  const byConn = new Map()
  for (const e of transcript) {
    if (e.conn == null || byConn.has(e.conn)) continue
    if (e.action === 'fin') byConn.set(e.conn, { conn: e.conn, first: `FIN from ${e.from}`, bytes: e.bytes })
    if (e.action === 'socket-error') byConn.set(e.conn, { conn: e.conn, first: `${e.note} on ${e.side} socket`, bytes: null })
    if (e.action === 'close' && !byConn.has(e.conn)) byConn.set(e.conn, { conn: e.conn, first: `close on ${e.side} socket`, bytes: e.bytes })
  }
  // Fill in byte counts from the final close record where the first signal had none.
  for (const e of transcript) {
    if (e.action === 'close' && byConn.get(e.conn)?.bytes == null) byConn.get(e.conn).bytes = e.bytes
  }
  return [...byConn.values()]
}

// Summarise what a side reported about its handshakes.
function jsHandshakes (events) {
  return events.map(e => e.event === 'secure-ok'
    ? { ok: true, side: e.side, encrypter: e.encrypter }
    : { ok: false, side: e.side, encrypter: e.encrypter, error: e.error })
}
function pyHandshakes (events) {
  return events
    .filter(e => e.event === 'secure-ok' || e.event === 'secure-error')
    .map(e => e.event === 'secure-ok'
      ? { ok: true, side: e.side, encrypter: e.encrypter }
      : { ok: false, side: e.side, encrypter: e.encrypter, error: e.error })
}

// ---- direction 1: JS dialer -> proxy -> Python listener ----
async function runJsDialsPy (phase, ports) {
  const { attack, defended } = phase
  const py = spawnPy(['--role', 'listen', '--port', String(ports.target), '--defence', defended ? 'on' : 'off', '--seed-byte', String(SEED_LISTENER)])
  const result = { direction: 'js->py', phase: phase.name, defended, attack, ports }
  let proxy = null
  let dialer = null
  try {
    const ready = await py.waitFor(e => e.event === 'ready' || e.event === 'fatal', 60000, 'ready')
    if (ready.event === 'fatal') throw new Error(`python listener failed to start: ${JSON.stringify(ready.error)}`)
    const pyId = ready.peerId
    proxy = await startProxy({ targetPort: ports.target, attack, listenPort: ports.proxy })
    const made = await makeJsNode({ seedByte: SEED_DIALER, defended })
    dialer = made.node
    const dialMa = multiaddr(`/ip4/127.0.0.1/tcp/${ports.proxy}/p2p/${pyId}`)

    try {
      const conn = await dialer.dial(dialMa, { signal: AbortSignal.timeout(20000) })
      result.dialerView = { connected: true, encryption: conn.encryption, muxer: conn.multiplexer ?? null, remotePeer: conn.remotePeer.toString(), remotePeerMatches: conn.remotePeer.toString() === pyId }
      try {
        result.echo = await jsEchoRoundTrip(dialer, dialMa)
      } catch (err) {
        result.echo = { ok: false, error: describeError(err) }
      }
    } catch (err) {
      result.dialerView = { connected: false, dialError: describeError(err), cause: err?.cause != null ? describeError(err.cause) : null }
    }
    result.dialerHandshakes = jsHandshakes(made.events)
    result.dialerConnectionsOpened = made.connections

    await sleep(PY_SETTLE_MS)
  } finally {
    const exit = await py.stop()
    result.pyExit = exit
    if (dialer != null) await dialer.stop()
    if (proxy != null) await proxy.close()
  }
  const served = py.events.find(e => e.event === 'echo-served')
  result.listenerView = {
    connectionsSeenInEcho: served?.connections ?? null,
    finalConnections: py.events.find(e => e.event === 'final-connections')?.connections ?? null,
    echoServed: served != null
  }
  result.listenerHandshakes = pyHandshakes(py.events)
  result.pyEvents = py.events
  result.pyStderr = py.stderr.join('')
  result.wireTranscript = proxy?.transcript ?? []
  return result
}

// ---- direction 2: Python dialer -> proxy -> JS listener ----
async function runPyDialsJs (phase, ports) {
  const { attack, defended } = phase
  const result = { direction: 'py->js', phase: phase.name, defended, attack, ports }
  const made = await makeJsNode({ seedByte: SEED_LISTENER, listenPort: ports.target, defended })
  const listener = made.node
  await listener.handle(ECHO_PROTOCOL, (stream) => {
    stream.addEventListener('message', (evt) => {
      try { stream.send(asBytes(evt.data)) } catch {}
    })
  })
  const jsId = listener.peerId.toString()
  let proxy = null
  let py = null
  try {
    proxy = await startProxy({ targetPort: ports.target, attack, listenPort: ports.proxy })
    py = spawnPy(['--role', 'dial', '--target', `/ip4/127.0.0.1/tcp/${ports.proxy}/p2p/${jsId}`, '--defence', defended ? 'on' : 'off', '--seed-byte', String(SEED_DIALER)])
    const timer = setTimeout(() => { try { py.child.kill() } catch {} }, 90000)
    result.pyExit = await py.exited
    clearTimeout(timer)

    const pyReady = py.events.find(e => e.event === 'ready')
    const pyId = pyReady?.peerId ?? null
    const opened = made.connections.filter(c => c.remotePeer === pyId)
    result.listenerView = {
      // Every connection the JS listener opened with the Python dialer, as
      // recorded at connection:open (remote PeerId verified by the handshake).
      connectionsOpened: opened,
      remotePeerMatches: opened.length > 0
    }
  } finally {
    await listener.stop()
    if (proxy != null) await proxy.close()
  }
  const connected = py.events.find(e => e.event === 'connected')
  const dialErr = py.events.find(e => e.event === 'dial-error')
  result.dialerView = connected != null
    ? { connected: true, connections: connected.connections, remotePeer: connected.remotePeer, remotePeerMatches: connected.remotePeer === jsId }
    : { connected: false, dialError: dialErr?.error ?? null }
  result.echo = (() => {
    const e = py.events.find(x => x.event === 'echo')
    const ee = py.events.find(x => x.event === 'echo-error')
    if (e != null) return { sent: e.sent, received: e.received, ok: e.ok }
    if (ee != null) return { ok: false, error: ee.error }
    return null
  })()
  result.dialerHandshakes = pyHandshakes(py.events)
  result.listenerHandshakes = jsHandshakes(made.events)
  result.pyEvents = py.events
  result.pyStderr = py.stderr.join('')
  result.wireTranscript = proxy?.transcript ?? []
  return result
}

// ---- printing ----
function fmtHandshakes (list) {
  if (list == null || list.length === 0) return ['      (no handshake recorded)']
  return list.map(h => {
    if (h.ok) return `      ${h.side} ${h.encrypter}: OK`
    const err = Array.isArray(h.error)
      ? h.error.map(x => `${x.class}: ${x.message}`).join('  <-  ')
      : `${h.error.name}${h.error.code ? ` [${h.error.code}]` : ''}: ${h.error.message}`
    return `      ${h.side} ${h.encrypter}: FAILED ${err}`
  })
}

function printResult (r) {
  log(`\n=== ${r.direction} / ${r.phase}  (proxy ${r.attack ? 'ATTACK' : 'tap'}, defence ${r.defended ? 'ON' : 'off'}) ===`)
  log('  wire (security multistream-select frames seen by the proxy):')
  for (const l of wireSummary(r.wireTranscript)) log(`    ${l}`)
  log(`  wire: listener selected       : ${wireSelected(r.wireTranscript) ?? '(none)'}`)
  for (const h of hangups(r.wireTranscript)) {
    log(`  wire: tcp conn ${h.conn} first hang-up : ${h.first}; bytes d->l ${h.bytes?.['dialer->listener']}, l->d ${h.bytes?.['listener->dialer']}`)
  }
  log(`  dialer view   : ${JSON.stringify(r.dialerView)}`)
  log('  dialer handshakes:')
  for (const l of fmtHandshakes(r.dialerHandshakes)) log(l)
  log(`  listener view : ${JSON.stringify(r.listenerView)}`)
  log('  listener handshakes:')
  for (const l of fmtHandshakes(r.listenerHandshakes)) log(l)
  log(`  echo          : ${JSON.stringify(r.echo)}`)
  log(`  python exit   : ${JSON.stringify(r.pyExit)}`)
}

// ---- run ----
const PHASES = [
  { name: 'tap', attack: false, defended: false },
  { name: 'tap-defended', attack: false, defended: true },
  { name: 'attack', attack: true, defended: false },
  { name: 'attack-defended', attack: true, defended: true }
]

const only = process.argv[2] // optional: 'js->py' or 'py->js'

log('cross-language security-protocol downgrade experiment (loopback only)')
log(`js     : ${provenance.js.packageName}@${provenance.js.packageVersion} ${provenance.js.gitBranch}@${provenance.js.gitHead} (${provenance.js.gitClean ? 'clean' : 'DIRTY'}), node ${provenance.js.node}, libp2p@${provenance.js.deps.libp2p}`)
log(`python : ${provenance.python.implementation} ${provenance.python.gitBranch}@${provenance.python.gitHead} (${provenance.python.gitClean ? 'clean' : 'DIRTY'}), python ${provenance.python.python}`)
log(`node_modules link: ${link.created ? 'created' : 'pre-existing'}`)

const results = []
for (const [d, direction] of ['js->py', 'py->js'].entries()) {
  if (only != null && only !== direction) continue
  for (const [i, phase] of PHASES.entries()) {
    const ports = { target: 9710 + d * 10 + i, proxy: 9750 + d * 10 + i }
    const r = direction === 'js->py' ? await runJsDialsPy(phase, ports) : await runPyDialsJs(phase, ports)
    results.push(r)
    printResult(r)
    writeFileSync(resolve(outDir, `transcript-${direction.replace('->', '-to-')}-${phase.name}.json`), JSON.stringify(r.wireTranscript, null, 2))
  }
}

// ---- table ----
function sideOutcome (view, handshakes) {
  const fails = (handshakes ?? []).filter(h => !h.ok)
  if (fails.length === 0) return ''
  const f = fails[0]
  if (Array.isArray(f.error)) {
    const root = f.error[f.error.length - 1]
    return `${root.class.split('.').pop()}: ${root.message}`
  }
  return `${f.error.name}${f.error.code ? ` [${f.error.code}]` : ''}: ${f.error.message}`
}
function sideProto (r, which) {
  const hs = which === 'dialer' ? r.dialerHandshakes : r.listenerHandshakes
  const ran = [...new Set((hs ?? []).map(h => h.encrypter))]
  return ran.join(',') || '(none)'
}
log('\n=== SUMMARY TABLE ===')
log('direction | phase | wire selected | tcp attempts | dialer encrypter | listener encrypter | connection | echo | dialer error | listener error')
for (const r of results) {
  const connected = r.dialerView?.connected === true
  log([
    r.direction, r.phase, wireSelected(r.wireTranscript) ?? '-',
    r.wireTranscript.filter(e => e.action === 'conn-open').length,
    sideProto(r, 'dialer'), sideProto(r, 'listener'),
    connected ? 'ESTABLISHED' : 'REFUSED/FAILED',
    r.echo?.ok === true ? 'ok' : '-',
    sideOutcome(r.dialerView, r.dialerHandshakes) || '-',
    sideOutcome(r.listenerView, r.listenerHandshakes) || '-'
  ].join(' | '))
}

writeFileSync(resolve(outDir, `results${only ? '-' + only.replace('->', '-to-') : ''}.json`), JSON.stringify({ when: new Date().toISOString(), provenance, hybridId: HYBRID_ID, classicalId: CLASSICAL_ID, results }, null, 2))
writeFileSync(resolve(outDir, `console-log${only ? '-' + only.replace('->', '-to-') : ''}.txt`), logLines.join('\n') + '\n')
log('\nwritten: output/results.json, output/transcript-*.json, output/console-log.txt')
process.exit(0)
