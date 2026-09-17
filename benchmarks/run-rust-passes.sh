#!/usr/bin/env bash
# Five serial criterion passes of the classical and hybrid handshake benches;
# prints per-pass medians and the per-pass ratio as TSV.
# Usage: RUST_DIR=... bash benchmarks/run-rust-passes.sh > rust-passes.tsv
set -euo pipefail
: "${RUST_DIR:?set RUST_DIR}"
cd "$RUST_DIR"
printf 'pass\tclassical_ns\thybrid_ns\tratio\n'
for p in 1 2 3 4 5; do
  cargo bench -p libp2p-noise --bench noise_hfs --features mlkem-hfs -- --noplot handshake >&2
  # Both medians must be positive finite numbers, or the ratio is meaningless
  # (0 gives Infinity or 0.000, a missing field gives NaN): fail the run.
  row=$(node -e "
    const est = n => require('./target/criterion/' + n + '/new/estimates.json').median?.point_estimate
    const c = est('noise_xx_classical_handshake'), h = est('noise_xxhfs_mlkem768_handshake')
    const ok = x => typeof x === 'number' && Number.isFinite(x) && x > 0
    if (!ok(c) || !ok(h) || !Number.isFinite(h / c)) {
      console.error('ERROR pass $p: invalid criterion medians classical=' + c + ' hybrid=' + h)
      process.exit(1)
    }
    console.log(c + '\t' + h + '\t' + (h / c).toFixed(3))
  ")
  printf '%s\t%s\n' "$p" "$row"
done
