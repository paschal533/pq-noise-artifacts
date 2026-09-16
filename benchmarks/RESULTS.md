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

| comparison | overhead |
|---|---:|
| default configurations, backend varies with the KEM | 3.54x (per-pass range 3.40 to 3.64) |
| **like for like, backend held constant** | **1.51x** (per-pass range 1.51 to 1.58) |

Of the 17.3 ms separating the two default configurations, over four fifths is the backend
substitution and only about 3.5 ms is the KEM, roughly 34% of the hybrid handshake.

For context across implementations of the same protocol, each with its own backend held constant:

| | overhead | KEM share of the hybrid handshake |
|---|---:|---:|
| Python (`kyber-py`) | 10.7x | ~91% |
| **JavaScript** (`@noble/post-quantum`) | **1.51x** | ~34% |
| Rust (RustCrypto `ml-kem`) | 1.24x | ~19%, an upper bound |
| Nim (BoringSSL) | 1.13x | ~8% |

A lower ratio is not automatically better. Nim's is partly a larger denominator: only its KEM
reaches BoringSSL, while its classical primitives come from BearSSL and pure Nim.

The native backend is the one reported for JavaScript because it is what a deployment would
actually use, and because it makes the figure comparable with the rows above. Holding the *pure-JavaScript* backend constant on both sides
gives a lower ratio again, but comparing an unoptimised JavaScript stack against optimised ones
would not be meaningful.

## Wire sizes

Read directly from the interoperability test vectors in `../vectors/`, consistent across all five:

| message | classical XX | XXhfs | delta |
|---|---:|---:|---:|
| A, initiator to responder | 32 B | **1,216 B** | +1,184 B |
| B, responder to initiator | 96 B | **1,200 B** | +1,104 B |
| C, initiator to responder | 64 B | **64 B** | 0 |
| **total** | **192 B** | **2,480 B** | **+2,288 B** |

Every message fits inside a standard 1,500-byte MTU: the largest, Message A at 1,216 bytes plus
libp2p's two-byte length prefix, sits below the 1,460-byte maximum segment size. The hybrid
handshake adds no IP fragmentation and no additional round trip.

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
