# Benchmark results

`Noise_XXhfs_25519+ML-KEM-768_ChaChaPoly_SHA256` against classical `Noise_XX_25519_ChaChaPoly_SHA256`.

**Platform:** Node.js v22.17.1, Windows 11 Pro, win32 x64. One machine.
**Method:** `paired-passes.mjs`, 5 independent passes, 30 iterations each, medians per pass.
**Raw data:** `paired-passes-results.json`.

## The comparison has to be like for like

The obvious way to benchmark this is to time `noise()` against `noiseHFS()` and report the ratio.
That measurement is wrong, and it is wrong in a way that makes the post-quantum handshake look far
worse than it is.

`noise()` defaults to `defaultCrypto`, which is Node's native crypto plus an AssemblyScript WASM
backend. `noiseHFS()` defaults to `pureJsCrypto`, which is `@noble/*` with everything in
JavaScript. Timing one against the other changes **the KEM and the entire symmetric/DH backend at
the same time**, and then attributes the whole difference to the KEM.

So each pass measures all four cells and reports the ratios separately.

| | min | **median** | max |
|---|---:|---:|---:|
| classical XX, native backend | 6.49 | **6.82 ms** | 7.93 |
| classical XX, pure JS backend | 19.97 | **20.72 ms** | 23.65 |
| hybrid XXhfs, native backend | 10.17 | **10.30 ms** | 12.73 |
| hybrid XXhfs, pure JS backend | 23.65 | **24.15 ms** | 26.92 |

## The overhead of going post-quantum

| comparison | min | **median** | max |
|---|---:|---:|---:|
| **like for like, native backend** | 1.51x | **1.57x** | 1.61x |
| **like for like, pure JS backend** | 1.13x | **1.16x** | 1.18x |
| as commonly reported (hybrid pure JS vs classical native) | 3.40x | 3.54x | 3.64x |

**The honest figure is 1.13x to 1.61x depending on backend. The 3.5x figure is an artefact of
comparing two different backends.**

## Where the time actually goes

| cost | min | **median** | max |
|---|---:|---:|---:|
| the KEM itself, native backend | 3.48 | **3.68 ms** | 4.80 |
| the KEM itself, pure JS backend | 3.12 | **3.45 ms** | 3.68 |
| **the backend choice** | 13.48 | **14.11 ms** | 16.04 |

**Choosing a pure-JavaScript crypto backend costs about four times more than adding ML-KEM-768.**
The post-quantum primitive is not the expensive part of a post-quantum handshake in JavaScript.
That result should be read as an argument about where optimisation effort belongs, not as a claim
that the KEM is free.

## Wire sizes

Read directly from the interoperability test vectors in `../vectors/`, consistent across all five:

| message | classical XX | XXhfs | delta |
|---|---:|---:|---:|
| A, initiator to responder | 32 B | **1,216 B** | +1,184 B |
| B, responder to initiator | 96 B | **1,200 B** | +1,104 B |
| C, initiator to responder | 64 B | **64 B** | 0 |

Msg A carries the 1,184-byte ML-KEM-768 encapsulation key (`e1`); msg B carries the 1,088-byte
ciphertext plus its 16-byte AEAD tag (`ekem1`). Msg C is unchanged from classical XX.

## Limitations

- **One machine, one OS, one Node version.** Absolute milliseconds are indicative; the ratios are
  the claim.
- **Medians of 5 passes x 30 iterations.** The spread across passes is small (the like-for-like
  native ratio moves only between 1.51x and 1.61x), but this is a shared desktop, not an isolated
  benchmarking rig.
- **Handshake latency only.** This does not measure throughput after the handshake, memory, or
  behaviour under connection churn.
- **`@noble/post-quantum` does not claim constant-time execution.** Its own documentation notes
  that JIT compilation, garbage collection and bigint arithmetic do not provide the guarantees a
  formal constant-time claim needs. These numbers are performance measurements and say nothing
  about side-channel resistance.

## Re-running

```bash
# from a checkout of the implementation branch, after pnpm build
node benchmarks/paired-passes.mjs
```
