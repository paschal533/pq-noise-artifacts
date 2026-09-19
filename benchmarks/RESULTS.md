# Benchmark results

`Noise_XXhfs_25519+MLKEM768_ChaChaPoly_SHA256` against classical `Noise_XX_25519_ChaChaPoly_SHA256`.

**Platform:** Node.js v22.17.1, Windows 11 Pro, win32 x64. One machine.
**Method:** `paired-passes.mjs`, 5 independent passes, 30 iterations each, medians per pass.
**Raw data:** `benchmarks/2026-09-17/js-paired-passes.json` (this run).
**Last refreshed:** 2026-09-17, alongside paired Python, Nim and Rust runs in the same session.
See `benchmarks/2026-09-17/SUMMARY.md` for the full cross-language write-up, the sampling method
per language, and the reference table of previously published figures with their sources.

This document reports this run's own figures throughout. Previously published figures appear only
in one reference table near the end ("Previously published figures (not directly comparable)"),
each with its date, its line in `research-paper.md` and the paper's own wording for its statistic;
no delta, ratio or factor is computed against them. AC power was checked after this run (not
during) and found on (`Win32_Battery.BatteryStatus=2`); no AC-power or power-plan record exists
from any earlier session.

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

**Overhead and KEM share, this run only.** Every KEM-share figure below is `(hybrid_ms -
classical_ms) / hybrid_ms` (the delta method). All values are from this run's own raw files, and
each row names the statistic behind each input:

| | overhead, this run | overhead statistic | KEM share, this run (delta method) | KEM-share inputs |
|---|---:|---|---:|---|
| Python (`kyber-py`, the default until 2026-09-19) | 12.0x (range 11.3-12.4) | median and range of the 5 per-pass values, each the median of 50 paired per-iteration ratios | ~92% (36.73/40.08) | 40.08 and 3.35 ms: medians of the 5 per-pass handshake medians |
| **JavaScript** (`@noble/post-quantum`) | 1.56x (range 1.51-1.60) | median and range of the 5 per-pass values, each the median of 30 per-iteration ratios, native backend on both sides | ~36% (8.70/24.10) | 24.10 and 15.40 ms: medians of the 5 pass-level medians, native backend |
| Rust (RustCrypto `ml-kem`) | 1.32x (range 1.23-1.61) | median and range of the 5 per-pass ratios of `estimates.json` medians (via `rust-passes.tsv`) | ~20% (0.39/1.96), upper bound | 1.96 and 1.57 ms: medians of the 5 per-pass `estimates.json` medians (via `rust-passes.tsv`) |
| Nim (BoringSSL) | 1.19x (range 1.16-1.21) | median and range of the 5 per-pass ratios of the hybrid median to the classical median | per pass 17.5%, 17.3%, 14.1%, 15.0%, 15.9% (median 15.9%) | each pass's own classical and hybrid harness medians (`nim-pass1.txt` through `nim-pass5.txt`), one share per pass |

**Update, 2026-09-19: the Python row above is a `kyber-py` measurement and the backend has since
changed.** py-libp2p `c8d16e63` makes `MLKEM768NativeKem` the default, reaching ML-KEM-768 in C
through the `cryptography` package (OpenSSL 3.5+, AWS-LC or BoringSSL), with `kyber-py` kept as a
pure-Python fallback behind a warning. Both backends were then measured as alternating paired
arms of a single session, four passes of thirty iterations, each pass interleaving classical and
hybrid handshakes with the leading protocol alternating:

| Python arm | classical `Noise_XX` | hybrid `Noise_XXhfs` | overhead | KEM share (delta method) |
|---|---:|---:|---:|---:|
| `kyber-py` (pure Python) | 2.25 to 2.30 ms | 24.73 to 25.31 ms | 10.76x to 10.87x | ~91% |
| `MLKEM768NativeKem` (C-backed) | 2.05 to 2.21 ms | 2.99 to 3.15 ms | **1.42x to 1.44x** | ~30% |

