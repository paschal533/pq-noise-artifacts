# Cross-language downgrade experiment (js-libp2p and py-libp2p)

The JS-only experiment in `../downgrade-demo/` shows that an on-path attacker
can push two hybrid-capable js-libp2p peers from `/noise-mlkem768-hfs/0.2.0`
down to classical `/noise`, and that transcript binding turns that silent
downgrade into a refused connection. This directory runs the same attack
between **one js-libp2p node and one py-libp2p host**, in both directions,
through each library's real multistream-select negotiation.

The earlier cross-language interop runs drove the Noise handshake directly
over a socket and skipped multistream-select. These runs don't: both peers
are full libp2p nodes (TCP, security negotiation, yamux), so the attacker
edits the same plaintext bytes a real deployment would send.

## Setup

Both peers are configured the same way:

- security protocols, in preference order: `/noise-mlkem768-hfs/0.2.0`, then `/noise`
  - JS: `connectionEncrypters: [noiseHFS(...), noise(...)]`
  - Python: `new_host(sec_opt={hybrid: TransportPQ(...), "/noise": Transport(...)})`,
    where dict order is the preference order
- muxer: yamux (`/yamux/1.0.0`) on both
- identities: Ed25519 from fixed seeds (listener `0x11`, dialer `0x22`)

"Defence on" means transcript binding in `enforce` mode with the `extension`
variant. It is set on **both** encrypters of **both** peers, each listing the
real offer order `[/noise-mlkem768-hfs/0.2.0, /noise]` and naming its own
protocol id as the one it runs under. The binding has to be on `/noise`, the
protocol the attacker downgrades to, because that is the handshake that
actually runs during an attack.

The proxy (`proxy.mjs`) is the JS demo's proxy, copied rather than edited. In
attack mode it rewrites the dialer's `/noise-mlkem768-hfs/0.2.0` proposal to
the same-length unknown id `/noise-mlkem768-xxx/0.2.0`. The real listener then
answers `na` itself, and the dialer falls back to `/noise`. The copy adds two
things: a fixed listen port, and a log of which side hung up first and how
many bytes had crossed in each direction at that point.

Each encrypter on each peer is wrapped by a small recorder (`js-node.mjs`,
`py_host.py`). The recorder logs which encrypter ran and the exact error it
threw, then rethrows the error unchanged. Without it, the listener's side of
a refused handshake is invisible: js-libp2p re-wraps it, and py-libp2p only
logs a generic message at debug level.

## Phases

In each direction (`js->py`: JS dials, Python listens; `py->js`: the reverse):

| phase | proxy | defence |
|---|---|---|
| `tap` | relays unmodified | off (extra control, not required) |
| `tap-defended` | relays unmodified | on |
| `attack` | strips hybrid | off |
| `attack-defended` | strips hybrid | on |

## Results (run 2026-09-29, Windows 11, loopback)

JS: `@chainsafe/libp2p-noise@17.0.0` at `js-mlkem768-rename@f9587d9` (clean),
libp2p 3.1.2, Node 22.17.1. Python: py-libp2p
`feat/transcript-bound-negotiation@aaa4ae9` (clean), Python 3.13.14.

| direction | phase | selected on the wire | dialer ran | listener ran | outcome | dialer reports | listener reports |
|---|---|---|---|---|---|---|---|
| js->py | tap | hfs | hfs | hfs | connected, echo ok | - | - |
| js->py | tap-defended | hfs | hfs | hfs | connected, echo ok | - | - |
| js->py | attack | `/noise` | `/noise` | `/noise` | **connected, echo ok (silent downgrade)** | - | - |
| js->py | attack-defended | `/noise` | `/noise` | `/noise` | **refused** | `DowngradeDetectedError` (`ERR_SECURITY_PROTOCOL_DOWNGRADE`) | `IncompleteReadError` (peer closed while it waited for msg C) |
| py->js | tap | hfs | hfs | hfs | connected, echo ok | - | - |
| py->js | tap-defended | hfs | hfs | hfs | connected, echo ok | - | - |
| py->js | attack | `/noise` | `/noise` | `/noise` | **connected, echo ok (silent downgrade)** | - | - |
| py->js | attack-defended | `/noise` | `/noise` | `/noise` | **refused** (4 TCP attempts) | `SecurityProtocolDowngrade`, on every attempt | `UnexpectedEOFError` (peer closed while it waited for msg C), on every attempt |

"hfs" is `/noise-mlkem768-hfs/0.2.0`. "Selected on the wire" is the protocol
the listener echoed back, as seen by the proxy. "Dialer ran" and "listener
ran" are what each node's own encrypter recorded. In connected phases these
also match each node's connection metadata: JS `connection.encryption`, and
Python `get_negotiated_security_protocol()`.

The downgrade message is the same on both sides:

```
security protocol downgrade detected: /noise-mlkem768-hfs/0.2.0 should have
been negotiated, but this session is running /noise (dialer offered
[/noise-mlkem768-hfs/0.2.0, /noise], listener supports
[/noise-mlkem768-hfs/0.2.0, /noise])
```

