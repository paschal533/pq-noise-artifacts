# Benchmark summary, 2026-09-17

One machine, one session, strictly serial (JS, then Python, then Nim, then Rust; nothing else
running concurrently, except one discarded Rust confirmation run -- see Anomalies). Protocol under
test in all four: `Noise_XXhfs_25519+MLKEM768_ChaChaPoly_SHA256` (`/noise-mlkem768-hfs/0.2.0`)
against classical `Noise_XX_25519_ChaChaPoly_SHA256`. Raw files for every pass are in this
directory; every figure below is read from them, not recomputed by eye.

Machine: Intel(R) Core(TM) i7-8665U CPU @ 1.90GHz, Windows 11 Pro, Balanced power plan. AC power
was checked after this run (not during) via `Get-CimInstance Win32_Battery` and found on
(`Win32_Battery.BatteryStatus=2`) -- see `machine.txt`. Session ran 2026-09-17T02:50:40Z to
2026-09-17T03:04:11Z (UTC throughout this document).

## The whole machine was slower than on 2026-09-10 -- read this before the ratios below

Every absolute median in this run is higher than the corresponding 2026-09-10 (8 Sept for Nim)
figure, for every language, before any classical-vs-hybrid ratio is even computed:

| Metric | Prior session | Prior value | 2026-09-17 | Factor |
|---|---|---:|---:|---:|
| JS classical, native backend | 2026-09-10 | 6.82 ms | 15.40 ms | 2.26x |
| JS hybrid, native backend | 2026-09-10 | 10.30 ms | 24.10 ms | 2.34x |
| Python classical | 2026-09-10 | 1.60 ms | 3.35 ms | 2.09x |
| Python hybrid | 2026-09-10 | 17.07 ms | 40.08 ms | 2.35x |
| Rust classical | 2026-09-10 | 0.888 ms\* | 1.57 ms\* | 1.77x\* |
| Nim classical | 8 Sept | 2.943 ms | 3.667 ms | 1.25x |
| Nim hybrid | 8 Sept | 3.356 ms | 4.358 ms | 1.30x |

\* The 0.888 ms figure is a criterion point estimate (Research Paper Sec 7.8,
research-paper.md:872); the 1.57 ms figure is a median over 5 pass-level medians. This row
therefore mixes two statistics -- see the KEM-share section below for the same comparison done
with one statistic throughout (point estimates), which gives a different factor (about 1.68x).

Python's post-handshake throughput also changed between sessions, but is not included in this
table: see the note under "KEM share" for why.

AC power was checked after this run and found on; no AC-power or power-plan record exists from
the 2026-09-10 (or 8 Sept) session to compare against, so this is reported only as confirmed for
this run, not as matching or differing from anything prior. **The cause of the slowdown is not
established** -- this table reports what changed, not why.

Nim's baseline (8 Sept) is a different, earlier session than the other three languages'
(2026-09-10). Research Paper Sec 7.1 (research-paper.md:651) records that this same machine ran
roughly twice as fast on 10 September as on 8 September -- day-to-day drift of that size is
already documented independently of this run, so no comparison or interpretation of Nim's
slowdown factor relative to the other three languages' is offered here.

Because KEM cost and non-KEM cost are not guaranteed to scale together under whatever changed,
**the classical-vs-hybrid overhead ratios below may not be directly comparable to the 2026-09-10
ones**, even though each ratio is internally sound -- both halves of any one ratio were measured
in the same session, on the same machine state. This caveat applies to every ratio and every
KEM-share figure in this document.

## Results

