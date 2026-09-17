#!/usr/bin/env bash
# Bidirectional interop matrix for Noise_XXhfs_25519+MLKEM768_ChaChaPoly_SHA256
# (/noise-mlkem768-hfs/0.2.0).
#
# For every ordered (listener, dialer) pair, including same-implementation
# pairs, and REPS repetitions each, a run PASSES only if:
#   - both processes exit 0 and print INTEROP_OK,
#   - the listener's PEER equals the dialer's LOCAL and vice versa
#     (each side decrypted the other's static key and payload, possible only
#     if both derived the same handshake hash h, and verified the identity
#     signature over that static key), and
#   - each side RECV'd exactly "hello from <the other implementation>"
#     (one encrypted frame decrypted in each direction, so both split()
#     cipher states are exercised).
#
# Usage:
#   JS_DIR=... PY_DIR=... NIM_DIR=... RUST_DIR=... [PYTHON=python] [REPS=3] \
#     [IMPLS="JS Python Nim Rust"] bash interop/run-matrix.sh
#
# PYTHON defaults to "python" (whatever is first on PATH). On Windows this
# should be pointed at the py-libp2p venv interpreter, e.g.
#   PYTHON=/path/to/py-libp2p/.venv/Scripts/python.exe
# so that PYTHONPATH=$PY_DIR resolves the right package.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
: "${JS_DIR:?set JS_DIR}" "${PY_DIR:?set PY_DIR}" "${NIM_DIR:?set NIM_DIR}" "${RUST_DIR:?set RUST_DIR}"
PYTHON="${PYTHON:-python}"
IMPLS="${IMPLS:-JS Python Nim Rust}"
REPS="${REPS:-3}"
PORT="${BASE_PORT:-9400}"
READY_TICKS=150       # x 0.2 s
DIAL_TIMEOUT=60       # seconds
OUT="${OUT:-$HERE/results/$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$OUT"

# `timeout` must resolve to GNU coreutils' timeout, not
# C:\Windows\System32\timeout.exe (an interactive countdown tool with
# unrelated flags/semantics that would silently break the dial-side bound if
# PATH ordering ever put it first).
timeout_version="$(timeout --version 2>/dev/null | head -1)"
case "$timeout_version" in
  *coreutils*|*GNU*) ;;
  *) echo "ERROR timeout is not GNU coreutils (found: $(command -v timeout))" >&2; exit 2 ;;
esac

exe () { if [ -x "$1.exe" ]; then echo "$1.exe"; else echo "$1"; fi; }

cmd () { # role impl port
  case "$1:$2" in
    listen:JS)     echo "node $JS_DIR/scripts/node-listener.mjs --port $3" ;;
    dial:JS)       echo "node $JS_DIR/scripts/noise-hfs-dial.mjs --port $3" ;;
    listen:Python) echo "env PYTHONPATH=$PY_DIR $PYTHON $PY_DIR/scripts/interop_listen_mlkem768.py --port $3" ;;
    dial:Python)   echo "env PYTHONPATH=$PY_DIR $PYTHON $PY_DIR/scripts/interop_dial_mlkem768.py --port $3" ;;
    listen:Nim)    echo "$(exe "$NIM_DIR/interop/noise-pq/interop_listen") $3" ;;
    dial:Nim)      echo "$(exe "$NIM_DIR/interop/noise-pq/interop_dial") $3" ;;
    listen:Rust)   echo "$(exe "$RUST_DIR/target/debug/examples/noise_hfs_listener") $3" ;;
    dial:Rust)     echo "$(exe "$RUST_DIR/target/debug/examples/noise_hfs_dialer") $3" ;;
    *) echo "unknown $1:$2" >&2; exit 2 ;;
  esac
}

# First value of "<KEY> <value>" on stdout; tolerates CRLF from Windows runtimes.
field () { tr -d '\r' < "$1" | grep -m1 "^$2 " | cut -d' ' -f2-; }
has_ok () { tr -d '\r' < "$1" | grep -qx 'INTEROP_OK'; }

# --- robust process cleanup -------------------------------------------------
# Git Bash's `kill`/`wait` on a backgrounded native Windows exe (node.exe,
# python.exe, an MSYS-spawned .exe) normally do terminate the real Windows
# process and reap its exit code correctly. As a safety net in case `kill`
# ever leaves an orphan (e.g. a process that spawned children of its own),
# fall back to `taskkill //F //T` against the Windows PID from
# /proc/$pid/winpid. CURRENT_LPID tracks the in-flight listener so a trap can
# clean it up even if the script is interrupted (Ctrl-C) or errors mid-run.
CURRENT_LPID=""

kill_pid () { # pid
  local pid="${1:-}"
  [ -z "$pid" ] && return 0
  if ! kill -0 "$pid" 2>/dev/null; then
    wait "$pid" 2>/dev/null
    return 0
  fi
  kill "$pid" 2>/dev/null
  local tries=0
  while kill -0 "$pid" 2>/dev/null && [ "$tries" -lt 10 ]; do
    sleep 0.2
    tries=$((tries + 1))
  done
  if kill -0 "$pid" 2>/dev/null; then
    local winpid
    winpid="$(cat "/proc/$pid/winpid" 2>/dev/null || true)"
    if [ -n "$winpid" ]; then
      taskkill //F //T //PID "$winpid" >/dev/null 2>&1 || true
    fi
  fi
  wait "$pid" 2>/dev/null
  return 0
}

