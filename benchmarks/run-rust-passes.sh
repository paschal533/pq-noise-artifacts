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
  c=$(node -p "require('./target/criterion/noise_xx_classical_handshake/new/estimates.json').median.point_estimate")
  h=$(node -p "require('./target/criterion/noise_xxhfs_mlkem768_handshake/new/estimates.json').median.point_estimate")
  printf '%s\t%s\t%s\t%s\n' "$p" "$c" "$h" "$(node -p "($h/$c).toFixed(3)")"
done
