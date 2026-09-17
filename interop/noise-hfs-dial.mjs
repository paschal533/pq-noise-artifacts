#!/usr/bin/env node
/**
 * Reference copy of js-libp2p-noise/scripts/noise-hfs-dial.mjs at commit
 * c8a07cf (branch js-mlkem768-rename, worktree wt-js-rename). Kept here for
 * reference only — run-matrix.sh invokes the JS repo's own copy via JS_DIR,
 * not this file. Run from inside js-libp2p-noise (or a worktree of it), not
 * from pq-noise-artifacts.
 */
/**
 * Interop dialer (initiator) for Noise_XXhfs_25519+MLKEM768_ChaChaPoly_SHA256
 * (/noise-mlkem768-hfs/0.2.0). Reads the listener's greeting, replies, prints
 * INTEROP_OK. Stdout contract: see interop-io.mjs.
 *
 *   node scripts/noise-hfs-dial.mjs [--port N]   (default 9999)
 */
import net from 'net'
import { generateKeyPair } from '@libp2p/crypto/keys'
import { defaultLogger } from '@libp2p/logger'
import { peerIdFromPrivateKey } from '@libp2p/peer-id'
import { ipPortToMultiaddr } from '@libp2p/utils'
import { multiaddr } from '@multiformats/multiaddr'
import { TCPSocketConnection, parsePort, createNoiseHFS, sendGreeting, readGreeting, fail, exitAfterFlush } from './interop-io.mjs'

async function main () {
  const PORT = parsePort(process.argv.slice(2), 9999)
  const privateKey = await generateKeyPair('Ed25519')
  const peerId = peerIdFromPrivateKey(privateKey)
  const noiseHfs = createNoiseHFS(privateKey, peerId)
  console.log(`LOCAL ${peerId}`)

  const socket = net.createConnection(PORT, '127.0.0.1')
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject) })

  const maConn = new TCPSocketConnection({
    socket,
    remoteAddr: ipPortToMultiaddr(socket.remoteAddress, socket.remotePort),
    localAddr: multiaddr(`/ip4/127.0.0.1/tcp/${socket.localPort}`),
    direction: 'outbound',
    log: defaultLogger().forComponent('noise-hfs:dialer')
  })

  const { connection, remotePeer } = await noiseHfs.secureOutbound(maConn)
  console.log(`PEER ${remotePeer}`)
  await readGreeting(connection)
  await sendGreeting(connection)
  console.log('INTEROP_OK')
  await connection.close()
}

main().then(() => exitAfterFlush(0), fail)
