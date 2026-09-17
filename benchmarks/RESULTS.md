# Benchmark results

`Noise_XXhfs_25519+MLKEM768_ChaChaPoly_SHA256` against classical `Noise_XX_25519_ChaChaPoly_SHA256`.

**Platform:** Node.js v22.17.1, Windows 11 Pro, win32 x64. One machine.
**Method:** `paired-passes.mjs`, 5 independent passes, 30 iterations each, medians per pass.
**Raw data:** `benchmarks/2026-09-17/js-paired-passes.json` (this run).
**Last refreshed:** 2026-09-17, alongside paired Python, Nim and Rust runs in the same session.
See `benchmarks/2026-09-17/SUMMARY.md` for the full cross-language write-up, the sampling method
per language, and the reference table of previously published figures with their sources.

This document reports this run's own figures throughout. It makes no claim about how any figure
here compares to an earlier session's, except in one clearly separated section near the end
("Previous session, for reference") that states each earlier value's own source and statistic
with no delta computed against it. AC power was checked after this run (not during) and found on
(`Win32_Battery.BatteryStatus=2`); no AC-power or power-plan record exists from any earlier
session to compare against.

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

(min/median/max of the five pass-level medians, this run; see `benchmarks/2026-09-17/js-paired-passes.json`)

## The overhead of going post-quantum

| comparison | overhead |
|---|---:|
| default configurations, backend varies with the KEM | 3.24x (per-pass range 3.19 to 3.52) |
| **like for like, backend held constant** | **1.56x** (per-pass range 1.51 to 1.60) |

The 32.9 ms gap between the two default configurations (hybrid pure-JS 48.25 ms vs classical
native 15.40 ms) decomposes, per pass then medianed, into about 6.7 ms of KEM cost within the
pure-JS backend (`kemCostPureJs`) and about 26.9 ms of backend substitution (`backendCost`,
pure-JS classical minus native classical) -- together about 33.6 ms, close to the 32.9 ms gap;
the residual exists because a median of per-pass differences is not the same number as the
difference of two medians. Holding the *native* backend constant on both sides instead gives a
different quantity, the native-backend KEM cost: about 8.6 ms (`kemCostNative`, the median of the
5 per-pass native-hybrid-minus-native-classical differences), roughly 36% of the 24.10 ms native
hybrid handshake. The KEM-share table further down instead uses 8.70 ms for a related quantity,
the *difference of the two pass-median figures* (24.10 - 15.40); the two do not agree to the
decimal for the same reason the 32.9 ms gap above does not exactly equal 6.7 + 26.9. These
KEM-cost figures (6.7 ms pure-JS-backend, 8.6 ms and 8.70 ms native-backend by two statistics)
are not interchangeable and should not be added to each other.

**KEM share, one method, this run only.** Every KEM-share figure below is `(hybrid_ms -
classical_ms) / hybrid_ms` (the delta method), matching Research Paper Sec 7.7/7.9's own
approach for JS, Python and Rust. All values are from this run's own raw files; none is compared
to any other session in this table:

| | overhead, this run | KEM share, this run (delta method) |
|---|---:|---:|
| Python (`kyber-py`) | 12.0x (range 11.3-12.4) | ~92% (36.73/40.08) |
| **JavaScript** (`@noble/post-quantum`) | 1.56x (range 1.51-1.60) | ~36% (8.70/24.10) |
| Rust (RustCrypto `ml-kem`) | 1.32x (range 1.23-1.61) | ~20% (0.39/1.96), upper bound |
| Nim (BoringSSL) | 1.19x (range 1.16-1.21) | per pass 17.5%, 17.3%, 14.1%, 15.0%, 15.9% (median 15.9%) |

Nim's per-pass values come from each pass's own classical/hybrid medians in `nim-pass1.txt`
through `nim-pass5.txt`, rather than a single pass-median-of-medians figure, because its harness
also reports a differently-computed "KEM fraction of XXhfs time" (a standalone microbenchmark
divided by the hybrid handshake, not the delta method): 8.9%, 8.9%, 9.5%, 12.2%, 13.0% across the
5 passes (median 9.5%), included in `benchmarks/2026-09-17/SUMMARY.md`. Rust's KEM share is an
upper bound because its harness has no standalone KEM microbenchmark, so the whole classical-to-
hybrid delta is attributed to the KEM.

