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
# so that PYTHONPATH=$PY_DIR resolves the right package. PYTHON is one
# executable path (it may contain spaces), not a command line.
#
# OUT is where the run writes versions.txt, results.tsv, matrix.md and two
# logs per run. Leave it unset for interop/results/<UTC timestamp>, or set it
# to put a run elsewhere. If it is set it must be non-empty, must not contain
# '..', and must name a directory that does not exist or is empty: the script
# refuses to add a run to a directory that already holds files, rather than
# silently mixing or overwriting two runs' output.
#
# IMPLS must name known implementations, REPS must be a positive integer and
# BASE_PORT a port such that every run's port stays <= 65535; otherwise the
# script prints ERROR and exits 2 before starting anything. OUT is validated
# in the same place, before any directory is created or process started.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
: "${JS_DIR:?set JS_DIR}" "${PY_DIR:?set PY_DIR}" "${NIM_DIR:?set NIM_DIR}" "${RUST_DIR:?set RUST_DIR}"
PYTHON="${PYTHON:-python}"
IMPLS="${IMPLS:-JS Python Nim Rust}"
REPS="${REPS:-3}"
PORT="${BASE_PORT:-9400}"
READY_TICKS=150       # x 0.2 s
DIAL_TIMEOUT=60       # seconds
# ${OUT-...}, not ${OUT:-...}: an unset OUT takes the default, but an OUT that
# is set to the empty string is a configuration mistake (an empty env: entry in
# a workflow, say) and is rejected below rather than silently writing the run
# into the repository's own results/ directory.
OUT="${OUT-$HERE/results/$(date -u +%Y%m%dT%H%M%SZ)}"
KNOWN_IMPLS=(JS Python Nim Rust)

die () { echo "ERROR $*" >&2; exit 2; }

read -r -a IMPL_LIST <<< "$IMPLS"
[ "${#IMPL_LIST[@]}" -gt 0 ] || die "IMPLS is empty"
for impl in "${IMPL_LIST[@]}"; do
  case " ${KNOWN_IMPLS[*]} " in
    *" $impl "*) ;;
    *) die "unknown implementation in IMPLS: '$impl' (known: ${KNOWN_IMPLS[*]})" ;;
  esac
done
[[ "$REPS" =~ ^[1-9][0-9]{0,3}$ ]] || die "REPS must be an integer from 1 to 9999 (got '$REPS')"
[[ "$PORT" =~ ^[1-9][0-9]{0,4}$ ]] || die "BASE_PORT must be a positive integer port (got '$PORT')"
LAST_PORT=$((PORT + ${#IMPL_LIST[@]} * ${#IMPL_LIST[@]} * REPS - 1))
[ "$LAST_PORT" -le 65535 ] || die "BASE_PORT=$PORT needs ports up to $LAST_PORT, beyond 65535"

# OUT decides where every file this script writes lands, so validate it
# alongside its siblings rather than trusting it.
case "$OUT" in
  "")   die "OUT is set but empty (unset it to use the default results directory)" ;;
  *..*) die "OUT must not contain '..' (got '$OUT')" ;;
esac
if [ -e "$OUT" ] && [ ! -d "$OUT" ]; then
  die "OUT exists and is not a directory: $OUT"
fi
# Never add a run to a directory that already holds one. Two runs sharing an
# OUT interleave their appends to results.tsv and overwrite each other's
# versions.txt and matrix.md, which is silent and produces a corrupt matrix.
if [ -d "$OUT" ] && [ -n "$(ls -A "$OUT" 2>/dev/null)" ]; then
  die "OUT already exists and is not empty, refusing to overwrite: $OUT"
fi
mkdir -p "$OUT" || die "cannot create output directory: $OUT"

# noclobber: every file below is written exactly once, so a '>' that would
# truncate an existing file, or follow a symlink planted at a predictable
# results path, now fails instead of succeeding quietly.
set -C

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

# Sets the array CMD to the command for role/impl/port. An array rather than
# an echoed string, so directory paths containing spaces stay one argument.
set_cmd () { # role impl port
  case "$1:$2" in
    listen:JS)     CMD=(node "$JS_DIR/scripts/node-listener.mjs" --port "$3") ;;
    dial:JS)       CMD=(node "$JS_DIR/scripts/noise-hfs-dial.mjs" --port "$3") ;;
    listen:Python) CMD=(env "PYTHONPATH=$PY_DIR" "$PYTHON" "$PY_DIR/scripts/interop_listen_mlkem768.py" --port "$3") ;;
    dial:Python)   CMD=(env "PYTHONPATH=$PY_DIR" "$PYTHON" "$PY_DIR/scripts/interop_dial_mlkem768.py" --port "$3") ;;
    listen:Nim)    CMD=("$(exe "$NIM_DIR/interop/noise-pq/interop_listen")" "$3") ;;
    dial:Nim)      CMD=("$(exe "$NIM_DIR/interop/noise-pq/interop_dial")" "$3") ;;
    listen:Rust)   CMD=("$(exe "$RUST_DIR/target/debug/examples/noise_hfs_listener")" "$3") ;;
    dial:Rust)     CMD=("$(exe "$RUST_DIR/target/debug/examples/noise_hfs_dialer")" "$3") ;;
    *) die "unknown $1:$2" ;;
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