Ranges are the two pass medians for that arm; the overhead is the median of the per-iteration
paired ratios within each pass. The `kyber-py` arm is the control: it returns 10.76x and 10.87x
against the 10.7x published on 2026-09-10, and ~91% against the published ~91%, which is what
makes this a before and after of one change rather than two benchmarks on two days. It does not
reproduce this file's own 12.0x above, and should not be expected to: that figure is a different
session, a different sampling design and a machine running roughly half as fast in absolute
terms (this run's classical Python handshake is 3.35 ms against 2.25 to 2.30 ms here).

**The KEM microbenchmarks are unstable in both absolute terms and ratio.** Across four
measurement sessions the C-backed-to-`kyber-py` ratio on an encapsulate-plus-decapsulate round
trip came out at 33x, 37x, 38x and 43x, while `kyber-py`'s own absolute round trip swung by
roughly a factor of two within a single day: about 16.6 ms in the block adjacent to the paired
passes, against 34.8 ms in a later block the same day (0.45 ms and 0.91 ms C-backed
respectively). The ratio should be read as one to two orders of magnitude, not as a figure. An
earlier one-off probe reported 47.8x; it does not reproduce and is withdrawn.

An earlier version of this section claimed the absolute milliseconds moved with the machine
while the ratio did not. That was inferred from the two blocks above, which happen to agree at
37x and 38x; the 33x and 43x sessions show it does not hold, and the claim is withdrawn. The
paired *handshake* ratios are a different matter and are stable: 1.42x to 1.44x and 10.76x to
10.87x across their passes, because each arm carries its own classical baseline within the same
pass.

Nothing on the wire changes: both backends produce a 1,184-byte encapsulation key, a 1,088-byte
ciphertext and a 32-byte shared secret, a ciphertext from either decapsulates to the same shared
secret under the other, and the interop matrix re-ran at 48 of 48 with the C-backed backend on
the Python side (`interop/results/20260919T223056Z/`, which supersedes `20260919T110704Z`; both
ran the C-backed backend, and the later one also records fetchable `versions.txt` provenance).

Nim's harness separately prints a "KEM fraction of XXhfs time", computed by a different method (a
standalone KEM microbenchmark divided by the hybrid handshake, not the delta method): 13.0%,
12.2%, 8.9%, 8.9%, 9.5% for passes 1-5 (median 9.5%), also listed in
`benchmarks/2026-09-17/SUMMARY.md`. Rust's KEM share is an upper bound because its harness has no
standalone KEM microbenchmark, so the whole classical-to-hybrid delta is attributed to the KEM.

A lower ratio is not automatically better. Nim's is partly a larger denominator: only its KEM
reaches BoringSSL, while its classical primitives come from BearSSL and pure Nim.

The native backend is the one reported for JavaScript because it is what a deployment would
actually use, and because it makes the figure comparable with the other rows in this table.
Holding the *pure-JavaScript* backend constant on both sides gives a lower ratio again, but
comparing an unoptimised JavaScript stack against optimised ones would not be meaningful.

## Previously published figures (not directly comparable)

Published values, their statistics and their line numbers are from `research-paper.md`; the line
numbers refer to its 14 September 2026 draft and differ in later versions. Each
statistic is quoted in the paper's own words, or given as "as published" where the paper does not
name one. The "This run" columns are filled only for absolute handshake latencies; this run's
overhead and KEM-share figures are in the tables above and are not repeated beside the published
ones.

