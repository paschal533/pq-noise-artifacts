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

This document makes no comparison between this run's figures and any earlier session's, beyond a
single reference table near the end that lists the earlier figures with their own sources and
states plainly why no delta is computed. Every number elsewhere in this document is this run's
own, from this run's own raw files.

## Whole-machine timing, same statistic on both sides only

| Metric | Statistic | Prior session | Prior value | This run |
|---|---|---|---:|---:|
| JS classical, native backend | median of 5 pass-level medians | 2026-09-10 | 6.82 ms | 15.40 ms |
| JS hybrid, native backend | median of 5 pass-level medians | 2026-09-10 | 10.30 ms | 24.10 ms |
| Python classical | median | 2026-09-10 | 1.60 ms | 3.35 ms |
| Python hybrid | median | 2026-09-10 | 17.07 ms | 40.08 ms |
| Nim classical | median, paired, 5 passes | 8 Sept 2026 | 2.943 ms | 3.667 ms |
| Nim hybrid | median, paired, 5 passes | 8 Sept 2026 | 3.356 ms | 4.358 ms |

Sources for the prior-session column: JS, research-paper.md:692-710 (Sec 7.3, "Medians across
five serial passes"); Python, research-paper.md:841-842 (Sec 7.7); Nim,
research-paper.md:862-863 (Sec 7.8). Each row compares the same statistic (a median) computed the
same way in both sessions, so a ratio between the two columns is meaningful on its own terms;
none is computed here, because this table's purpose is to show that both sessions' absolute
numbers exist and are the same kind of number, not to characterise the size or cause of any
difference between them.

Rust is not in this table. The paper's Rust classical/hybrid figures (0.888 ms / 1.099 ms) are
criterion point estimates (research-paper.md:659, Sec 7.1). This run's in-run tables below use
`estimates.json` medians (`median.point_estimate`, via `rust-passes.tsv`), a different statistic.
This run also has a per-pass point-estimate series (see "In-run sensitivity" below), but that
series mixes two criterion sampling modes across its five passes and is not used for any
cross-session comparison.

AC power was checked after this run and found on; no AC-power or power-plan record exists from
the 2026-09-10 or 8 Sept sessions, so nothing is stated about it beyond this run.

## This run's results

| Language | KEM library | Classical (ms, median of pass medians) | Hybrid (ms, median of pass medians) | Overhead, median | Overhead, range (min-max across passes) | Passes x iterations | Sampling |
|---|---|---:|---:|---:|---:|---|---|
| JavaScript | `@noble/post-quantum` 0.6.0 | 15.40 | 24.10 | 1.56x | 1.51-1.60x | 5 x 30 | Per-iteration paired (both protocols interleaved, order rotated each iteration), backend held constant (native); per-pass value is the median of the 30 per-iteration ratios; the table reports the median and range of the 5 pass-level medians. |
| Python | `kyber-py` 1.2.0 (pure Python) | 3.35 | 40.08 | 12.0x | 11.3-12.4x | 5 x 50 | Per-iteration interleaved as of this task's Step 1 (alternating which protocol runs first each iteration, fresh keys per handshake); per-pass value is the median of the 50 per-iteration ratios; the table reports the median and range of the 5 pass-level medians. |
| Nim | BoringSSL (via nim-libp2p) | 3.67 | 4.36 | 1.19x | 1.16-1.21x | 5 x 500 | Per-iteration interleaved (existing harness: classical handshake then hybrid handshake each iteration). The harness's own "overhead from paired difference" line (1 + median per-iteration difference / classical median) gives 1.190, 1.189, 1.144, 1.132, 1.174 across the 5 passes. The table's headline ratio is the ratio of the pass's hybrid median to its classical median, medianed and ranged over the 5 passes. |
| Rust | RustCrypto `ml-kem` | 1.57 | 1.96 | 1.32x | 1.23-1.61x | 5 passes; 100 criterion samples per bench per pass | Pass-level only, not interleaved: each pass is one `cargo bench` process that runs the classical bench, then the hybrid bench, sequentially within that process. Sampling mode varied by pass -- see Anomalies. Classical and hybrid figures above are `estimates.json` medians (field `median.point_estimate`) via `rust-passes.tsv`; the table reports the median and range of the 5 pass-level ratios computed from those medians. |

Absolute milliseconds are **not comparable across languages** -- each harness measures a different
transport (in-memory channel, `bridgedConnections`, `multiaddrConnectionPair`, criterion
`iter_batched` over a `futures_ringbuf` pair), so the same protocol runs through different
non-cryptographic overhead in each. Only the within-language classical-vs-hybrid ratio is a
sound comparison.

**In-run sensitivity (Rust only, no cross-session use).** criterion also prints a `time: [low mid
high]` line per bench per pass; the middle value is the slope estimate for Linear-sampled passes,
while passes 1-2 were Flat-sampled and report a different estimator for the same field (see
Anomalies for which passes are which). Reading that field regardless of sampling mode gives
per-pass ratios of 1.468, 1.945, 1.324, 1.282, 1.338 -- median 1.338x, range 1.28-1.94x. This is a
different statistic from the `estimates.json`-median-based 1.32x (1.23-1.61x) reported in the
table above, computed from the same five passes; it is reported here only to show that the two
statistics disagree, not as an alternative headline figure, and it is not compared against
anything from any other session.

## KEM share of the hybrid handshake, this run only

Every figure in this section is `(hybrid_ms - classical_ms) / hybrid_ms` (the delta method),
computed from this run's own raw files, with no comparison to any other session:

| Language | KEM share (delta method) |
|---|---:|
| Python | ~92% (36.73/40.08) |
| JavaScript | ~36% (8.70/24.10) |
| Rust | ~20% (0.39/1.96), upper bound -- the harness has no standalone KEM microbenchmark, so this attributes the whole classical-to-hybrid delta to the KEM |
| Nim | per pass: 17.5%, 17.3%, 14.1%, 15.0%, 15.9% (median 15.9%), from each pass's own classical/hybrid medians in `nim-pass1.txt` through `nim-pass5.txt` |

Nim's harness also prints its own "KEM fraction of XXhfs time" line, computed by a different
(standalone microbenchmark / hybrid handshake) method: 13.0%, 12.2%, 8.9%, 8.9%, 9.5% across the
5 passes (median 9.5%). This is included because it is what the harness itself reports, not
because it is compared against the delta-method figures in the same table.

## Previously published figures (not directly comparable)

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

No delta, shift, or percentage change is computed anywhere in this document between any row above
and this run's own figures. Three reasons: this run's absolute latencies differ from the
2026-09-10 session's by roughly a factor of two across JS, Python and Rust (see the timing table
above); the paper separately documents day-to-day drift of a similar size on this same machine,
independent of any particular session pair (research-paper.md:651, "this machine ran roughly
twice as fast on 10 September as on 8 September"); and the Python figures additionally span a
sampling-method change (the 2026-09-10 harness ran classical and hybrid handshakes in separate
phases, while this run's harness -- built in this task's Step 1 -- interleaves them per
iteration). Any of the three would be enough on its own to make a cross-session delta
uninformative; together, no such number is given.

## Anomalies and notes

- **Rust confirmation run discarded.** Before Step 4, one `cargo bench ... handshake` run was
  executed to confirm the `target/criterion/<bench-name>/new/estimates.json` paths used by
  `run-rust-passes.sh` (confirmed: `noise_xx_classical_handshake` and
  `noise_xxhfs_mlkem768_handshake`, exactly as written in the script -- no path changes needed).
  That confirmation run overlapped with unrelated read-only shell commands (checking file
  existence in the JS and Nim checkouts) run in this session while it compiled in the background,
  so its output is not used anywhere and is not one of the five passes in `rust-passes.tsv`. The
  five official passes ran with nothing else executing concurrently.
- **All 16 handshake-benchmark invocations exited 0** (JS 1 process running 5 internal passes,
  Python 5 separate process invocations, Nim 5, Rust 5). No ratio in any raw file was below 1.0x,
  so no re-run was needed under this task's re-run policy.
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
  by this statistic than passes 3-5, coinciding with the Flat/Linear sampling-mode difference
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