A lower ratio is not automatically better. Nim's is partly a larger denominator: only its KEM
reaches BoringSSL, while its classical primitives come from BearSSL and pure Nim.

The native backend is the one reported for JavaScript because it is what a deployment would
actually use, and because it makes the figure comparable with the other rows in this table.
Holding the *pure-JavaScript* backend constant on both sides gives a lower ratio again, but
comparing an unoptimised JavaScript stack against optimised ones would not be meaningful.

## Previous session, for reference (not directly comparable)

| Language | Date | Metric | Value | Statistic | Source |
|---|---|---|---:|---|---|
| JavaScript | 2026-09-10 | Classical, native | 6.82 ms | median, 5 passes | research-paper.md:692-696 (Sec 7.3) |
| JavaScript | 2026-09-10 | Hybrid, native | 10.30 ms | median, 5 passes | research-paper.md:710 (Sec 7.3) |
| JavaScript | 2026-09-10 | Overhead, like-for-like native | 1.51x, range 1.51-1.58 | median-based ratio, precision across 5 passes | research-paper.md:890-891 (Sec 7.9) |
| JavaScript | 2026-09-10 | KEM share | ~34% | as published | research-paper.md:893, 908 (Sec 7.9) |
| Python | 2026-09-10 | Classical | 1.60 ms | median | research-paper.md:841 (Sec 7.7) |
| Python | 2026-09-10 | Hybrid | 17.07 ms | median | research-paper.md:842 (Sec 7.7) |
| Python | 2026-09-10 | Overhead | 10.7x | ratio of medians, single run | research-paper.md:843, 890 (Sec 7.7/7.9) |
| Python | 2026-09-10 | KEM share | ~91% | as published | research-paper.md:893, 845, 906 (Sec 7.9/7.7) |
| Rust | 2026-09-10 | Classical | 0.888 ms | criterion point estimate | research-paper.md:659 (Sec 7.1), table at 872 (Sec 7.8) |
| Rust | 2026-09-10 | Hybrid | 1.099 ms | criterion point estimate | research-paper.md:659 (Sec 7.1), table at 873 (Sec 7.8) |
| Rust | 2026-09-10 | Overhead | 1.24x | as published (Sec 7.8 table, research-paper.md:866-874) | research-paper.md:874, 890 |
| Rust | 2026-09-10 | KEM share | ~19%, upper bound | as published | research-paper.md:893 (Sec 7.9) |
| Nim | 8 Sept 2026 | Classical | 2.943 ms | median, paired, 5 passes | research-paper.md:862 (Sec 7.8) |
| Nim | 8 Sept 2026 | Hybrid | 3.356 ms | median, paired, 5 passes | research-paper.md:863 (Sec 7.8) |
| Nim | 8 Sept 2026 | Overhead | 1.13x, range 1.12-1.14 | median-based ratio, precision across 5 passes | research-paper.md:890-891 (Sec 7.9) |
| Nim | 8 Sept 2026 | KEM share | ~8% | as published (standalone KEM microbenchmark / hybrid handshake) | research-paper.md:893 (Sec 7.9) |

No delta or percentage change is computed between this table and this run's figures elsewhere in
this document. Reasons: this run's absolute latencies differ from the 2026-09-10 session's by
roughly a factor of two for JS, Python and Rust; the paper separately documents day-to-day drift
of a similar size on this same machine (research-paper.md:651); and the Python figures span a
sampling-method change (2026-09-10 ran classical and hybrid handshakes in separate phases, this
run's harness -- built in this task's Step 1 -- interleaves them per iteration). The full timing
comparison, with each pair using the same statistic on both sides, is in
`benchmarks/2026-09-17/SUMMARY.md`.

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
ciphertext plus its 16-byte AEAD tag (`ekem1`). Msg C is identical to classical XX.

## Limitations

- **One machine, one OS, one Node version.** Absolute milliseconds are indicative; the ratios are
  the claim.
- **Medians of 5 passes x 30 iterations.** The like-for-like native ratio spans 1.51x to 1.60x
  across this run's 5 passes, but this is a shared desktop, not an isolated benchmarking rig.
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
