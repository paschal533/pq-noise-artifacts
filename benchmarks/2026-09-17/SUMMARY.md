# Benchmark summary, 2026-09-17

One machine, one session, strictly serial (JS, then Python, then Nim, then Rust; nothing else
running concurrently, except one discarded Rust confirmation run -- see Anomalies). Protocol under
test in all four: Noise_XXhfs_25519+MLKEM768_ChaChaPoly_SHA256 (/noise-mlkem768-hfs/0.2.0)
against classical Noise_XX_25519_ChaChaPoly_SHA256. Raw files for every pass are in this
directory; every figure below is read from them, not recomputed by eye.

Machine: Intel(R) Core(TM) i7-8665U CPU @ 1.90GHz, Windows 11 Pro, Balanced power plan, AC
power confirmed on (Win32_Battery.BatteryStatus=2) -- see machine.txt. Session ran
2026-09-17T02:50:40Z to 2026-09-17T03:04:11Z (UTC throughout this document).

## The whole machine was slower than on 2026-09-10 -- read this before the ratios below

Every absolute median in this run is higher than the corresponding 2026-09-10 (8 Sept for Nim)
figure, for every language, before any classical-vs-hybrid ratio is even computed:

| Metric | 2026-09-10 (8 Sept, Nim) | 2026-09-17 | Factor |
|---|---:|---:|---:|
| JS classical, native backend | 6.82 ms | 15.40 ms | 2.26x |
| JS hybrid, native backend | 10.30 ms | 24.10 ms | 2.34x |
| Python classical | 1.60 ms | 3.35 ms | 2.09x |
| Python hybrid | 17.07 ms | 40.08 ms | 2.35x |
| Python throughput, 1 KB, classical | 15.3 MB/s | 8.9 MB/s | 0.58x (roughly halved) |
| Rust classical | 0.888 ms | 1.57 ms | 1.77x |
| Nim classical | 2.943 ms | 3.667 ms | 1.25x |
| Nim hybrid | 3.356 ms | 4.358 ms | 1.30x |

AC power was confirmed on and the power plan (Balanced) matches the prior session as recorded;
the cause of the slowdown is not established -- this table reports what changed, not why.
Nim's slowdown is markedly smaller than the other three languages', which is a fact worth noting,
not a diagnosis.
Because KEM cost and non-KEM cost are not guaranteed to scale together under whatever changed,
the classical-vs-hybrid overhead ratios below may not be directly comparable to the 2026-09-10
ones, even though each ratio is internally sound -- both halves of any one ratio were measured
in the same session, on the same machine state. This caveat applies to every ratio and every
KEM-share figure in this document.

## Results

| Language | KEM library | Classical (ms, median of pass medians) | Hybrid (ms, median of pass medians) | Overhead, median | Overhead, range (min-max across passes) | Passes x iterations | Sampling |
|---|---|---:|---:|---:|---:|---|---|
| JavaScript | @noble/post-quantum 0.6.0 | 15.40 | 24.10 | 1.56x | 1.51-1.60x | 5 x 30 | Per-iteration paired (both protocols interleaved, order rotated each iteration), backend held constant (native); per-pass value is the median of the 30 per-iteration ratios; the table reports the median and range of the 5 pass-level medians. |
| Python | kyber-py 1.2.0 (pure Python) | 3.35 | 40.08 | 12.0x | 11.3-12.4x | 5 x 50 | Per-iteration interleaved as of this task's Step 1 (alternating which protocol runs first each iteration, fresh keys per handshake); per-pass value is the median of the 50 per-iteration ratios; the table reports the median and range of the 5 pass-level medians. |
| Nim | BoringSSL (via nim-libp2p) | 3.67 | 4.36 | 1.19x | 1.16-1.21x | 5 x 500 | Per-iteration interleaved (existing harness: classical handshake then hybrid handshake each iteration, common-mode drift). The harness's own "overhead from paired difference" line (1 + median per-iteration difference / classical median) ranges 1.132-1.190x across the 5 passes. The table's headline ratio is the ratio of the pass's hybrid median to its classical median, medianed and ranged over the 5 passes. |
| Rust | RustCrypto ml-kem | 1.57 | 1.96 | 1.32x | 1.23-1.61x | 5 passes; 100 criterion samples per bench per pass (each sample a batch of iterations; batch sizes ranged 1800-5050 across the 10 bench invocations logged in rust-passes.stderr.log) | Pass-level only, and not interleaved: each pass is one cargo bench process that runs the classical bench, then the hybrid bench, sequentially within that process (not per-iteration paired the way the other three languages are). The table reports the median and range of the 5 pass-level ratios (hybrid median / classical median). |

Absolute milliseconds are not comparable across languages -- each harness measures a different
transport (in-memory channel, bridgedConnections, multiaddrConnectionPair, criterion
iter_batched over a futures_ringbuf pair), so the same protocol runs through different
non-cryptographic overhead in each. Only the within-language classical-vs-hybrid ratio is a
sound comparison, subject to the whole-machine-slowdown caveat above.

## Comparison with the 2026-09-10 figures

### Overhead ratio

| Language | 2026-09-10 | 2026-09-17 | Shift |
|---|---|---|---|
| JavaScript | 1.51x (range 1.51-1.58) | 1.56x (range 1.51-1.60) | +0.05x, about +3%. The new range's upper end (1.60x) sits just outside the old range's upper end (1.58x). |
| Python | 10.7x | 12.0x (range 11.3-12.4) | +1.3x, about +12% -- the largest shift of the four overhead ratios. |
| Nim | 1.13x | 1.19x (range 1.16-1.21) | +0.06x, about +5%. |
| Rust | 1.24x | 1.32x (range 1.23-1.61) | +0.08x, about +6.5% at the median, with the widest pass-to-pass spread of any language (see Anomalies). |

