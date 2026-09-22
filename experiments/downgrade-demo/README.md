# libp2p security-protocol downgrade demonstration

This experiment executes, rather than argues, the on-path downgrade described in
the security audit finding A-1. It stands up real js-libp2p nodes that negotiate
their connection encrypter over plaintext multistream-select, and shows an
on-path attacker silently forcing two post-quantum-capable peers onto classical
`/noise`.

## The claim being demonstrated

Two peers that both support the hybrid post-quantum encrypter
`/noise-mlkem768-hfs/0.2.0` and also support classical `/noise`, and that prefer
the hybrid one, can be silently forced onto classical `/noise` by an on-path
attacker who strips the hybrid line from the plaintext multistream-select
exchange. Both peers end up with a valid, mutually authenticated classical
session, and neither can tell it was downgraded.

libp2p negotiates the connection encrypter over multistream-select **before** any
encryption is established, so those bytes are plaintext and carry no integrity
protection. The attacker never forges a signature and never breaks any crypto: it
only edits a protocol string in the clear.

## What the harness contains

- `nodes.mjs` builds two real js-libp2p nodes over TCP, each configured with
  `connectionEncrypters: [noiseHFS(), noise()]` (hybrid first, classical
  fallback) and a yamux muxer. Identities are derived from fixed seeds so the
  PeerIds are stable across runs.
- `proxy.mjs` is a plain TCP proxy on `127.0.0.1`. It parses the length-prefixed
  multistream-select frames on the dialer-to-listener path. In **tap** mode it
  relays every byte unmodified and only records what it sees. In **attack** mode
  it rewrites the hybrid proposal `/noise-mlkem768-hfs/0.2.0` to an unknown
  protocol id of identical byte length (`/noise-mlkem768-xxx/0.2.0`) so that the
  real listener itself answers `na`; the dialer then falls back to `/noise`. It
  touches nothing else and never inspects the encrypted stream that follows.
- `run-demo.mjs` runs three phases and prints them side by side, writing raw
  evidence to `output/`.

## How to run

```
NOISE_IMPL_DIR=/path/to/js-libp2p-noise npm run demo
```

`NOISE_IMPL_DIR` must point at a checkout of the js-libp2p-noise implementation
that provides `noiseHFS()`, built with `pnpm build` (so `dist/src/index.js`
exists) and with its `node_modules` installed. If the variable is unset, the
harness looks for a sibling working tree so it runs out of the box inside the
research workspace.

No install step is required in this directory. `setup.mjs` links this
directory's `node_modules` to the implementation checkout's `node_modules` (a
directory junction on Windows, a symlink elsewhere). This deliberately reuses the
exact dependency set the implementation was built and audited against, which
avoids the dual-package hazard that a separate install of libp2p would create
(two copies of `@libp2p/interface` break `instanceof`/symbol checks). The link is
read-only with respect to the implementation checkout; nothing is written into
it.

The run is deterministic and re-runnable. It exits `0` on success and writes:

- `output/results.json` : structured result of every phase plus provenance.
- `output/transcript-*.json` : the exact multistream-select frames observed on
  the wire for each relayed phase, with the attacker's single edit recorded.
- `output/console-log.txt` : the full human-readable console output.

## What the output means

Five phases run. The first three demonstrate the attack, the last two
re-run it against the transcript-bound defence:

1. **baseline-direct** : dialer connects straight to the listener, no
   intermediary. Both peers negotiate `/noise-mlkem768-hfs/0.2.0`. This is the
   control: without an attacker, the hybrid encrypter wins.
2. **baseline-tap** : dialer connects through the passive relay, which does not
   modify bytes. Result is identical (both hybrid), and the wire transcript shows
   the dialer proposing `/noise-mlkem768-hfs/0.2.0` and the listener echoing it.
   A passive relay is byte-for-byte identical to a direct connection; it exists
   only to record the wire, and the attack phase reuses the same relay code with
   the single rewrite enabled.
3. **attack** : dialer connects through the active on-path proxy. The wire
   transcript shows the hybrid proposal rewritten, the listener answering `na`,
   the dialer proposing `/noise`, and the listener selecting `/noise`. Both peers
   report `connection.encryption === '/noise'`.

4. **baseline-tap-defended** : same passive relay as phase 2, but both peers
   enable transcript-bound negotiation (`transcriptBinding` in enforce mode,
   offering the same two protocols). Both still negotiate
   `/noise-mlkem768-hfs/0.2.0`. This is the false-positive control: the defence
   must not break an honest connection.