cleanup () {
  kill_pid "$CURRENT_LPID"
  CURRENT_LPID=""
}
trap cleanup EXIT INT TERM

{
  echo "date_utc $(date -u +%FT%TZ)"
  for d in JS_DIR PY_DIR NIM_DIR RUST_DIR; do
    dir="${!d}"
    echo "$d $dir $(git -C "$dir" rev-parse HEAD 2>/dev/null) $(git -C "$dir" status --porcelain 2>/dev/null | wc -l | tr -d ' ')_dirty"
  done
  node -v; "$PYTHON" --version; nim -v 2>/dev/null | head -1; rustc --version
} > "$OUT/versions.txt" 2>&1

printf 'listener\tdialer\trep\tresult\treasons\n' > "$OUT/results.tsv"
PASS=0; FAIL=0

run_one () { # L D rep
  local L=$1 D=$2 rep=$3 port=$PORT; PORT=$((PORT + 1))
  local tag="${L}-listens_${D}-dials_r${rep}"
  local llog="$OUT/$tag.listener.log" dlog="$OUT/$tag.dialer.log"

  $(cmd listen "$L" "$port") > "$llog" 2>&1 &
  local lpid=$!
  CURRENT_LPID=$lpid
  local ready=0
  for _ in $(seq 1 $READY_TICKS); do
    tr -d '\r' < "$llog" | grep -q '^READY ' && { ready=1; break; }
    # Listener already exited without ever printing READY (e.g. exec
    # failure on a missing binary) — no point burning the rest of the
    # READY_TICKS budget waiting for a line that can now never appear.
    kill -0 "$lpid" 2>/dev/null || break
    sleep 0.2
  done

  if [ "$ready" -ne 1 ]; then
    # Listener never signalled READY: don't launch a dialer that can only
    # hang or race a not-yet-listening port. Kill it, fail fast, and record
    # why (plus its exit code if it already died on its own).
    local why="listener_no_READY "
    if ! kill -0 "$lpid" 2>/dev/null; then
      wait "$lpid"; local lcode=$?
      why+="listener_exit=$lcode "
    fi
    kill_pid "$lpid"
    CURRENT_LPID=""
    : > "$dlog"
    FAIL=$((FAIL + 1)); printf '%s\t%s\t%s\tFAIL\t%s\n' "$L" "$D" "$rep" "$why" >> "$OUT/results.tsv"
    echo "FAIL  $tag  ($why)"
    return
  fi

  timeout "$DIAL_TIMEOUT" $(cmd dial "$D" "$port") > "$dlog" 2>&1
  local dcode=$?

  local lcode=124
  for _ in $(seq 1 $READY_TICKS); do
    if ! kill -0 "$lpid" 2>/dev/null; then wait "$lpid"; lcode=$?; break; fi
    sleep 0.2
  done
  kill_pid "$lpid"
  CURRENT_LPID=""

  local why=""
  [ "$dcode" -eq 0 ] || why+="dialer_exit=$dcode "
  [ "$lcode" -eq 0 ] || why+="listener_exit=$lcode "
  has_ok "$llog" || why+="listener_no_INTEROP_OK "
  has_ok "$dlog" || why+="dialer_no_INTEROP_OK "
  local lpeer dpeer llocal dlocal
  lpeer=$(field "$llog" PEER); dpeer=$(field "$dlog" PEER)
  llocal=$(field "$llog" LOCAL); dlocal=$(field "$dlog" LOCAL)
  [ -n "$lpeer" ] && [ "$lpeer" = "$dlocal" ] || why+="listener_PEER!=dialer_LOCAL "
  [ -n "$dpeer" ] && [ "$dpeer" = "$llocal" ] || why+="dialer_PEER!=listener_LOCAL "
  [ "$(field "$dlog" RECV)" = "hello from $L" ] || why+="dialer_RECV_mismatch "
  [ "$(field "$llog" RECV)" = "hello from $D" ] || why+="listener_RECV_mismatch "

  if [ -z "$why" ]; then
    PASS=$((PASS + 1)); printf '%s\t%s\t%s\tPASS\t-\n' "$L" "$D" "$rep" >> "$OUT/results.tsv"
    echo "PASS  $tag"
  else
    FAIL=$((FAIL + 1)); printf '%s\t%s\t%s\tFAIL\t%s\n' "$L" "$D" "$rep" "$why" >> "$OUT/results.tsv"
    echo "FAIL  $tag  ($why)"
  fi
}

for L in $IMPLS; do for D in $IMPLS; do for rep in $(seq 1 "$REPS"); do
  run_one "$L" "$D" "$rep"
done; done; done

{
  printf '| listener \\ dialer |'; for D in $IMPLS; do printf ' %s |' "$D"; done; echo
  printf '|---|'; for _ in $IMPLS; do printf -- '---|'; done; echo
  for L in $IMPLS; do
    printf '| **%s** |' "$L"
    for D in $IMPLS; do
      n=$(awk -F'\t' -v l="$L" -v d="$D" '$1==l && $2==d && $4=="PASS"' "$OUT/results.tsv" | wc -l | tr -d ' ')
      printf ' %s/%s |' "$n" "$REPS"
    done; echo
  done
} > "$OUT/matrix.md"

echo "=== $PASS passed, $FAIL failed === ($OUT)"
cat "$OUT/matrix.md"
[ "$FAIL" -eq 0 ]
