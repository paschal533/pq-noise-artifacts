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

Previously published figures appear in this document only in one reference table near the end
("Previously published figures (not directly comparable)"), each with its date, its line in
`research-paper.md` and the paper's own wording for its statistic. No delta, ratio or factor
between a published figure and a figure from this run is computed anywhere in this document.
Every other number here is this run's own, from this run's own raw files. No AC-power or
power-plan record exists from the 2026-09-10 or 2026-09-08 sessions, so nothing is stated about
either beyond this run.

## This run's results

> **Superseded for Python, 2026-09-19.** Every Python figure in this file is a `kyber-py`
> measurement, which was the only ML-KEM-768 backend py-libp2p had on 2026-09-17. Since
> py-libp2p `c8d16e63` the default is `MLKEM768NativeKem`, which reaches ML-KEM-768 in C through
> the `cryptography` package, with `kyber-py` kept as a pure-Python fallback behind a warning. A
> paired re-measurement of both arms in one session gives 1.42x to 1.44x C-backed against 10.76x
> to 10.87x on `kyber-py`, with the KEM share falling from ~91% to ~30%; see the update in
> [`../RESULTS.md`](../RESULTS.md). The `kyber-py` arm there reproduces the paper's published
> 10.7x, not this file's 12.0x, because that is a different session and sampling design on a
> machine running roughly half as fast. The other three languages in this file are unaffected.

| Language | KEM library | Classical (ms, median of pass medians) | Hybrid (ms, median of pass medians) | Overhead, median | Overhead, range (min-max across passes) | Passes x iterations | Sampling |
|---|---|---:|---:|---:|---:|---|---|
| JavaScript | `@noble/post-quantum` 0.6.0 | 15.40 | 24.10 | 1.56x | 1.51-1.60x | 5 x 30 | Per-iteration paired (both protocols interleaved, order rotated each iteration), backend held constant (native); per-pass value is the median of the 30 per-iteration ratios; the table reports the median and range of the 5 pass-level medians. |
| Python | `kyber-py` 1.2.0 (pure Python) | 3.35 | 40.08 | 12.0x | 11.3-12.4x | 5 x 50 | Per-iteration interleaved since py-libp2p `2ffbe408`, committed shortly before this session (alternating which protocol runs first each iteration, fresh keys per handshake); per-pass value is the median of the 50 per-iteration ratios; the table reports the median and range of the 5 pass-level medians. |
| Nim | BoringSSL (via nim-libp2p) | 3.67 | 4.36 | 1.19x | 1.16-1.21x | 5 x 500 | Per-iteration interleaved (existing harness: classical handshake then hybrid handshake each iteration). The harness's own "overhead from paired difference" line (1 + median per-iteration difference / classical median) gives 1.190, 1.189, 1.144, 1.132, 1.174 across the 5 passes. The table's headline ratio is the ratio of the pass's hybrid median to its classical median, medianed and ranged over the 5 passes. |
| Rust | RustCrypto `ml-kem` | 1.57 | 1.96 | 1.32x | 1.23-1.61x | 5 passes; 100 criterion samples per bench per pass | Pass-level only, not interleaved: each pass is one `cargo bench` process that runs the classical bench, then the hybrid bench, sequentially within that process. Sampling mode appears to have varied by pass (passes 1-2 inferred Flat, passes 3-4 inferred Linear, pass 5 confirmed Linear) -- see Anomalies. Classical and hybrid figures above are `estimates.json` medians (field `median.point_estimate`) via `rust-passes.tsv`; the table reports the median and range of the 5 pass-level ratios computed from those medians. |

Absolute milliseconds are **not comparable across languages** -- each harness measures a different
transport (in-memory channel, `bridgedConnections`, `multiaddrConnectionPair`, criterion
`iter_batched` over a `futures_ringbuf` pair), so the same protocol runs through different
non-cryptographic overhead in each. Only the within-language classical-vs-hybrid ratio is a
sound comparison.

**In-run sensitivity (Rust only, no cross-session use).** criterion also prints a `time: [low mid
high]` line per bench per pass; the middle value is the slope estimate for Linear-sampled passes,
while passes 1-2 are inferred to have been Flat-sampled, in which case the same field holds a
different estimator (see Anomalies for which passes are which). Reading that field regardless of sampling mode gives
per-pass ratios of 1.468, 1.945, 1.324, 1.282, 1.338 -- median 1.338x, range 1.28-1.94x. This is a
different statistic from the `estimates.json`-median-based 1.32x (1.23-1.61x) reported in the
table above, computed from the same five passes; it is reported here only to show that the two
statistics disagree, not as an alternative headline figure, and it is not compared against
anything from any other session.

## KEM share of the hybrid handshake, this run only

Every figure in this section is `(hybrid_ms - classical_ms) / hybrid_ms` (the delta method),
computed from this run's own raw files. The inputs are the medians named in the results table
above: for JavaScript, the medians of the 5 pass-level medians on the native backend (24.10 and
15.40 ms); for Python, the medians of the 5 per-pass handshake medians (40.08 and 3.35 ms); for
Rust, the medians of the 5 per-pass `estimates.json` medians via `rust-passes.tsv` (1.960 and
1.569 ms); for Nim, each pass's own classical and hybrid harness medians, one share per pass:

