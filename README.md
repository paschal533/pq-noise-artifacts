# Post-quantum Noise for libp2p, artifacts

Interoperability test vectors, benchmarks and harnesses for
`Noise_XXhfs_25519+MLKEM768_ChaChaPoly_SHA256`, a post-quantum hybrid of the Noise XX
handshake, implemented across three libp2p language ecosystems and verified interoperable, in
both directions, with each other and with a fourth, independently written Rust implementation.

The handshake adds an ephemeral KEM step, the Noise HFS tokens `e1` and `ekem1`, alongside the
existing X25519 operations. Forward secrecy holds if **either** X25519 **or** ML-KEM-768 is
unbroken, so classical security is preserved rather than replaced.

<p align="center">
  <img src="docs/xxhfs-handshake.svg" width="880"
       alt="Noise XXhfs sequence: message A carries e and e1 (1,216 bytes), message B carries e, ee, ekem1, s, es (1,200 bytes), message C carries s, se (64 bytes), then encrypted transport frames on c1 and c2 in opposite directions">
</p>

Message sizes assume an empty handshake payload. The two transport frames are drawn separately
because `split()` gives each direction its own key, and only a frame in each direction checks both
(see [Interoperability](#interoperability)). Diagram source:
[`docs/xxhfs-handshake.sequence.json`](docs/xxhfs-handshake.sequence.json), rendered with
[archify](https://github.com/tt-a1i/archify).

The accompanying paper is in preparation and not published anywhere yet. This repository is
published independently so the claims can be checked now.

**Name change.** Earlier versions of this profile were called
`Noise_XXhfs_25519+ML-KEM-768_ChaChaPoly_SHA256`. Noise (revision 34, §8.2) allows only
alphanumeric characters and `/` in an algorithm name, so the profile is now
`Noise_XXhfs_25519+MLKEM768_ChaChaPoly_SHA256`; [@royzah](https://github.com/royzah) spotted it.
The name is hashed into the handshake, so the two are not wire-compatible, and the protocol
identifier moved from `/noise-mlkem768-hfs/0.1.0` to `/noise-mlkem768-hfs/0.2.0`. Message sizes
are unchanged. `/noise-mlkem768-hfs/0.2.0` is what the four implementations ship, not a
spec-endorsed identifier: [`libp2p/specs#727`](https://github.com/libp2p/specs/pull/727) writes
`/noise-mlkem768-hfs/0.1.0` and lists the identifier string as the first of its open issues. The
implementations will follow whatever #727 settles on.

## The work

| | where |
|---|---|
| Specification | [`libp2p/specs#727`](https://github.com/libp2p/specs/pull/727), a Stage 1A Working Draft **by [@royzah](https://github.com/royzah)**. Not our work; our own draft, [`libp2p/specs#716`](https://github.com/libp2p/specs/pull/716), was closed on 2026-09-18 in favour of it and its material was offered to #727. The closed text stays readable at [paschal533/specs `noise-pq`](https://github.com/paschal533/specs/tree/master/noise-pq) |
| TypeScript | [`ChainSafe/js-libp2p-noise#665`](https://github.com/ChainSafe/js-libp2p-noise/pull/665) |
| Python | [`libp2p/py-libp2p#1310`](https://github.com/libp2p/py-libp2p/pull/1310) |
| Nim | [`vacp2p/nim-libp2p#2811`](https://github.com/vacp2p/nim-libp2p/pull/2811) |
| Rust | [`libp2p/rust-libp2p#6481`](https://github.com/libp2p/rust-libp2p/pull/6481), **written independently by [@royzah](https://github.com/royzah)**. Not our work; we tested against it |
| Rust interop harness | [`royzah/rust-libp2p#1`](https://github.com/royzah/rust-libp2p/pull/1): our listener and dialer examples and benchmarks, on top of #6481 |

## Contents

| path | what it is |
|---|---|
| `vectors/pqc-test-vectors.json` | **the interoperability test vectors.** 5 vectors, fully seeded, covering all three handshake messages |
| `vectors/generate-pqc-vectors.js` | the generator, so the vectors can be regenerated rather than trusted |
| `benchmarks/RESULTS.md` | measured overhead, like for like. **Read this before quoting any ratio** |
| `benchmarks/paired-passes.mjs` | the benchmark, 5 passes x 30 iterations, all four backend/KEM cells |
| `benchmarks/paired-passes-results.json` | raw output |
| `benchmarks/backend-isolation.mjs` | isolates the crypto backend from the KEM |
| `interop/run-matrix.sh` | the neutral runner for the bidirectional interop matrix |
| `interop/results/20260919T223056Z/` | the matrix run: `matrix.md`, `results.tsv`, `versions.txt` and all 96 per-run logs. The first run whose `versions.txt` provenance is fetchable: remote and branch are derived from a remote-tracking ref pointing at HEAD, so every row resolves (the earlier runs `20260917T015709Z`, `20260917T102958Z`, `20260917T134954Z`, `20260917T213457Z`, `20260919T053615Z` and `20260919T110704Z`, superseded, are kept beside it) |
| `interop/negative-controls/20260917T134954Z/`, `interop/negative-controls/20260917/` | two negative controls showing the matrix checks can fail (control A, run with the `20260917T134954Z` matrix, in the first; control B in the second; `interop/negative-controls/20260917T102958Z/` holds control A for the superseded run `20260917T102958Z`) |
| `interop/node-listener.mjs`, `interop/noise-hfs-dial.mjs`, `interop/interop-io.mjs` | reference copies of the TypeScript harnesses (the runner uses the JS repository's own copies) |

## Interoperability

Protocol identifier `/noise-mlkem768-hfs/0.2.0`, as shipped by the four implementations (see the
note above on #727's open identifier question). Every ordered pairing of the four
implementations, including each against itself, was run three times on 2026-09-19:
**48 runs, 48 passed**, with **no implementation requiring a protocol change to interoperate
with any other**.

| listener \ dialer | JS | Python | Nim | Rust |
|---|---|---|---|---|
| **JS** | 3/3 | 3/3 | 3/3 | 3/3 |
| **Python** | 3/3 | 3/3 | 3/3 | 3/3 |
| **Nim** | 3/3 | 3/3 | 3/3 | 3/3 |
| **Rust** | 3/3 | 3/3 | 3/3 | 3/3 |

Run directory: [`interop/results/20260919T223056Z/`](interop/results/20260919T223056Z/). Runner:
[`interop/run-matrix.sh`](interop/run-matrix.sh). Every harness follows one stdout contract
(`READY <port>` for listeners, then `LOCAL <peer-id>`, `PEER <peer-id>`,
`SENT hello from <Impl>`, `RECV <line>`, and `INTEROP_OK` last). A run passes only if:

- both processes exit 0 and print `INTEROP_OK`;
- the listener's `PEER` equals the dialer's `LOCAL` and the dialer's `PEER` equals the listener's
  `LOCAL`, which requires each side to have decrypted the other's static key and payload (possible
  only if both derived the same handshake hash) and to have verified the identity signature over
  that static key;
- the listener sends `hello from <Impl>` as an encrypted transport message, the dialer decrypts it
  and replies in kind, and each side's `RECV` line names the other implementation.

That last check matters more than it sounds. Completing a handshake proves both sides agreed on
the handshake hash and the ML-KEM-768 shared secret, but not that the two cipher states came out
of `split()` assigned to the same directions. A swapped `cs1`/`cs2` still completes and reports
success, failing only on the first data frame. Because `split()` gives initiator and responder
opposite states, a one-directional test leaves one transport key unverified, so every run here
sends one message each way, and every pair runs in both orderings.

Implementations tested (from `versions.txt`): JS `0c55599`, Python `c8d16e63`, Nim `b3f203d`,
Rust `bdd417e` (royzah's `a648280` plus our harness commits and the move to the 0.2.0 identifier, `c2e4e30`). Node.js v22.17.1, Python 3.13.14,
Nim 2.2.10, rustc 1.95.0. All runs were over loopback TCP on one Windows 11 machine. The
harnesses start the hybrid handshake directly on the TCP connection, without multistream-select,
so the run checks the handshake and transport encryption, not negotiation of the protocol id.
The Python side of this run used `MLKEM768NativeKem`, the C-backed ML-KEM-768 backend that
`make_fast_kem()` has selected by default since py-libp2p `c8d16e63`. None of the 96 logs carries
the fallback warning that backend selection emits when it drops to `kyber-py`, which is the
positive evidence that the C-backed path was the one under test. The wire format is unchanged:
the same 48 of 48 ordered pairings pass against the TypeScript, Nim and Rust implementations.

This run repeats the matrix after a round of security and robustness fixes landed in three of the
four implementations: strict handshake length validation and a typed malformed-message error in
Python, a bounded and sanitised greeting reader in the Python, TypeScript and Rust interop
harnesses, and an overall deadline on each harness. The fixes touch the exact stdout lines the
runner grades, so the matrix was re-run in full rather than partially. The earlier run
`20260917T213457Z` covered the same four implementations before those fixes.

**Negative controls** (control A, run with the `20260917T134954Z` matrix: [`interop/negative-controls/20260917T134954Z/`](interop/negative-controls/20260917T134954Z/); control B, from the earlier run `20260917T015709Z`: [`interop/negative-controls/20260917/`](interop/negative-controls/20260917/)).
With the TypeScript implementation rebuilt under the old hyphenated name and nothing else changed,
all six orderings against Python, Nim and Rust failed with AEAD tag or decryption errors while the
dialer read message B, and the same-implementation pairs passed. With a TypeScript dialer that
printed a fake `LOCAL` identity, the handshake and both messages completed and the identity
cross-check caught it.

**Earlier claims, corrected.** A previous version of this README showed a pairwise table dated
June to September 2026 and said the June 2026 triangle (TypeScript, Python, Rust) had exchanged an
encrypted transport message after each handshake. It had not. The runner used then counted a pair
as passing when the dialer exited cleanly and printed a peer identity, and no transport frames were
exchanged; the Python dialer was also a standalone re-implementation of the handshake rather than
py-libp2p's `PatternXXhfs`. The
previous version also said the Rust tree provided a listener example but no dialer. That listener
was ours, from `royzah/rust-libp2p#1`, not part of #6481. Those earlier Rust runs also predate
royzah's current code: they used our `royzah/rust-libp2p#1` branch, whose `Cargo.lock` pins
`royzah/snow` at commit `407dd90` of 14 June 2026, which still spelled the suite `ML-KEM-768`.
royzah renamed it to `MLKEM768` on 17 August 2026 (snow `858dc27`; rust-libp2p `1ae21ce`, later
rebased as `e7a1286`), and the rename was on the #6481 branch by 22 August 2026 at the latest, so the
5 September run was already behind the pull request. The matrix above replaces those claims.

**The Rust implementation is [`libp2p/rust-libp2p#6481`](https://github.com/libp2p/rust-libp2p/pull/6481),
written independently by [@royzah](https://github.com/royzah). It is not our work.** Nim also uses
a different ML-KEM-768 library again, BoringSSL, rather than `@noble/post-quantum`, `kyber-py` or
RustCrypto's `ml-kem`. Four implementations written independently against the prose specification,
against four different KEM libraries, interoperating without protocol changes, is reasonable
evidence that the specification is unambiguous at the wire level.

## Headline result

Measured with the cryptographic backend held constant, the post-quantum hybrid handshake costs
**1.51x** a classical one, per-pass range 1.51 to 1.61. Comparing the two *default*
configurations instead gives 3.54x, but `noise()` defaults to a native backend while
`noiseHFS()` defaults to a pure-JavaScript one, so that comparison varies the backend alongside
the KEM. Of the 17.3 ms between the defaults, over four fifths is the backend substitution and
about 3.5 ms is the KEM.

For context across implementations of the same protocol, holding each one's backend constant:
**10.7x** in Python (`kyber-py`, pure Python lattice arithmetic), **1.51x** in JavaScript,
**1.24x** in Rust (RustCrypto `ml-kem`) and **1.13x** in Nim (BoringSSL). Three of four cluster
between 1.1x and 1.5x. A lower ratio is not automatically better: Nim's is partly a larger
denominator, since only its KEM reaches BoringSSL while its classical primitives do not.

**The Python figure has since been superseded within Python.** Every figure above names its KEM
backend because the backend is what the figure is about, and Python's changed on 2026-09-19.
py-libp2p now defaults to `MLKEM768NativeKem`, which reaches ML-KEM-768 in C through the
`cryptography` package (OpenSSL 3.5+, AWS-LC or BoringSSL), and keeps `kyber-py` as a
pure-Python fallback behind a warning. Measured as alternating paired arms of one session, four
passes of thirty iterations, py-libp2p at `c8d16e63`:

| Python arm | classical `Noise_XX` | hybrid `Noise_XXhfs` | overhead | KEM share |
|---|---:|---:|---:|---:|
| `kyber-py` (pure Python) | 2.25 to 2.30 ms | 24.73 to 25.31 ms | 10.76x to 10.87x | ~91% |
| `MLKEM768NativeKem` (C-backed) | 2.05 to 2.21 ms | 2.99 to 3.15 ms | **1.42x to 1.44x** | ~30% |

The `kyber-py` arm is the control, and it reproduces the 10.7x and the ~91% published from the
10 September session, which is what makes this a before and after of one change rather than two
benchmarks on two days. The wire format, the deterministic vectors and the interop matrix are
unchanged. So the correct reading of the four-language table above is that Python's **10.7x is
the `kyber-py` measurement**, retained because it is the control, and that the same
implementation measures **1.42x** on the backend it now ships with.

The four-language figures are the ones the paper reports, from its September 2026 measurement
sessions. [`benchmarks/RESULTS.md`](benchmarks/RESULTS.md) reports a 2026-09-17 re-run on the
renamed suite, whose absolute latencies are not comparable with the published figures.

## Licence

Vectors and documentation: CC BY 4.0. Code: MIT.
