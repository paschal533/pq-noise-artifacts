# Post-quantum Noise for libp2p, artifacts

Interoperability test vectors, benchmarks and harnesses for
`Noise_XXhfs_25519+ML-KEM-768_ChaChaPoly_SHA256`, a post-quantum hybrid of the Noise XX
handshake, implemented across three libp2p language ecosystems and verified interoperable across
all six pairwise combinations with a fourth, independently written Rust implementation.

The handshake adds an ephemeral KEM step, the Noise HFS tokens `e1` and `ekem1`, alongside the
existing X25519 operations. Forward secrecy holds if **either** X25519 **or** ML-KEM-768 is
unbroken, so classical security is preserved rather than replaced.

The accompanying paper is in preparation and not published anywhere yet. This repository is
published independently so the claims can be checked now.

## The work

| | where |
|---|---|
| Specification | [`libp2p/specs#716`](https://github.com/libp2p/specs/pull/716) |
| TypeScript | [`ChainSafe/js-libp2p-noise#665`](https://github.com/ChainSafe/js-libp2p-noise/pull/665) |
| Python | [`libp2p/py-libp2p#1310`](https://github.com/libp2p/py-libp2p/pull/1310) |
| Nim | [`vacp2p/nim-libp2p#2811`](https://github.com/vacp2p/nim-libp2p/pull/2811) |
| Rust | [`libp2p/rust-libp2p#6481`](https://github.com/libp2p/rust-libp2p/pull/6481), **written independently by [@royzah](https://github.com/royzah)**. Not our work; we tested against it |

## Contents

| path | what it is |
|---|---|
| `vectors/pqc-test-vectors.json` | **the interoperability test vectors.** 5 vectors, fully seeded, covering all three handshake messages |
| `vectors/generate-pqc-vectors.js` | the generator, so the vectors can be regenerated rather than trusted |
| `benchmarks/RESULTS.md` | measured overhead, like for like. **Read this before quoting any ratio** |
| `benchmarks/paired-passes.mjs` | the benchmark, 5 passes x 30 iterations, all four backend/KEM cells |
| `benchmarks/paired-passes-results.json` | raw output |
| `benchmarks/backend-isolation.mjs` | isolates the crypto backend from the KEM |
| `interop/node-listener.mjs`, `interop/noise-hfs-dial.mjs` | the TCP harnesses used for cross-implementation testing |

## Interoperability

All six pairwise combinations across the four implementations have completed a live TCP
handshake, with **no implementation requiring a protocol change to interoperate with any other**.
Protocol identifier `/noise-mlkem768-hfs/0.1.0`.

| | TypeScript | Python | Rust | Nim |
|---|---|---|---|---|
| **TypeScript** | — | 2026-06-24 | 2026-06-24 | 2026-09-05 |
| **Python** | 2026-06-24 | — | 2026-06-24 | 2026-07-11 |
| **Rust** | 2026-06-24 | 2026-06-24 | — | 2026-09-05 |
| **Nim** | 2026-09-05 | 2026-07-11 | 2026-09-05 | — |

The June 2026 triangle (TypeScript, Python, Rust) exchanged an encrypted transport message after
each handshake, not just the handshake itself. That matters more than it sounds: completing a
handshake proves both sides agreed on the handshake hash and the ML-KEM-768 shared secret, but
not that the two cipher states came out of `split()` assigned to the same directions. A swapped
`cs1`/`cs2` still completes and reports success, failing only on the first data frame. Because
`split()` gives initiator and responder opposite states, a one-directional test leaves one
transport key unverified.

The Nim to TypeScript pair was exercised in both roles for that reason. The Nim to Rust pair is
handshake-only, because the Rust tree provides a listener example but no dialer.

**The Rust implementation is [`libp2p/rust-libp2p#6481`](https://github.com/libp2p/rust-libp2p/pull/6481),
written independently by [@royzah](https://github.com/royzah). It is not our work.** Nim also uses
a different ML-KEM-768 library again, BoringSSL, rather than `@noble/post-quantum`, `kyber-py` or
RustCrypto's `ml-kem`. Four implementations written independently against the prose specification,
against four different KEM libraries, interoperating without protocol changes, is reasonable
evidence that the specification is unambiguous at the wire level.

## Headline result

Measured with the cryptographic backend held constant, the post-quantum hybrid handshake costs
**1.51x** a classical one, per-pass range 1.51 to 1.58. Comparing the two *default*
configurations instead gives 3.54x, but `noise()` defaults to a native backend while
`noiseHFS()` defaults to a pure-JavaScript one, so that comparison varies the backend alongside
the KEM. Of the 17.3 ms between the defaults, over four fifths is the backend substitution and
about 3.5 ms is the KEM.

For context across implementations of the same protocol, holding each one's backend constant:
**10.7x** in Python (`kyber-py`, pure Python lattice arithmetic), **1.51x** in JavaScript,
**1.24x** in Rust (RustCrypto `ml-kem`) and **1.13x** in Nim (BoringSSL). Three of four cluster
between 1.1x and 1.5x. A lower ratio is not automatically better: Nim's is partly a larger
denominator, since only its KEM reaches BoringSSL while its classical primitives do not.

Full numbers, method and limitations in [`benchmarks/RESULTS.md`](benchmarks/RESULTS.md).

## A note on what is current

The implementation migrated from X-Wing to raw ML-KEM-768. Everything in this repository reflects
that. If you are reading `NOISE_HFS_SPEC.md` or `benchmarks/results.md` inside the TypeScript PR,
note that both still describe the earlier X-Wing design and its wire sizes (1,248 / 1,232 / 64).
The current sizes are 1,216 / 1,200 / 64, which the vectors here demonstrate and
[`libp2p/specs#716`](https://github.com/libp2p/specs/pull/716) specifies.

## Licence

Vectors and documentation: CC BY 4.0. Code: MIT.
