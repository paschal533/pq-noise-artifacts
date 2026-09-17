# Negative control A, re-run with the matrix run 20260917T134954Z

Control A re-run alongside the matrix in
[`../../results/20260917T134954Z/`](../../results/20260917T134954Z/), to show that its pass
criteria can fail against the implementation revisions that matrix tested. Control B was not
re-run; its archive, from the earlier run
[`../../results/20260917T015709Z/`](../../results/20260917T015709Z/), is in
[`../20260917/B-fake-identity/`](../20260917/B-fake-identity/).

## A: old protocol name (`A-old-name/`)

**Change.** The TypeScript implementation at `a183009`, with one constant reverted: the protocol
name set back to the old, hyphenated `Noise_XXhfs_25519+ML-KEM-768_ChaChaPoly_SHA256`. Nothing
else changed, and the change was not committed. Python (`cea85ba7`), Nim (`2b8efb5`) and Rust
(`00d7765`) were unchanged, using `Noise_XXhfs_25519+MLKEM768_ChaChaPoly_SHA256`.

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
subdirectory holds the runner's `matrix.md`, `results.tsv`, `versions.txt` and per-run logs.
The runner records repository names, not local paths, in `versions.txt`; `wt-js-oldname` is the
temporary worktree holding the modified TypeScript build, which is why it is recorded as
`1_dirty`.

## Not included

The combined console transcript is not published because it contains local filesystem paths.