| Language | KEM library | Classical (ms, median of pass medians) | Hybrid (ms, median of pass medians) | Overhead, median | Overhead, range (min-max across passes) | Passes x iterations | Sampling |
|---|---|---:|---:|---:|---:|---|---|
| JavaScript | `@noble/post-quantum` 0.6.0 | 15.40 | 24.10 | 1.56x | 1.51-1.60x | 5 x 30 | Per-iteration paired (both protocols interleaved, order rotated each iteration), backend held constant (native); per-pass value is the median of the 30 per-iteration ratios; the table reports the median and range of the 5 pass-level medians. |
| Python | `kyber-py` 1.2.0 (pure Python) | 3.35 | 40.08 | 12.0x | 11.3-12.4x | 5 x 50 | Per-iteration interleaved as of this task's Step 1 (alternating which protocol runs first each iteration, fresh keys per handshake); per-pass value is the median of the 50 per-iteration ratios; the table reports the median and range of the 5 pass-level medians. |
| Nim | BoringSSL (via nim-libp2p) | 3.67 | 4.36 | 1.19x | 1.16-1.21x | 5 x 500 | Per-iteration interleaved (existing harness: classical handshake then hybrid handshake each iteration, common-mode drift). The harness's own "overhead from paired difference" line (1 + median per-iteration difference / classical median) ranges 1.132-1.190x across the 5 passes. The table's headline ratio is the ratio of the pass's hybrid median to its classical median, medianed and ranged over the 5 passes. |
| Rust | RustCrypto `ml-kem` | 1.57 | 1.96 | 1.32x | 1.23-1.61x | 5 passes; 100 criterion samples per bench per pass | Pass-level only, and not interleaved: each pass is one `cargo bench` process that runs the classical bench, then the hybrid bench, sequentially within that process (not per-iteration paired the way the other three languages are). Sampling mode varied by pass -- see Anomalies for the Flat-vs-Linear breakdown and its evidence. The table reports the median and range of the 5 pass-level ratios (hybrid median / classical median, both from `estimates.json` via `rust-passes.tsv`). |

Absolute milliseconds are **not comparable across languages** -- each harness measures a different
transport (in-memory channel, `bridgedConnections`, `multiaddrConnectionPair`, criterion
`iter_batched` over a `futures_ringbuf` pair), so the same protocol runs through different
non-cryptographic overhead in each. Only the within-language classical-vs-hybrid ratio is a
sound comparison, subject to the whole-machine-slowdown caveat above.

## Comparison with the 2026-09-10 figures

### Overhead ratio

| Language | Prior session | Prior overhead | 2026-09-17 | Shift |
|---|---|---|---|---|
| JavaScript | 2026-09-10 | 1.51x (range 1.51-1.58) | 1.56x (range 1.51-1.60) | +0.05x, about +3%. The new range's upper end (1.60x) sits just outside the old range's upper end (1.58x). |
| Python | 2026-09-10 | 10.7x\* | 12.0x (range 11.3-12.4) | +1.3x, about +12% -- the largest shift of the four overhead ratios. |
| Nim | 8 Sept | 1.13x | 1.19x (range 1.16-1.21) | +0.06x, about +5%. |
| Rust | 2026-09-10 | 1.24x\*\* | 1.32x (range 1.23-1.61)\*\* | +0.08x, about +6.5% at the median, with the widest pass-to-pass spread of any language (see Anomalies). |

\* Python's 10.7x came from a single unpaired (phase-separated) run; 12.0x is the median of 5
passes of the newly paired harness built in this task's Step 1. This shift therefore spans a
method change as well as whatever else changed between sessions, unlike the JS and Nim rows,
which were already paired in both the prior session and this one.

\*\* The prior Rust figures (0.888 ms classical, 1.099 ms hybrid, 1.24x) are criterion point
estimates (Research Paper Sec 7.8). The 2026-09-17 figures in this table (1.57 ms, 1.96 ms,
1.32x) are medians of criterion point estimates or estimates.json medians over 5 passes -- a
different statistic. Using point estimates on both sides instead: this run's per-pass overhead
ratios (criterion `time:` point-estimate hybrid / point-estimate classical, one pair per pass)
are 1.468, 1.945, 1.324, 1.282, 1.338 -- median 1.338x, range 1.28-1.94x -- against the
tsv-median-based 1.32x (1.23-1.61x) reported elsewhere in this document. These are two honest
readings of the same five passes, not a contradiction; this document uses the tsv-median
statistic for the in-run tables and the point-estimate statistic only when comparing directly
against the paper's own point-estimate figures.