| Language | Metric | Published date | Published value | Statistic, as the paper words it | Paper line | This run, 2026-09-17 | This run's statistic |
|---|---|---|---:|---|---|---:|---|
| JavaScript | Classical handshake, native backend | 2026-09-10 | 6.82 ms | "Medians across five serial passes" (:692); the same value also appears in the table introduced as "Medians of thirty iterations, four repetitions" (:703) | :696, :707 | 15.40 ms | median of the 5 pass-level medians (`summary.medians.xxNative`, `js-paired-passes.json`) |
| JavaScript | Hybrid handshake, native backend | 2026-09-10 | 10.30 ms | "Medians of thirty iterations, four repetitions" (:703) | :710 | 24.10 ms | median of the 5 pass-level medians (`summary.medians.hfsNative`, `js-paired-passes.json`) |
| JavaScript | Like-for-like overhead | 2026-09-10 | 1.51x | as published in the 14 September draft; its "Precision" row read "1.51–1.58 (5 passes)" (:891), which quoted the median-of-per-iteration-ratios spread under a ratio-of-medians headline and was corrected to "1.51–1.61 (5 passes)" on 17 September | :890, :891 | -- | -- |
| JavaScript | KEM share of XXhfs | 2026-09-10 | ~34% | as published | :893 | -- | -- |
| Python | Classical handshake | 2026-09-10 | 1.60 ms | "Medians across five serial passes" (:833); column header "Median ms/op" (:835) | :841 | 3.35 ms | median of the 5 per-pass medians (`python-pass1.txt` through `python-pass5.txt`; each a median over 50 handshakes) |
| Python | Hybrid handshake | 2026-09-10 | 17.07 ms | "Medians across five serial passes" (:833); column header "Median ms/op" (:835) | :842 | 40.08 ms | median of the 5 per-pass medians (as for classical) |
| Python | Overhead | 2026-09-10 | 10.7x | "XXhfs overhead vs classical" (:843); "the quotient of two medians from a single invocation" (:849); "Precision" row reads "single run" (:891) | :843, :849, :890, :891 | -- | -- |
| Python | KEM share of XXhfs | 2026-09-10 | ~91% | as published; worded as "approximately 91% of the 17.07 ms total" (:845) | :845, :893 | -- | -- |
| Rust | Classical handshake | 2026-09-10 | 0.888 ms | criterion point estimate: "the point estimates are quoted here" (:659) | :868, :872 | 1.57 ms | median of the 5 per-pass `estimates.json` medians (`median.point_estimate`), via `rust-passes.tsv` |
| Rust | Hybrid handshake | 2026-09-10 | 1.099 ms | criterion point estimate: "the point estimates are quoted here" (:659) | :868, :873 | 1.96 ms | median of the 5 per-pass `estimates.json` medians (`median.point_estimate`), via `rust-passes.tsv` |
| Rust | Overhead | 2026-09-10 | 1.24x | as published | :874, :890 | -- | -- |
| Rust | KEM share of XXhfs | 2026-09-10 | ~19% | as published; footnote: "an upper bound rather than a measurement" (:896) | :893, :896 | -- | -- |
| Nim | Classical handshake | 2026-09-08 | 2.943 ms | "Medians across five serial passes of the 8 September session" (:857) | :862 | 3.67 ms | median of the 5 per-pass harness medians ("classical XX median", `nim-pass1.txt` through `nim-pass5.txt`) |
| Nim | Hybrid handshake | 2026-09-08 | 3.356 ms | "Medians across five serial passes of the 8 September session" (:857) | :863 | 4.36 ms | median of the 5 per-pass harness medians ("XXhfs median", `nim-pass1.txt` through `nim-pass5.txt`) |
| Nim | Overhead | 2026-09-08 | 1.127x (range 1.117–1.141) | "Paired overhead" (:864); also given as 1.13x with "Precision" "1.12–1.14 (5 passes)" (:890, :891) | :864, :890, :891 | -- | -- |
| Nim | KEM share of XXhfs | 2026-09-08 | ~8% | as published; worded as "approximately 8.2% of hybrid handshake time" (:866) | :866, :893 | -- | -- |

Every value in the "This run" column is higher than the published value in the same row. No
delta, ratio or factor between a published value and a figure from this run is computed anywhere in
this document, and it is not claimed that any published value was computed with the same statistic as
the corresponding figure from this run. The paper itself states that "absolute latencies are not
comparable between the two sessions" and that "this machine ran roughly twice as fast on 10
September as on 8 September, which is well within the drift documented below"
(research-paper.md:651). The paper's "Paired sampling" row reads "no" for Python (:892); this
run's Python harness, as revised shortly before this session (py-libp2p `2ffbe408`), interleaves
the classical and hybrid handshakes per iteration.

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
