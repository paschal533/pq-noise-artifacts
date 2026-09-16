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

## Independent interop

The Rust implementation in `libp2p/rust-libp2p#6481` was written independently by
[@royzah](https://github.com/royzah). We did not contribute to it.

Live TCP interop run across **all six pairwise combinations** of the four implementations, with
no protocol changes needed anywhere:

| pairing | roles tested | result |
|---|---|---|
| Rust listener + Python dialer | one direction | pass |
| Rust listener + JS dialer | one direction | pass |
| Python listener + JS dialer | one direction | pass |
| Python + Nim | both | pass |
| Nim + JS | both, nim listening and nim dialling | pass |
| Nim + Rust | nim dialling only | pass |

The Rust pairings are one-directional because `rust-libp2p` ships a listener example but no
dialer. The Nim pairings were completed 2026-09-05 and are recorded on
`vacp2p/nim-libp2p#2811`.

The runner for the first three is `scripts/interop_all.sh` in `libp2p/py-libp2p#1310`. The
Python-against-Rust transcript:

```
msg1 sent:     1216 bytes (e_pk=32, e1_pk=1184)
msg2 received: 1304 bytes          # 1200 at the snow layer, plus libp2p identity payload
msg3 sent:      168 bytes
HANDSHAKE COMPLETE
```

Implementations written separately from the same specification and interoperating on the wire
are stronger evidence that the specification is unambiguous than any number of implementations by
one author. That is why the Rust pairings matter most here: that implementation is not ours.

## The test vectors are the point

Independent implementations agreeing on a handshake are only meaningful if they agree on the
same bytes. Every key in these vectors is seeded from a fixed base byte, the prologue and payload
are empty, and the encapsulation seed is fixed, so all three messages are fully deterministic and
any implementation can check itself against them without running a peer.

```
protocol   Noise_XXhfs_25519+ML-KEM-768_ChaChaPoly_SHA256
kem        ML-KEM-768 (FIPS 203) via @noble/post-quantum
msg A      1,216 bytes    (32 B e  +  1,184 B ML-KEM-768 encapsulation key)
msg B      1,200 bytes    (32 B e  +  1,104 B ekem1  +  encrypted static  +  tag)
msg C         64 bytes    (unchanged from classical XX)
```

These are **test** keys, seeded deterministically and published deliberately. They are not secret
and must never be used for anything.

## Headline result

Measured like for like, the post-quantum hybrid handshake costs **1.13x to 1.61x** a classical
one, depending on the crypto backend. The commonly quoted ~3.5x figure compares a pure-JavaScript
hybrid handshake against a native-backend classical one, which changes the KEM and the entire
symmetric/DH backend at once and then attributes the whole difference to the KEM.

Separately, and more usefully: **the crypto backend choice costs about four times more than adding
ML-KEM-768** (roughly 14 ms against roughly 3.5 ms). In JavaScript, the post-quantum primitive is
not the expensive part of a post-quantum handshake.

Full numbers, method and limitations in [`benchmarks/RESULTS.md`](benchmarks/RESULTS.md).

## A note on what is current

The implementation migrated from X-Wing to raw ML-KEM-768. Everything in this repository reflects
that. If you are reading `NOISE_HFS_SPEC.md` or `benchmarks/results.md` inside the TypeScript PR,
note that both still describe the earlier X-Wing design and its wire sizes (1,248 / 1,232 / 64).
The current sizes are 1,216 / 1,200 / 64, which the vectors here demonstrate and
[`libp2p/specs#716`](https://github.com/libp2p/specs/pull/716) specifies.

## Licence

Vectors and documentation: CC BY 4.0. Code: MIT.