5. **attack-defended** : the same active rewrite as phase 3, against defended
   peers. No session is established. The dialer refuses with
   `ERR_SECURITY_PROTOCOL_DOWNGRADE`, naming the protocol that should have been
   negotiated and the two offers that imply it.

Phases 4 and 5 are what turns the finding into a fix: the attacker's single
edit is unchanged, and the outcome moves from a silently downgraded working
session to no session at all. See `TRANSCRIPT_BINDING_SPEC.md` in the
implementation checkout for the mechanism and its measured cost.

For every connected phase the harness records, on **both** peers:

- `connection.encryption` : the encrypter each side believes it negotiated.
- the verified remote PeerId on each side (mutual authentication still holds).
- an echo round-trip over a muxed application stream, proving the session is a
  fully working, mutually authenticated channel.
- the peer-store record each side keeps for the other.

### The four detection channels the audit said were empty

The audit claimed nothing detects the downgrade. This harness checks and records
what is actually observable:

1. **`connection.encryption`** is recorded locally on each side and is never
   transmitted, so the two peers cannot compare views. In the attack phase both
   independently record `/noise` and have nothing to compare it against.
2. **identify** cannot carry the security protocol: the identify protobuf has no
   field for the connection encrypter. Its `protocols` field is the set of
   application/stream protocols a peer accepts inbound streams on (here
   `/downgrade-demo/echo/1.0.0`), a different namespace from connection-security
   protocol ids. This harness does not run the identify service (it is not part
   of this dependency set); the conclusion is structural, from the wire schema.
3. **peer store** records only `{ id, protocols, addresses, metadata, tags,
   peerRecordEnvelope }`. The harness dumps both sides' records and confirms
   there is no field for the negotiated encrypter (`recordsEncrypter: false`) and
   none for the Noise static key (`recordsNoiseStaticKey: false`).
4. **Noise static key** : `noise()` and `noiseHFS()` each generate their own
   static Noise key, and libp2p compares PeerIds across connections, never Noise
   static keys, so this signal is not consumed anywhere.

The observed result matches the audit's A-1 analysis: the downgrade is silent and
leaves no artifact on either side that libp2p compares.

The defended phases add a fifth channel that is not empty: each peer states its
offered protocol list inside the encrypted handshake payload, signed and bound
to the Noise transcript, so each side can recompute what the negotiation should
have produced and compare it with what it actually got. That comparison is the
one signal the four channels above could not provide.

## Exact versions and commits used

Recorded automatically in `output/results.json` under `provenance`. At the time
this was authored:

- implementation under test: `@chainsafe/libp2p-noise@17.0.0`, branch
  `js-mlkem768-rename` at commit `0c55599853193397506ff33387fdd7636ccd4d42`
  (working tree clean; imported read-only, never modified).
- `libp2p@3.1.2`, `@libp2p/tcp@11.0.9`, `@chainsafe/libp2p-yamux@8.0.1`,
  `@libp2p/crypto@5.1.13`, `@libp2p/interface@3.1.0`,
  `@libp2p/multistream-select@7.0.9`.
- Node.js `v22.17.1`.

## What this demo does NOT show

- **Loopback only.** Everything runs on `127.0.0.1`. No traffic leaves the
  machine, and the attack is only ever mounted against nodes this harness itself
  creates and controls. It is not, and must not be, pointed at any peer on any
  real network.
- **js-libp2p only.** It proves nothing about the Python, Nim, Rust or Go
  implementations. Their negotiation paths would each need their own harness.
- **The suppression adversary only.** The attacker strips a protocol id from a
  plaintext offer. It does not forge signatures, does not break X25519 or
  ML-KEM, and is not a full man-in-the-middle. Authentication is intact; only the
  choice of encrypter is subverted.
- **Not the fail-and-retry variant.** The audit notes a second route to the same
  downgrade: an attacker that resets or corrupts every hybrid handshake so the
  dialer retries classically. This harness does not implement that variant; it
  demonstrates only the multistream-select suppression route.
- **Not a fix.** This is milestone A (demonstrate the attack). It does not
  implement or evaluate any mitigation (strict mode, transcript-bound signatures,
  or post-handshake downgrade detection).
- **One negotiation ordering.** Both peers are configured hybrid-first,
  classical-fallback, which is the deployment shape the finding targets. A
  strict-mode node that offers only the hybrid encrypter would fail closed
  instead of downgrading; that configuration is out of scope here.