All four moved the same direction (up), by different amounts; none moved toward making the
post-quantum handshake look cheaper. Given the whole-machine slowdown documented above, whether
these ratio shifts reflect something about the protocol/implementations or are a byproduct of the
same unexplained slowdown is an open question this run does not resolve.

### KEM share of the hybrid handshake -- one method, corrected

An earlier draft of this document reported Python's KEM share falling from ~91% to ~68%, calling
it the largest single shift. That was wrong: the ~91% figure and the ~68% figure were computed by
two different formulas, not by the same formula on two dates. Recomputed with one formula
throughout -- the delta method, `(hybrid_ms - classical_ms) / hybrid_ms`, matching Research Paper
Sec 7.7/7.9 -- the picture is very different:

| Language | KEM share, prior session (delta) | KEM share, 2026-09-17 (delta) |
|---|---:|---:|
| Python | ~91% (15.47/17.07, 2026-09-10) | ~92% (36.73/40.08) |
| JavaScript | ~34% (3.48/10.30, 2026-09-10) | ~36% (8.70/24.10) |
| Rust | ~19% (0.211/1.099, 2026-09-10), upper bound, point estimates | ~20% (0.39/1.96), upper bound, tsv medians |
| Nim | ~12.3% (0.413/3.356, 8 Sept) | see per-pass figures below |

Python, JS and Rust are effectively unchanged under the delta method (within 1-2 points each,
using each language's own consistent statistic on both dates).

**Nim, reported without interpretation.** Nim's paper-published figure for 8 Sept is ~8.2%, from
a different method than the delta method above: the standalone ML-KEM-768 round-trip
microbenchmark divided by the hybrid handshake median (0.274/3.356). Recomputed by the delta
method for comparability with the other three rows, 8 Sept gives ~12.3%. This run's delta-method
KEM share computed per pass, from each pass's own classical and hybrid medians (`nim-pass1.txt`
through `nim-pass5.txt`): 17.5%, 17.3%, 14.1%, 15.0%, 15.9% (median 15.9%). By the paper's own
(standalone) method, this run's harness-printed "KEM fraction of XXhfs time" has a five-pass
median of 9.5% (per-pass values 8.9%, 8.9%, 9.5%, 12.2%, 13.0%), against the paper's 8 Sept 8.2%.
No characterisation of these Nim numbers as large, small, real, or modest is offered here: the
machine's own documented day-to-day drift (research-paper.md:651, roughly 2x between 8 and 10
September) means a cross-session comparison for Nim cannot be made like-for-like from the data
this run recorded, so none is attempted beyond stating the numbers themselves.

## Anomalies and notes

- **Rust confirmation run discarded.** Before Step 4, one `cargo bench ... handshake` run was
  executed to confirm the `target/criterion/<bench-name>/new/estimates.json` paths used by
  `run-rust-passes.sh` (confirmed: `noise_xx_classical_handshake` and
  `noise_xxhfs_mlkem768_handshake`, exactly as written in the script -- no path changes needed).
  That confirmation run overlapped with unrelated read-only shell commands (checking file
  existence in the JS and Nim checkouts) run in this session while it compiled in the background,
  so its ratio (~1.95x) is contaminated and is **not** one of the five passes in `rust-passes.tsv`
  above. The five passes in this summary ran with nothing else executing concurrently.
- **All 16 handshake-benchmark invocations exited 0** (JS 1 process running 5 internal passes,
  Python 5 separate process invocations, Nim 5, Rust 5). No ratio in any raw file was below 1.0x,
  so no re-run was needed under this task's re-run policy.