All four moved the same direction (up), by different amounts; none moved toward making the
post-quantum handshake look cheaper. Given the whole-machine slowdown documented above, whether
these ratio shifts reflect something about the protocol/implementations or are a byproduct of the
same unexplained slowdown is an open question this run does not resolve.

### KEM share of the hybrid handshake -- one method, corrected

An earlier draft of this document reported Python's KEM share falling from ~91% to ~68%, calling
it the largest single shift. That was wrong: the ~91% figure and the ~68% figure were computed by
two different formulas, not by the same formula on two dates. Recomputed with one formula
throughout -- the delta method, (hybrid_ms - classical_ms) / hybrid_ms, matching Research Paper
Sec 7.7/7.9 -- the picture is very different:

| Language | KEM share, 2026-09-10 (delta) | KEM share, 2026-09-17 (delta) | Shift |
|---|---:|---:|---:|
| Python | ~91% (15.47/17.07) | ~92% (36.73/40.08) | Effectively unchanged. |
| JavaScript | ~34% (3.48/10.30) | ~36% (8.70/24.10) | +2 points. |
| Rust | ~19% (0.211/1.099), upper bound | ~20% (0.39/1.96), upper bound | +1 point. |
| Nim | ~12% (0.413/3.356), see note | ~16% (0.691/4.358) | +4 points, ~33% relative -- the one real KEM-share move of the four. |

Note on Nim: the paper's own published Nim figure for 8 Sept is ~8.2%, from a different method: the
standalone ML-KEM-768 round-trip microbenchmark divided by the hybrid handshake median
(0.274/3.356), not the delta method. Recomputing 8 Sept by the delta method (used above, for
consistency with the other three languages) gives ~12.3%. The 2026-09-17 harness's own per-pass
"KEM fraction of XXhfs time" printout -- the same standalone method the paper uses -- has a
five-pass median of 9.5% (per-pass values 8.9%, 8.9%, 9.5%, 12.2%, 13.0%), close to the paper's
8.2%. So by the paper's own (standalone) method, Nim's KEM share moved from ~8.2% to ~9.5%; by
the delta method used for the rest of this table, it moved from ~12.3% to ~15.9%. Either way it is
a real but modest move, not the dramatic Python "shift" an earlier draft of this document
reported by comparing two unlike formulas.

## Anomalies and notes

- Rust confirmation run discarded. Before Step 4, one cargo bench ... handshake run was
  executed to confirm the target/criterion/<name>/new/estimates.json paths used by
  run-rust-passes.sh (confirmed: noise_xx_classical_handshake and
  noise_xxhfs_mlkem768_handshake, exactly as written in the script -- no path changes needed).
  That confirmation run overlapped with unrelated read-only shell commands (checking file
  existence in the JS and Nim checkouts) run in this session while it compiled in the background,
  so its ratio (~1.95x) is contaminated and is not one of the five passes in rust-passes.tsv
  above. The five passes in this summary ran with nothing else executing concurrently.
- All 16 handshake-benchmark invocations exited 0 (JS 1 invocation running all 5 passes
  internally, Python 5, Nim 5, Rust 5). No ratio in any raw file was below 1.0x, so no re-run was
  needed under this task's re-run policy.
- Nim's absolute classical-handshake latency varied about 1.6x pass-to-pass: 3.327/3.367/3.667 ms
  in passes 1, 2, 5 versus 5.122/5.322 ms in passes 3 and 4 (nim-pass3.txt, nim-pass4.txt).
  No load or thermal data was captured during the run, so the cause is not established; this is
  reported as an observation, not explained. The per-iteration-paired ratio nonetheless stayed in
  a narrow band (1.164x-1.211x headline; 1.132x-1.190x by the harness's own paired-difference
  statistic) across that swing -- noted as a fact about this run, not asserted as general proof
  that pairing works, since the two slowest passes (3, 4) in fact produced the lowest ratios
  in the set, which a simple pairing-cancels-drift-perfectly story would not predict.
- Rust's per-pass spread: passes 1-2 were slower on both benches (hybrid point estimates
  3.23 ms and 3.46 ms) than passes 3-5 (hybrid point estimates 1.97 ms, 1.87 ms, 1.89 ms); classical
  showed the same pattern (2.20 ms and 1.78 ms in passes 1-2 versus 1.41-1.49 ms in passes 3-5).
  criterion logged "Unable to complete 100 samples in 5.0s" for both benches in passes 3, 4 and 5.
  The ratio's spread (1.231x-1.606x) sits across this same pass-to-pass timing change; Rust is the
  one language sampled pass-level rather than per-iteration, so it has no per-iteration pairing to
  cancel drift between the classical and hybrid runs within a pass. This is a plausible
  contributing factor, not a confirmed cause.
- Python's stale cross-language comparison table was removed from bench_noise_pq.py's
  save_results (see the task report) rather than updated with new numbers: cross-language
  comparison belongs here, not duplicated with hard-coded figures in a per-language generated
  file.
- Physical machine prep (closing browsers/IDE indexers, confirming AC power, waiting for idle
  CPU): AC power is now confirmed via Win32_Battery.BatteryStatus=2; no other benchmark or
  build ran at the same time as any of the five official passes per language; unrelated
  foreground GUI applications were not touched during the run and were not independently verified
  closed.
