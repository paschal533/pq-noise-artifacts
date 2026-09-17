# Benchmark summary, 2026-09-17

One machine, one session, strictly serial (JS, then Python, then Nim, then Rust; nothing else
running concurrently). Protocol under test in all four:
`Noise_XXhfs_25519+MLKEM768_ChaChaPoly_SHA256` (`/noise-mlkem768-hfs/0.2.0`) against classical
`Noise_XX_25519_ChaChaPoly_SHA256`. Raw files for every pass are in this directory; every figure
below is read from them, not recomputed by eye.

**Machine:** Intel(R) Core(TM) i7-8665U CPU @ 1.90GHz, Windows 11 Pro, Balanced power plan (see
`machine.txt`). Session ran 2026-09-17T02:50:40Z to 2026-09-17T03:04:11Z.

## Results

| Language | KEM library | Classical (ms, median of pass medians) | Hybrid (ms, median of pass medians) | Overhead, median | Overhead, range (min-max across passes) | Passes x iterations | Sampling |
|---|---|---:|---:|---:|---:|---|---|
| JavaScript | `@noble/post-quantum` | 15.40 | 24.10 | **1.56x** | 1.51-1.60x | 5 x 30 | Per-iteration paired (both protocols interleaved, order rotated each iteration), backend held constant (native); per-pass value is the median of the 30 per-iteration ratios; the table reports the median and range of the 5 pass-level medians. |
| Python | `kyber-py` (pure Python) | 3.35 | 40.08 | **12.0x** | 11.3-12.4x | 5 x 50 | Per-iteration interleaved as of this task's Step 1 (alternating which protocol runs first each iteration, fresh keys per handshake); per-pass value is the median of the 50 per-iteration ratios; the table reports the median and range of the 5 pass-level medians. |
| Nim | BoringSSL (via nim-libp2p) | 3.67 | 4.36 | **1.19x** | 1.16-1.21x | 5 x 500 | Per-iteration interleaved (existing harness: classical handshake then hybrid handshake each iteration, common-mode drift cancels); per-pass value is the ratio of the pass's hybrid median to its classical median; the table reports the median and range of the 5 pass-level ratios. |
| Rust | RustCrypto `ml-kem` | 1.57 | 1.96 | **1.32x** | 1.23-1.61x | 5 x 100 (criterion default sample count) | Pass-level only: each pass runs the classical and hybrid `criterion` benches as two separate invocations (not interleaved per iteration), so drift between the two within a pass is not cancelled the way it is for the other three languages; the table reports the median and range of the 5 pass-level ratios (hybrid median / classical median). |

Absolute milliseconds are **not comparable across languages** -- each harness measures a different
transport (in-memory channel, `bridgedConnections`, `multiaddrConnectionPair`, `criterion`
`iter_batched` over a `futures_ringbuf` pair), so the same protocol runs through different
non-cryptographic overhead in each. Only the within-language classical-vs-hybrid ratio is a
sound comparison.

## Comparison with the 2026-09-10 figures

| Language | 2026-09-10 | 2026-09-17 | Shift |
|---|---|---|---|
| JavaScript | 1.51x (range 1.51-1.58) | 1.56x (range 1.51-1.60) | Median up ~3%; the new range's upper end (1.60x) sits just outside the old range's upper end (1.58x). Small but real -- reported as found, not smoothed. |
| Python | 10.7x | 12.0x (range 11.3-12.4) | Up ~12%. This is expected to be at least partly a **methodology change, not just noise**: the 2026-09-10 figure came from the phase-separated harness (all classical handshakes, then all hybrid ones), which this task's Step 1 replaced with genuine per-iteration pairing. The two numbers are not measurements of the same thing, and the new one is the one with the sounder method. |
| Nim | 1.13x | 1.19x (range 1.16-1.21) | Up ~5%, outside what a single old point value can bound. Also notable: absolute classical-handshake latency varied by ~60% pass-to-pass (3.3-3.7 ms in three passes, 5.1-5.3 ms in the other two -- see `nim-pass3.txt`/`nim-pass4.txt` vs the rest), consistent with a shared desktop under variable background load rather than an isolated rig. The paired-per-iteration design kept the *ratio* stable across that swing (1.16x-1.21x even though absolute latency roughly doubled), which is itself evidence the pairing is doing its job. |
| Rust | 1.24x | 1.32x (range 1.23-1.61) | Up ~6.5% at the median, but the widest pass-to-pass spread of any language: pass 2 (1.606x) is 30% higher than pass 4 (1.231x). Rust is the one language here sampled pass-level rather than per-iteration (`criterion` runs each bench as a separate process invocation), so it has no per-iteration pairing to cancel machine drift between the classical and hybrid runs within a pass -- this is a plausible explanation for the wider spread, not a confirmed one. |

None of the four ratios moved in the direction of making the post-quantum handshake look cheaper;
all four shifted mildly upward. Given they moved together, a shared cause (machine load, thermal
state, or the fact this session ran on a laptop rather than an isolated bench rig) is at least as
plausible as four independent per-language effects -- this is noted as an open question, not
resolved here.

## Anomalies and notes

- **Rust confirmation run discarded.** Before Step 4, one `cargo bench ... handshake` run was
  executed to confirm the `target/criterion/<name>/new/estimates.json` paths used by
  `run-rust-passes.sh` (confirmed: `noise_xx_classical_handshake` and
  `noise_xxhfs_mlkem768_handshake`, exactly as written in the script -- no path changes needed).
  That confirmation run overlapped with unrelated read-only shell commands (checking file
  existence in the JS and Nim checkouts) run in this session while it compiled in the background,
  so its ratio (~1.95x) is contaminated and is **not** one of the five passes in `rust-passes.tsv`
  above. The five passes in this summary ran with nothing else executing concurrently.
- **All 40 handshake-benchmark invocations (JS 1, Python 5, Nim 5, Rust 5, each covering both
  protocols) exited 0.** No ratio in any raw file was below 1.0x, so no re-run was needed under
  this task's re-run policy.
- **Python's stale cross-language comparison table was removed** from
  `bench_noise_pq.py`'s `save_results` (see Step 1 write-up in the task report) rather than
  updated with new numbers, per this task's brief: cross-language comparison belongs here, not
  duplicated with hard-coded figures in a per-language generated file.
- Physical machine prep (closing browsers/IDE indexers, confirming AC power, waiting for idle
  CPU) was done to the extent an agent without GUI control could: unrelated foreground
  applications were not touched during the run, and no other benchmark or build ran at the same
  time. AC power state could not be directly verified by the agent.