| Language | KEM share (delta method) |
|---|---:|
| Python (`kyber-py`) | ~92% (36.73/40.08) |
| JavaScript | ~36% (8.70/24.10) |
| Rust | ~20% (0.39/1.96), upper bound -- the harness has no standalone KEM microbenchmark, so this attributes the whole classical-to-hybrid delta to the KEM |
| Nim | per pass: 17.5%, 17.3%, 14.1%, 15.0%, 15.9% (median 15.9%), from each pass's own classical/hybrid medians in `nim-pass1.txt` through `nim-pass5.txt` |

Nim's harness also prints its own "KEM fraction of XXhfs time" line, computed by a different
(standalone microbenchmark / hybrid handshake) method: 13.0%, 12.2%, 8.9%, 8.9%, 9.5% for passes
1-5 (median 9.5%). It is listed because it is what the harness itself reports; it is a different
quantity from the delta-method figures in the table.

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

## Anomalies and notes

- **Rust confirmation run discarded.** Before the five measured passes, one `cargo bench ... handshake` run was
  executed to confirm the `target/criterion/<bench-name>/new/estimates.json` paths used by
  `run-rust-passes.sh` (confirmed: `noise_xx_classical_handshake` and
  `noise_xxhfs_mlkem768_handshake`, exactly as written in the script -- no path changes needed).
  That confirmation run overlapped with unrelated read-only shell commands (checking file
  existence in the JS and Nim checkouts) run in this session while it compiled in the background,
  so its output is not used anywhere and is not one of the five passes in `rust-passes.tsv`. The
  five official passes ran with nothing else executing concurrently.
- **All 16 handshake-benchmark invocations exited 0** (JS 1 process running 5 internal passes,
  Python 5 separate process invocations, Nim 5, Rust 5). No ratio in any raw file was below 1.0x,
  so no pass was re-run.
- **Rust sampling mode, what is verified versus inferred.** `run-rust-passes.sh` runs one `cargo
  bench` invocation per pass; criterion writes each invocation's data to
  `target/criterion/<bench>/new/` and is expected to move the previous invocation's data to
  `target/criterion/<bench>/base/`. After all 5 passes finished, `target/criterion/<bench>/new/`
  and `target/criterion/<bench>/base/` were compared directly for both benches: their
  `sample.json` files are byte-identical, and both directories' `estimates.json` medians equal
  pass 5's row in `rust-passes.tsv` exactly. `base/` therefore does not hold pass 4's data -- it
  is a second copy of pass 5's -- so **only pass 5 is confirmed Linear-sampled from a file on
  disk** (`sampling_mode: "Linear"`, 100 samples sized 1..100, sum 5050, in both `new/` and
  `base/`, for both benches). Passes 1-4's `sample.json` no longer exist in any recoverable form.
  `rust-passes.stderr.log`'s "Collecting 100 samples ... (N iterations)" lines give each pass's
  total iteration count independently of `sample.json`: pass 3 and pass 4 each logged 5050 for
  both benches, matching pass 5's confirmed Linear total exactly, and carried the same "Unable to
  complete 100 samples in 5.0s" warning pass 5 also logged -- so passes 3 and 4 are inferred (not
  file-verified) to be Linear as well. Passes 1 and 2 logged no such warning, with totals of
  2400/2000 (classical) and 2000/1800 (hybrid) that do not match the Linear sum of 5050; dividing
  by 100 samples gives constant per-sample counts of 24, 20, 20, 18, consistent with Flat
  sampling -- inferred from the log, not confirmed from any surviving file.
- **Rust's per-pass timing, one statistic.** Using the `estimates.json` medians already used in
  the tables above (via `rust-passes.tsv`): classical 2.098, 1.812, 1.466, 1.569, 1.483 ms across
  passes 1-5; hybrid 2.967, 2.911, 1.830, 1.931, 1.960 ms. Passes 1-2 are higher on both benches
  by this statistic than passes 3-5, coinciding with the inferred Flat/Linear sampling-mode difference
  described above and with the "Unable to complete 100 samples" warning starting at pass 3. Rust
  is the one language sampled pass-level rather than per-iteration, so it has no per-iteration
  pairing between the classical and hybrid runs within a pass. No cause is asserted for the
  pass-to-pass difference in this statistic.
- **Nim's absolute classical-handshake latency, per pass**: 3.327, 3.367, 5.322, 5.122, 3.667 ms
  (passes 1-5, `nim-pass1.txt` through `nim-pass5.txt`). No load or thermal data was captured
  during the run. The per-iteration-paired headline ratio for the same 5 passes is 1.211, 1.208,
  1.164, 1.176, 1.189; the harness's own paired-difference statistic gives 1.190, 1.189, 1.144,
  1.132, 1.174. Both series stay within a narrow band across the passes above, which is reported
  as an observation about this run's own data, not as a general claim about pairing.
- **Python's stale cross-language comparison table was removed** from `bench_noise_pq.py`'s
  `save_results` (see the task report) rather than updated with new numbers: cross-language
  comparison belongs here, not duplicated with hard-coded figures in a per-language generated
  file.
- **Physical machine prep**: AC power was checked after this run (not during) via
  `Win32_Battery.BatteryStatus=2`; no other benchmark or build ran at the same time as any of the
  five official passes per language; unrelated foreground GUI applications were not touched
  during the run and were not independently verified closed.