### What the numbers say

- **The attack works across languages.** With the defence off, a JS/Python
  pair that both prefer the hybrid protocol ends up on `/noise` in both
  directions. The session completes, echo works, both PeerIds verify, and
  neither side reports anything.
- **The defence refuses it across languages.** With the defence on, the same
  single rewrite produces no session, in both directions.
- **The dialer detects the downgrade and refuses before sending msg C.** The
  proxy's byte counts show it: in both directions the dialer sent exactly 89
  bytes before hanging up. That is multistream-select (20 + 27 + 8) plus Noise
  msg A (2 + 32), with no msg C. The JS dialer reset the socket (`ECONNRESET`
  at the proxy); the Python dialer closed it cleanly (FIN).
- **The listener never learns it was attacked.** It sees an ordinary
  "connection closed during the handshake" error. It never reaches its own
  downgrade check, because that check needs msg C. Only the dialer has
  evidence of the attack.
- **The binding really travels across languages.** In the `tap-defended`
  phases the total bytes in each direction are 101 to 103 bytes more than in
  `tap` (js->py: +101 dialer→listener, +103 listener→dialer; py->js: +103,
  +101). That is about one signature plus the protocol list, which each side
  adds to its one handshake payload. The connections still succeed. A binding that is present but fails to verify
  aborts the handshake in every mode, so success here means each side
  accepted the other's binding. In `attack-defended`, the dialer could only
  fire because it had received and verified the listener's binding in msg B.
  Without one, the check is skipped.

### Things to know when citing this

- **py-libp2p retries a refused dial.** Its swarm makes 1 + 3 attempts by
  default (`RetryConfig.max_retries = 3`). Each attempt went through the
  proxy again, was downgraded again, and was refused again. It never fell
  back to a successful connection. JS made one attempt.
- **The error class does not survive to the application in js-libp2p.** The
  JS encrypter throws `DowngradeDetectedError` with code
  `ERR_SECURITY_PROTOCOL_DOWNGRADE`, but `dial()` rejects with libp2p's
  `EncryptionFailedError`. That error keeps the message text only, with
  `code` undefined and no `cause`. In py-libp2p the class is kept in the
  exception chain, under `SwarmDialAllFailedError` → `MultiError` →
  `SwarmException` → `SecurityUpgradeFailure`. But the swarm's ERROR-level
  log line for each refused attempt only says `handshake failed when upgrading
  to secure connection`, so an operator reading logs does not see the word
  "downgrade".
- The Python host's stderr in connected phases shows it trying identify
  (`/ipfs/id/1.0.0`) on the JS node and getting `na`, because the JS nodes do
  not run identify. This is harmless, and it shows that a second
  multistream-select exchange ran over the yamux session.
- The extra `tap` phase (defence off, no attack) is a control that was not
  asked for. The three required phases per direction are `tap-defended`,
  `attack` and `attack-defended`.

## What this does NOT show

- Loopback only, on one Windows machine, one run. No traffic leaves `127.0.0.1`.
- Only JS and Python. Nim, Rust and Go are not covered here.
- Only the `extension` variant. The `identity` variant uses its own protocol
  id and was not run.
- Only the strip-the-proposal attacker. Neither the fail-and-retry route nor a
  forged `na` on the listener→dialer path is exercised.
- Not a case where one side has the defence and the other does not.

## How to run

```
node run-xlang.mjs            # both directions, all phases
node run-xlang.mjs 'js->py'   # one direction only
```

Requirements:

- a built js-libp2p-noise checkout with `noiseHFS()` and transcript binding
  (`dist/src/index.js` present, `node_modules` installed), found through
  `NOISE_IMPL_DIR` or the sibling path `../../../PQC-Research/wt-js-rename`;
- a py-libp2p checkout with transcript binding, found through `PY_LIBP2P_DIR`
  or `../../../py-libp2p/py-libp2p`. Its `.venv` interpreter is used unless
  `PY_LIBP2P_PYTHON` is set, and `PYTHONPATH` is set to the checkout
  automatically.

No install step is needed. `setup.mjs` links `node_modules` to the JS
checkout's own `node_modules`, the same way the JS-only demo does. The
experiment uses ports 9710–9713 and 9720–9723 (listeners) and 9750–9753 and
9760–9763 (proxy).

Output goes to `output/`:

- `console-log.txt`: the full human-readable run
- `results.json`: every phase, each side's view, every Python event, and provenance
- `transcript-<direction>-<phase>.json`: the multistream-select frames and TCP
  teardown the proxy observed

## Files

- `run-xlang.mjs`: orchestrates both directions and all phases
- `js-node.mjs`: the js-libp2p node, with recording encrypter wrappers
- `py_host.py`: the py-libp2p host (`--role listen|dial`), emitting JSON events on stdout
- `proxy.mjs`: the on-path proxy, copied from `../downgrade-demo/proxy.mjs`
- `impl-path.mjs`, `setup.mjs`: locate the two implementations and link `node_modules`
