# Negative controls, 2026-09-17

Two controls run alongside the matrix in
[`../../results/20260917T015709Z/`](../../results/20260917T015709Z/), to show that its pass
criteria can fail. A matrix in which everything passes is only informative if they can.

## A: old protocol name (`A-old-name/`)

**Change.** The TypeScript implementation at `236525e`, with one constant reverted: the protocol
name set back to the old, hyphenated `Noise_XXhfs_25519+ML-KEM-768_ChaChaPoly_SHA256`. Nothing
else changed, and the change was not committed. Python (`47c8f99b`), Nim (`f9c959b`) and Rust
(`cd0b0d9`) were unchanged, using `Noise_XXhfs_25519+MLKEM768_ChaChaPoly_SHA256`.

**Method.** `interop/run-matrix.sh` with `REPS=1`, once for each of Python, Nim and Rust against the
modified TypeScript build (`IMPLS="JS <other>"`), giving one subdirectory each.

**Expected.** The protocol name is hashed into `h` and `ck`, so every cross-implementation pairing
should fail at the first AEAD decryption, and same-implementation pairings should still pass.

**Observed.**

| pairing | result | dialer error |
|---|---|---|
| JS (old) listens, JS (old) dials | PASS | - |
| JS (old) listens, Python dials | FAIL | `ERROR InvalidTag()` |
| Python listens, JS (old) dials | FAIL | `ERROR pq-handshake stage 1: invalid tag` |
| Python listens, Python dials | PASS | - |
| JS (old) listens, Nim dials | FAIL | `ERROR decryptWithAd failed tag authentication.` |
| Nim listens, JS (old) dials | FAIL | `ERROR pq-handshake stage 1: invalid tag` |
| Nim listens, Nim dials | PASS | - |
| JS (old) listens, Rust dials | FAIL | `ERROR handshake failed: decrypt error` |
| Rust listens, JS (old) dials | FAIL | `ERROR pq-handshake stage 1: invalid tag` |
| Rust listens, Rust dials | PASS | - |

All six cross-implementation pairings failed, each with the dialer failing AEAD tag
authentication or decryption while reading message B; the listeners then saw the connection close.
The four same-implementation pairings passed (JS against JS once in each subdirectory). Each
subdirectory holds the runner's `matrix.md`, `results.tsv` and per-run logs.

## B: fabricated identity (`B-fake-identity/`)

**Change.** A copy of the TypeScript dialer altered to print a fake `LOCAL` line
(`12D3KooWxxxx...`) instead of its real peer id. Listener: the TypeScript listener, on port 9390.

**Expected.** The handshake and the greeting exchange succeed, and only the identity cross-check
(listener's `PEER` against dialer's `LOCAL`) detects the fault.

**Observed.** `bd.log` (dialer) and `bl.log` (listener): both sides printed `INTEROP_OK`, and both
`RECV` lines were `hello from JS`. The dialer's `LOCAL` did not match the listener's
`PEER 12D3KooWMYbF8gQ11mcdjtXuqvYmxpVNPof9Ka3xoPg4FFGy7Prr`, and the cross-check reported the
mismatch.

## Not included

The per-subdirectory `versions.txt` files and the combined console transcript are not published
because they contain local filesystem paths. The revisions they record are the ones listed above.
