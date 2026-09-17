# Benchmark results

`Noise_XXhfs_25519+MLKEM768_ChaChaPoly_SHA256` against classical `Noise_XX_25519_ChaChaPoly_SHA256`.

**Platform:** Node.js v22.17.1, Windows 11 Pro, win32 x64. One machine.
**Method:** `paired-passes.mjs`, 5 independent passes, 30 iterations each, medians per pass.
**Raw data:** `benchmarks/2026-09-17/js-paired-passes.json` (this run); `paired-passes-results.json`
(prior run, retained for the 2026-09-10 comparison figures below).
**Last refreshed:** 2026-09-17, alongside paired Python, Nim and Rust runs in the same session.
See `benchmarks/2026-09-17/SUMMARY.md` for the full cross-language write-up and sampling method
per language.

**The whole machine was slower on 2026-09-17 than on 2026-09-10, across every language, before
any ratio is taken.** AC power was confirmed on (`Win32_Battery.BatteryStatus=2`), power plan
Balanced, same as recorded for the prior session; the cause of the slowdown is not established.
Absolute medians: JS classical (native) 6.82 -> 15.40 ms (2.26x), JS hybrid (native)
10.30 -> 24.10 ms (2.34x); Python classical 1.60 -> 3.35 ms (2.09x), Python hybrid
17.07 -> 40.08 ms (2.35x), Python 1 KB post-handshake throughput 15.3 -> 8.9 MB/s (roughly
halved); Rust classical 0.888 -> 1.57 ms (1.77x). Nim's slowdown was much smaller (classical
2.943 -> 3.667 ms, 1.25x; hybrid 3.356 -> 4.358 ms, 1.30x, 8 Sept session against 2026-09-17).
Because KEM cost and non-KEM cost need not scale together under whatever changed, **the
classical-vs-hybrid ratios in this run may not be directly comparable to the 2026-09-10 ones**,
even though each ratio is internally sound (computed within the same session, same machine
state, for both halves of its own comparison). This is not a footnote: read the numbers below
with it in mind.

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

The 32.9 ms gap between the two default configurations (hybrid pure-JS 48.25 ms vs classical
native 15.40 ms) decomposes, per pass then medianed, into about 6.7 ms of KEM cost within the
pure-JS backend (`kemCostPureJs`) and about 26.9 ms of backend substitution (`backendCost`,
pure-JS classical minus native classical) — together about 33.6 ms, close to the 32.9 ms gap; the
small residual is because a median of per-pass differences is not the same number as the
difference of two medians. Holding the *native* backend constant on both sides instead gives a
different quantity, the native-backend KEM cost: about 8.6 ms, roughly 36% of the 24.10 ms native
hybrid handshake. These two KEM-cost figures (6.7 ms pure-JS, 8.6 ms native) are not the same
measurement and should not be added to each other.

**KEM share, one method throughout.** Every KEM-share figure below is `(hybrid_ms -
classical_ms) / hybrid_ms` (the "delta method"), matching Research Paper §7.7/§7.9. This is a
change from an earlier draft of this file, which mixed that method with others (a standalone
KEM-microbenchmark-over-hybrid ratio for Nim, and a ratio-of-medians-of-per-pass-fractions for a
different Nim figure) and reported a large Python "shift" that was actually a formula
difference, not a finding — see `benchmarks/2026-09-17/SUMMARY.md` for the recomputation.

For context across implementations of the same protocol, each with its own backend held constant.
Figures below are all from the 2026-09-17 session (see `benchmarks/2026-09-17/SUMMARY.md` for raw
data and sampling method per language); the 2026-09-10 (8 Sept for Nim) values are recomputed by
the same delta method from the paper's own medians, for comparison:

| | overhead (2026-09-10) | overhead (2026-09-17) | KEM share, delta method (2026-09-10) | KEM share, delta method (2026-09-17) |
|---|---:|---:|---:|---:|
| Python (`kyber-py`) | 10.7x | **12.0x** (range 11.3-12.4) | ~91% (15.47/17.07) | ~92% (36.73/40.08) |
| **JavaScript** (`@noble/post-quantum`) | 1.51x | **1.56x** (range 1.51-1.60) | ~34% (3.48/10.30) | ~36% (8.70/24.10) |
| Rust (RustCrypto `ml-kem`) | 1.24x | **1.32x** (range 1.23-1.61) | ~19% (0.211/1.099), upper bound | ~20% (0.39/1.96), upper bound |
| Nim (BoringSSL) | 1.13x | **1.19x** (range 1.16-1.21) | ~12%\* (0.413/3.356) | ~16% (0.691/4.358) |

\* Nim's paper-published figure for 8 Sept was ~8.2%, computed by a different method (standalone
KEM round-trip microbenchmark / hybrid handshake, 0.274/3.356). Recomputed here by the delta
method for consistency with the rest of this table, 8 Sept gives ~12.3%. For continuity with the
paper's own method, the 2026-09-17 harness's own per-pass "KEM fraction of XXhfs time" printout
(same standalone method) has a five-pass median of 9.5% (values 8.9%, 8.9%, 9.5%, 12.2%, 13.0%).
The three Python, JS and Rust rows use the same method the paper already used, so no comparable
restatement is needed for them.

Every overhead ratio moved from 2026-09-10, each by a different amount: JS +0.05x (~+3%), Rust
+0.08x (~+6.5%), Nim +0.06x (~+5%), Python +1.3x (~+12%, the largest). None moved toward making
the post-quantum handshake look cheaper. Under the one consistent (delta) method, KEM share moved
far less than an earlier draft of this file claimed: Python is effectively unchanged (~91%->~92%),
as are JS (~34%->~36%) and Rust (~19%->~20%); Nim's is the one KEM-share figure with a real move,
~12%->~16% delta-method (or ~8.2%->~9.5% by the paper's original standalone method) — a real but
modest shift, not the "largest single shift" an earlier draft attributed to Python by comparing
two different formulas. See `benchmarks/2026-09-17/SUMMARY.md` for the Nim pass-to-pass latency
swing and Rust's per-pass spread.

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
