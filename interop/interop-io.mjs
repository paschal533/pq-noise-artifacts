/**
 * Reference copy of js-libp2p-noise/scripts/interop-io.mjs at commit
 * 236525e (branch js-mlkem768-rename, worktree wt-js-rename). Kept here for
 * reference only — run-matrix.sh invokes the JS repo's own copy via JS_DIR,
 * not this file. Run from inside js-libp2p-noise (or a worktree of it), not
 * from pq-noise-artifacts.
 */
/**
 * Shared pieces of the cross-implementation interop harness: a TCP socket
 * adapter, port parsing, and the one-line greeting exchange every
 * implementation's harness speaks (listener sends first).
 */
import { AbstractMultiaddrConnection } from '@libp2p/utils'

export const IMPL = 'JS'
export const GREETING_PREFIX = 'hello from '

export class TCPSocketConnection extends AbstractMultiaddrConnection {
  #socket

  constructor (init) {
    super(init)
    this.#socket = init.socket
    this.#socket.on('data', buf => this.onData(buf))
    this.#socket.on('error', err => this.abort(err))
    this.#socket.setTimeout(30_000)
    this.#socket.once('timeout', () => this.abort(new Error('TCP timeout')))
    this.#socket.once('end', () => this.onTransportClosed())
    this.#socket.once('close', hadError => {
      if (hadError) this.abort(new Error('TCP transmission error'))
      else this.onTransportClosed()
    })
    this.#socket.on('drain', () => this.safeDispatchEvent('drain'))
  }

  sendData (data) {
    let sentBytes = 0
    let canSendMore = true
    for (const buf of data) {
      sentBytes += buf.byteLength
      canSendMore = this.#socket.write(buf)
    }
    return { sentBytes, canSendMore }
  }

  async sendClose () {
    if (this.#socket.destroyed) return
    await new Promise(resolve => {
      this.#socket.once('close', resolve)
      this.#socket.destroySoon()
    })
  }

  sendReset () { this.#socket.resetAndDestroy() }
  sendPause () { this.#socket.pause() }
  sendResume () { this.#socket.resume() }
}

export function parsePort (argv, fallback) {
  const i = argv.indexOf('--port')
  if (i >= 0 && argv[i + 1] === undefined) throw new Error('--port requires a value')
  const raw = i >= 0 ? argv[i + 1] : argv.find(a => /^\d+$/.test(a))
  if (raw === undefined) return fallback
  const port = Number.parseInt(raw, 10)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`invalid port ${raw}`)
  return port
}

export async function sendGreeting (connection) {
  connection.send(new TextEncoder().encode(`${GREETING_PREFIX}${IMPL}\n`))
  console.log(`SENT ${GREETING_PREFIX}${IMPL}`)
}

export async function readGreeting (connection) {
  let text = ''
  for await (const chunk of connection) {
    text += new TextDecoder().decode(chunk instanceof Uint8Array ? chunk : chunk.subarray())
    const nl = text.indexOf('\n')
    if (nl >= 0) {
      const line = text.slice(0, nl)
      console.log(`RECV ${line}`)
      if (!line.startsWith(GREETING_PREFIX) || line.length === GREETING_PREFIX.length) {
        throw new Error(`unexpected greeting ${JSON.stringify(line)}`)
      }
      return line
    }
  }
  throw new Error('connection closed before a greeting arrived')
}

export function fail (err) {
  process.stderr.write(`ERROR ${err?.message ?? err}\n`)
  process.exit(1)
}
