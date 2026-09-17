/* eslint-disable no-console */
/**
 * Paired-sampling, multi-pass handshake benchmark.
 *
 * The existing harnesses measure each configuration in its own phase, so any
 * drift in machine state between phases lands directly in the ratio between
 * them. This one interleaves all four configurations within a single
 * iteration and rotates their order, so drift affects each equally and
 * largely cancels in the per-iteration ratio.
 *
 * It reports two things the paper needs to distinguish:
 *
 *   median-of-ratios: median over per-iteration ratios (the paired figure)
 *   ratio-of-medians: median(hybrid) / median(classical)
 *
 * These are not the same statistic and can differ materially when the
 * distributions are skewed, which is the case here.
 *
 *   node benchmarks/paired-passes.mjs [passes] [iterations]
 */

import { generateKeyPair } from '@libp2p/crypto/keys'
import { peerIdFromPrivateKey } from '@libp2p/peer-id'
import { defaultLogger } from '@libp2p/logger'
import { multiaddrConnectionPair } from '@libp2p/utils'
import { stubInterface } from 'sinon-ts'
import { noise } from '../dist/src/index.js'
import { noiseHFS } from '../dist/src/noise-hfs.js'
import { defaultCrypto } from '../dist/src/crypto/index.js'
import { pureJsCrypto } from '../dist/src/crypto/js.js'

const PASSES = Number(process.argv[2] ?? 5)
const ITERS = Number(process.argv[3] ?? 30)
const WARMUP = 5

const CONFIGS = {
  xxNative: () => noise(),
  xxPureJs: () => noise({ crypto: pureJsCrypto }),
  hfsNative: () => noiseHFS({ crypto: defaultCrypto }),
  hfsPureJs: () => noiseHFS()
}

function makeComponents (privateKey, peerId) {
  return {
    privateKey,
    peerId,
    logger: defaultLogger(),
    upgrader: stubInterface({ getStreamMuxers: () => new Map() }),
    metrics: undefined
  }
}

async function timeOne (factory, iPriv, iPeer, rPriv, rPeer) {
  const [outbound, inbound] = multiaddrConnectionPair()
  const init = factory()(makeComponents(iPriv, iPeer))
  const resp = factory()(makeComponents(rPriv, rPeer))
  const t0 = performance.now()
  await Promise.all([init.secureOutbound(outbound), resp.secureInbound(inbound)])
  return performance.now() - t0
}

function median (xs) {
  const v = [...xs].sort((a, b) => a - b)
  const m = v.length >> 1
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

const pct = (xs, p) => {
  const v = [...xs].sort((a, b) => a - b)
  return v[Math.min(v.length - 1, Math.floor((p / 100) * v.length))]
}

async function runPass (passIndex, keys) {
  const { iPriv, iPeer, rPriv, rPeer } = keys
  const names = Object.keys(CONFIGS)
  const samples = Object.fromEntries(names.map(n => [n, []]))

  for (let i = 0; i < ITERS; i++) {
    // Rotate the order each iteration so no configuration is systematically
    // advantaged by cache or JIT state left by the one before it.
    const order = names.slice(i % names.length).concat(names.slice(0, i % names.length))
    for (const name of order) {
      samples[name].push(await timeOne(CONFIGS[name], iPriv, iPeer, rPriv, rPeer))
    }
  }

  const medians = Object.fromEntries(names.map(n => [n, median(samples[n])]))

  // Paired per-iteration ratios: index i of each series comes from the same
  // iteration, so machine drift is common-mode and cancels.
  const paired = (a, b) => samples[a].map((v, i) => v / samples[b][i])
  const ratios = {
    likeForLikeNative: paired('hfsNative', 'xxNative'),
    likeForLikePureJs: paired('hfsPureJs', 'xxPureJs'),
    asReported: paired('hfsPureJs', 'xxNative')
  }

  const summary = { pass: passIndex, medians, medianOfRatios: {}, ratioOfMedians: {} }
  for (const [k, series] of Object.entries(ratios)) {
    summary.medianOfRatios[k] = median(series)
  }
  summary.ratioOfMedians.likeForLikeNative = medians.hfsNative / medians.xxNative
  summary.ratioOfMedians.likeForLikePureJs = medians.hfsPureJs / medians.xxPureJs
  summary.ratioOfMedians.asReported = medians.hfsPureJs / medians.xxNative
  summary.kemCostNative = medians.hfsNative - medians.xxNative
  summary.kemCostPureJs = medians.hfsPureJs - medians.xxPureJs
  summary.backendCost = medians.xxPureJs - medians.xxNative
  summary.spread = {
    xxNative: [pct(samples.xxNative, 5), pct(samples.xxNative, 95)]
  }
  return summary
}

async function main () {
  const iPriv = await generateKeyPair('Ed25519')
  const rPriv = await generateKeyPair('Ed25519')
  const keys = {
    iPriv, rPriv, iPeer: peerIdFromPrivateKey(iPriv), rPeer: peerIdFromPrivateKey(rPriv)
  }

  process.stderr.write(`warming up (${WARMUP})...\n`)
  for (let i = 0; i < WARMUP; i++) {
    for (const name of Object.keys(CONFIGS)) {
      await timeOne(CONFIGS[name], keys.iPriv, keys.iPeer, keys.rPriv, keys.rPeer)
    }
  }

  const passes = []
  for (let p = 1; p <= PASSES; p++) {
    process.stderr.write(`pass ${p}/${PASSES} (${ITERS} iterations x 4 configs)...\n`)
    passes.push(await runPass(p, keys))
  }

  const across = (get) => median(passes.map(get))
  const range = (get) => {
    const v = passes.map(get).sort((a, b) => a - b)
    return [v[0], v[v.length - 1]]
  }

  const report = {
    node: process.version,
    passes: PASSES,
    iterations: ITERS,
    perPass: passes,
    summary: {
      medians: Object.fromEntries(
        Object.keys(CONFIGS).map(n => [n, across(p => p.medians[n])])
      ),
      medianOfRatios: Object.fromEntries(
        ['likeForLikeNative', 'likeForLikePureJs', 'asReported']
          .map(k => [k, { median: across(p => p.medianOfRatios[k]), range: range(p => p.medianOfRatios[k]) }])
      ),
      ratioOfMedians: Object.fromEntries(
        ['likeForLikeNative', 'likeForLikePureJs', 'asReported']
          .map(k => [k, { median: across(p => p.ratioOfMedians[k]), range: range(p => p.ratioOfMedians[k]) }])
      ),
      kemCostNative: across(p => p.kemCostNative),
      kemCostPureJs: across(p => p.kemCostPureJs),
      backendCost: across(p => p.backendCost)
    }
  }

  console.log(JSON.stringify(report, null, 2))
}

main().catch(err => { console.error(err); process.exit(1) })
