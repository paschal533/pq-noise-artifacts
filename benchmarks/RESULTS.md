# Benchmark results

`Noise_XXhfs_25519+MLKEM768_ChaChaPoly_SHA256` against classical `Noise_XX_25519_ChaChaPoly_SHA256`.

**Platform:** Node.js v22.17.1, Windows 11 Pro, win32 x64. One machine.
**Method:** `paired-passes.mjs`, 5 independent passes, 30 iterations each, medians per pass.
**Raw data:** `benchmarks/2026-09-17/js-paired-passes.json` (this run); `paired-passes-results.json`
(prior run, retained for the 2026-09-10 comparison figures below).
**Last refreshed:** 2026-09-17, alongside paired Python, Nim and Rust runs in the same session.
See `benchmarks/2026-09-17/SUMMARY.md` for the full cross-language write-up and sampling method
per language.

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
| classical XX, native backend | 12.86 | **15.40 ms** | 18.52 |
| classical XX, pure JS backend | 36.70 | **42.45 ms** | 50.75 |
| hybrid XXhfs, native backend | 20.10 | **24.10 ms** | 27.92 |
| hybrid XXhfs, pure JS backend | 43.38 | **48.25 ms** | 61.00 |

(min/median/max of the five pass-level medians, 2026-09-17 run; see `benchmarks/2026-09-17/js-paired-passes.json`)

## The overhead of going post-quantum

| comparison | overhead |
|---|---:|
| default configurations, backend varies with the KEM | 3.24x (per-pass range 3.19 to 3.52) |
| **like for like, backend held constant** | **1.56x** (per-pass range 1.51 to 1.60) |

Of the 32.9 ms separating the two default configurations (hybrid pure-JS vs classical native), about
27.0 ms (82%) is the backend substitution and about 8.6 ms is the KEM, roughly 36% of the hybrid
(native) handshake.

For context across implementations of the same protocol, each with its own backend held constant.
Figures below are all from the 2026-09-17 session (see `benchmarks/2026-09-17/SUMMARY.md` for raw
data and sampling method per language); the 2026-09-10 values are kept alongside for comparison:

| | overhead (2026-09-10) | overhead (2026-09-17) | KEM share of the hybrid handshake (2026-09-17) |
|---|---:|---:|---:|
| Python (`kyber-py`) | 10.7x | **12.0x** (range 11.3-12.4) | ~68% |
| **JavaScript** (`@noble/post-quantum`) | 1.51x | **1.56x** (range 1.51-1.60) | ~36% |
| Rust (RustCrypto `ml-kem`) | 1.24x | **1.32x** (range 1.23-1.61) | ~20%, an upper bound |
| Nim (BoringSSL) | 1.13x | **1.19x** (range 1.16-1.21) | ~12% |

Every 2026-09-17 ratio shifted upward from 2026-09-10; none moved in the direction of making the
post-quantum handshake look cheaper. The largest single shift is Python's KEM share, which fell
from ~91% to ~68% of the hybrid handshake even as its overhead ratio rose — the absolute
handshake latency and its composition both moved, not just the ratio, and this is reported as a
finding rather than reconciled here. See the anomalies section of `benchmarks/2026-09-17/SUMMARY.md`
for the fuller discussion, including the Nim run's ~60% pass-to-pass swing in absolute latency and
Rust's wide 1.23x-1.61x per-pass spread.

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
  native ratio moves only between 1.51x and 1.60x, 2026-09-17 run), but this is a shared desktop,
  not an isolated benchmarking rig.
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