# A commit SHA on its own does not tell a reader which repository or branch to
# fetch it from, and a local directory basename (wt-js-rename) is not a
# published pointer to anything. Record the origin URL and the branch as well.
#
# Still no local filesystem paths: the basename is published rather than the
# absolute path (that was deliberate and stays), and a remote URL that is
# itself a local path or a file:// URL is replaced by a placeholder rather
# than published.
scrub_remote () { # url
  case "$1" in
    "")                                       printf 'no-remote' ;;
    http://*|https://*|git://*|ssh://*)       printf '%s' "$1" ;;
    *@*:*)                                    printf '%s' "$1" ;;  # scp-style git@host:path
    *)                                        printf 'local-or-file-url-redacted' ;;
  esac
}
git_or () { # dir fallback args...
  local dir="$1" fallback="$2" v; shift 2
  v="$(git -C "$dir" "$@" 2>/dev/null)" && [ -n "$v" ] || v="$fallback"
  printf '%s' "$v"
}

{
  echo "date_utc $(date -u +%FT%TZ)"
  echo "# fields: var basename remote branch commit dirty_lines"
  for d in JS_DIR PY_DIR NIM_DIR RUST_DIR; do
    dir="${!d}"
    echo "$d $(basename "$dir")" \
         "$(scrub_remote "$(git -C "$dir" remote get-url origin 2>/dev/null)")" \
         "$(git_or "$dir" unknown-branch rev-parse --abbrev-ref HEAD)" \
         "$(git_or "$dir" unknown-commit rev-parse HEAD)" \
         "$(git -C "$dir" status --porcelain 2>/dev/null | wc -l | tr -d ' ')_dirty"
  done
  node -v; "$PYTHON" --version; nim -v 2>/dev/null | head -1; rustc --version
} > "$OUT/versions.txt" 2>&1

printf 'listener\tdialer\trep\tresult\treasons\n' > "$OUT/results.tsv"
PASS=0; FAIL=0

run_one () { # L D rep
  local L=$1 D=$2 rep=$3 port=$PORT; PORT=$((PORT + 1))
  local tag="${L}-listens_${D}-dials_r${rep}"
  local llog="$OUT/$tag.listener.log" dlog="$OUT/$tag.dialer.log"

  set_cmd listen "$L" "$port"
  "${CMD[@]}" > "$llog" 2>&1 &
  local lpid=$!
  CURRENT_LPID=$lpid
  local ready=0
  for _ in $(seq 1 $READY_TICKS); do
    tr -d '\r' < "$llog" | grep -q '^READY ' && { ready=1; break; }
    # Listener already exited without ever printing READY (e.g. exec
    # failure on a missing binary), so there is no point burning the rest of the
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

  set_cmd dial "$D" "$port"
  timeout "$DIAL_TIMEOUT" "${CMD[@]}" > "$dlog" 2>&1
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

for L in "${IMPL_LIST[@]}"; do for D in "${IMPL_LIST[@]}"; do for rep in $(seq 1 "$REPS"); do
  run_one "$L" "$D" "$rep"
done; done; done

{
  printf '| listener \\ dialer |'; for D in "${IMPL_LIST[@]}"; do printf ' %s |' "$D"; done; echo
  printf '|---|'; for _ in "${IMPL_LIST[@]}"; do printf -- '---|'; done; echo
  for L in "${IMPL_LIST[@]}"; do
    printf '| **%s** |' "$L"
    for D in "${IMPL_LIST[@]}"; do
      n=$(awk -F'\t' -v l="$L" -v d="$D" '$1==l && $2==d && $4=="PASS"' "$OUT/results.tsv" | wc -l | tr -d ' ')
      printf ' %s/%s |' "$n" "$REPS"
    done; echo
  done
} > "$OUT/matrix.md"

echo "=== $PASS passed, $FAIL failed === ($OUT)"
cat "$OUT/matrix.md"
[ "$FAIL" -eq 0 ]