- **Rust sampling mode varied by pass, verified where the data still exists.** `run-rust-passes.sh`
  runs `cargo bench -p libp2p-noise --bench noise_hfs --features mlkem-hfs -- --noplot handshake`
  once per pass; criterion overwrites `target/criterion/<bench>/new/` on each invocation and moves
  the previous run's data to `target/criterion/<bench>/base/`, so only the two most recent passes'
  raw `sample.json` files still exist on disk after five sequential runs (pass 5 in `new/`, pass 4
  in `base/`; passes 1-3 are overwritten and not recoverable). Reading those two directly:
  `target/criterion/noise_xx_classical_handshake/{new,base}/sample.json` and the equivalent for
  `noise_xxhfs_mlkem768_handshake` both show `"sampling_mode": "Linear"`, with 100 samples sized
  1, 2, 3, ..., 100 (summing to 5050 iterations) for both benches in both passes -- confirming
  passes 4 and 5 used Linear sampling. `rust-passes.stderr.log`'s "Collecting 100 samples ... (N
  iterations)" lines give each pass's total iteration count without needing `sample.json`: pass 3
  logged 5050 for both benches, matching the Linear total exactly and carrying the same "Unable
  to complete 100 samples in 5.0s" warning seen in passes 4 and 5, so pass 3 is inferred (not
  directly verified, since its `sample.json` no longer exists) to be Linear as well. Passes 1 and
  2 logged no such warning, and their totals (2400/2000 classical, 2000/1800 hybrid) do not match
  the Linear sum of 5050; dividing by 100 samples gives constant per-sample iteration counts (24,
  20, 20, 18), consistent with Flat sampling, though this too is inferred from the log rather than
  confirmed from a `sample.json` that no longer exists for those two passes.
- **Rust's per-pass timing, one statistic.** Using the `estimates.json` medians already used in
  the tables above (via `rust-passes.tsv`): classical 2.098, 1.812, 1.466, 1.569, 1.483 ms across
  passes 1-5; hybrid 2.967, 2.911, 1.830, 1.931, 1.960 ms. Passes 1-2 are markedly slower on both
  benches than passes 3-5 by this statistic, coinciding with the Flat-versus-Linear sampling-mode
  change described above and with the "Unable to complete 100 samples" warnings starting at pass
  3. The ratio's spread (1.231x-1.606x) sits across this same pass-to-pass change; Rust is the one
  language sampled pass-level rather than per-iteration, so it has no per-iteration pairing to
  cancel drift between the classical and hybrid runs within a pass. This is a plausible
  contributing factor, not a confirmed cause. (The criterion `time:` point-estimate statistic for
  the same passes is reported separately in the KEM-share/overhead sections above, where it is
  used for its own purpose -- comparison against the paper's point-estimate figures -- and is not
  mixed with the `estimates.json`-median statistic used here and in the tables.)
- **Nim's absolute classical-handshake latency varied about 1.6x pass-to-pass**: 3.327/3.367/3.667
  ms in passes 1, 2, 5 versus 5.122/5.322 ms in passes 3 and 4 (`nim-pass3.txt`, `nim-pass4.txt`).
  No load or thermal data was captured during the run, so the cause is not established; this is
  reported as an observation, not explained. The per-iteration-paired ratio nonetheless stayed in
  a narrow band (1.164x-1.211x headline; 1.132x-1.190x by the harness's own paired-difference
  statistic) across that swing -- noted as a fact about this run, not asserted as general proof
  that pairing "works," since the two slowest passes (3, 4) in fact produced the lowest ratios in
  the set, which a simple pairing-cancels-drift-perfectly story would not predict.
- **Python's stale cross-language comparison table was removed** from `bench_noise_pq.py`'s
  `save_results` (see the task report) rather than updated with new numbers: cross-language
  comparison belongs here, not duplicated with hard-coded figures in a per-language generated
  file.
- **Physical machine prep**: AC power was checked after this run (not during) via
  `Win32_Battery.BatteryStatus=2`; no other benchmark or build ran at the same time as any of the
  five official passes per language; unrelated foreground GUI applications were not touched
  during the run and were not independently verified closed. No comparison to the prior session's
  power state is made, because no record of it exists.
