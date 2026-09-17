/**
 * Reference copy of js-libp2p-noise/scripts/node-listener.mjs at commit
 * a183009 (ChainSafe/js-libp2p-noise#665, branch feat/pqc-xxhfs-noise). Kept here for
 * reference only; run-matrix.sh invokes the JS repo's own copy via JS_DIR,
 * not this file. Run from inside js-libp2p-noise (or a worktree of it), not
 * from pq-noise-artifacts.
 */
/**
 * Interop listener (responder) for Noise_XXhfs_25519+MLKEM768_ChaChaPoly_SHA256.
 * Accepts one connection, completes the handshake, sends one greeting, checks
 * the reply, prints INTEROP_OK and exits. Stdout contract: see interop-io.mjs.
 *
 *   node scripts/node-listener.mjs [--port N]   (default 8000)
 */
import net from 'net'
import { generateKeyPair } from '@libp2p/crypto/keys'
import { defaultLogger } from '@libp2p/logger'
import { peerIdFromPrivateKey } from '@libp2p/peer-id'
import { ipPortToMultiaddr } from '@libp2p/utils'
import { multiaddr } from '@multiformats/multiaddr'
import { TCPSocketConnection, parsePort, createNoiseHFS, sendGreeting, readGreeting, fail, exitAfterFlush } from './interop-io.mjs'

async function main () {
  const PORT = parsePort(process.argv.slice(2), 8000)
  const privateKey = await generateKeyPair('Ed25519')
  const peerId = peerIdFromPrivateKey(privateKey)
  const noiseHfs = createNoiseHFS(privateKey, peerId)
  console.log(`LOCAL ${peerId}`)

  const server = net.createServer()
  const socket = await new Promise((resolve, reject) => {
    server.once('connection', resolve)
    server.once('error', reject)
    server.listen(PORT, '127.0.0.1', () => console.log(`READY ${PORT}`))
  })
  server.close()

  const maConn = new TCPSocketConnection({
    socket,
    remoteAddr: ipPortToMultiaddr(socket.remoteAddress, socket.remotePort),
    localAddr: multiaddr(`/ip4/127.0.0.1/tcp/${PORT}`),
    direction: 'inbound',
    log: defaultLogger().forComponent('noise-hfs:listener')
  })

  const { connection, remotePeer } = await noiseHfs.secureInbound(maConn)
  console.log(`PEER ${remotePeer}`)
  await sendGreeting(connection)
  await readGreeting(connection)
  console.log('INTEROP_OK')
  await connection.close()
}

main().then(() => exitAfterFlush(0), fail)
