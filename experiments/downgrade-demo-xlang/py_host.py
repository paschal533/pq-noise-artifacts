#!/usr/bin/env python3
"""
A real py-libp2p host for the cross-language downgrade experiment.

Built with ``libp2p.new_host`` and a ``sec_opt`` dict ordered hybrid first
(``/noise-mlkem768-hfs/0.2.0``, ``TransportPQ``) then classical ``/noise``
(``Transport``), so its security negotiation goes through py-libp2p's real
multistream-select, the same path any deployed py-libp2p node uses. Yamux is
the stream muxer, matching the JS peer.

Two roles:

``--role listen``
    Listens on 127.0.0.1:--port, answers an echo protocol, and runs until a
    line arrives on stdin (or --deadline seconds pass).
``--role dial``
    Dials --target (a multiaddr ending in /p2p/<id>), opens one echo stream,
    reports the result and exits.

With ``--defence on`` both transports get a transcript-binding config in
enforce mode, extension variant, listing the real offer order
``[hybrid, /noise]``, each naming its own identifier as ``actual_protocol``.

Every secure transport is wrapped in a recorder that observes, but does not
alter, each handshake: which transport ran and, on failure, the exact
exception class and message raised by py-libp2p. That is needed because the
swarm only logs a wrapper message ("handshake failed when upgrading to secure
connection") for an inbound failure.

All output is one JSON object per line on stdout, prefixed ``EVT ``.
Run with PYTHONPATH set to the py-libp2p checkout root.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from typing import Any

import multiaddr
import trio

from libp2p import new_host
from libp2p.abc import IRawConnection, ISecureConn, ISecureTransport
from libp2p.crypto.ed25519 import create_new_key_pair as ed25519_key_pair
from libp2p.crypto.x25519 import X25519PrivateKey
from libp2p.custom_types import TProtocol
from libp2p.peer.id import ID
from libp2p.peer.peerinfo import info_from_p2p_addr
from libp2p.security.noise.pq.transport_pq import (
    TransportPQ,
    protocol_id_for,
)
from libp2p.security.noise.transcript_binding import TranscriptBindingConfig
from libp2p.security.noise.transport import (
    PROTOCOL_ID as CLASSICAL_ID,
    Transport as NoiseTransport,
)

HYBRID_ID = TProtocol("/noise-mlkem768-hfs/0.2.0")
OFFERED = (str(HYBRID_ID), str(CLASSICAL_ID))
ECHO_PROTOCOL = TProtocol("/downgrade-demo/echo/1.0.0")
ECHO_MSG = b"PING-downgrade-demo"


def emit(event: str, **fields: Any) -> None:
    print("EVT " + json.dumps({"event": event, **fields}), flush=True)


def error_chain(exc: BaseException) -> list[dict[str, str]]:
    """
    Every exception in the __cause__/__context__ chain, outermost first.

    A ``MultiError`` (what a failed dial surfaces) does not chain its members
    through __cause__, so its ``errors`` are followed too; otherwise the root
    cause of a failed dial would be invisible here.
    """
    chain: list[dict[str, str]] = []
    seen: set[int] = set()
    pending: list[BaseException] = [exc]
    while pending:
        cur = pending.pop(0)
        if id(cur) in seen:
            continue
        seen.add(id(cur))
        chain.append(
            {
                "class": f"{type(cur).__module__}.{type(cur).__qualname__}",
                "message": str(cur),
            }
        )
        nxt = cur.__cause__ or cur.__context__
        if nxt is not None:
            pending.append(nxt)
        pending.extend(getattr(cur, "errors", None) or [])
    return chain


class RecordingTransport(ISecureTransport):
    """Observes a secure transport's handshakes; never changes their outcome."""

    def __init__(self, inner: ISecureTransport, protocol: str) -> None:
        self.inner = inner
        self.protocol = protocol

    async def _run(self, side: str, coro: Any) -> ISecureConn:
        try:
            conn = await coro
        except Exception as exc:
            emit(
                "secure-error",
                side=side,
                encrypter=self.protocol,
                error=error_chain(exc),
            )
            raise
        emit("secure-ok", side=side, encrypter=self.protocol)
        return conn

    async def secure_inbound(self, conn: IRawConnection) -> ISecureConn:
        return await self._run("inbound", self.inner.secure_inbound(conn))

    async def secure_outbound(self, conn: IRawConnection, peer_id: ID) -> ISecureConn:
        return await self._run("outbound", self.inner.secure_outbound(conn, peer_id))


def build_sec_opt(keypair: Any, defended: bool) -> dict[TProtocol, ISecureTransport]:
    hybrid_binding = (
        TranscriptBindingConfig(
            security_protocols=OFFERED,
            actual_protocol=str(HYBRID_ID),
            mode="enforce",
            variant="extension",
        )
        if defended
        else None
    )
    classical_binding = (
        TranscriptBindingConfig(
            security_protocols=OFFERED,
            actual_protocol=str(CLASSICAL_ID),
            mode="enforce",
            variant="extension",
        )
        if defended
        else None
    )
    hybrid = TransportPQ(
        libp2p_keypair=keypair,
        noise_privkey=X25519PrivateKey.new(),
        transcript_binding=hybrid_binding,
    )
    # protocol_id_for() is what the transport itself advertises; it must be
    # the hybrid id here, since the extension variant does not move it.
    hybrid_id = protocol_id_for(hybrid_binding)
    assert hybrid_id == HYBRID_ID, hybrid_id
    classical = NoiseTransport(
        libp2p_keypair=keypair,
        noise_privkey=X25519PrivateKey.new(),
        transcript_binding=classical_binding,
    )
    # Dict order is the multistream-select preference order.
    return {
        hybrid_id: RecordingTransport(hybrid, str(hybrid_id)),
        CLASSICAL_ID: RecordingTransport(classical, str(CLASSICAL_ID)),
    }


def conn_views(host: Any, peer_id: ID) -> list[dict[str, Any]]:
    views = []
    for conn in host.get_network().get_connections(peer_id):
        views.append(
            {
                "security": conn.get_negotiated_security_protocol(),
                "muxer": conn.get_negotiated_muxer_protocol(),
            }
        )
    return views


async def wait_for_stop(deadline: float) -> None:
    with trio.move_on_after(deadline):
        await trio.to_thread.run_sync(sys.stdin.readline, abandon_on_cancel=True)


async def run_listener(host: Any, port: int, deadline: float) -> None:
    addr = multiaddr.Multiaddr(f"/ip4/127.0.0.1/tcp/{port}")

    async def echo(stream: Any) -> None:
        remote = stream.muxed_conn.peer_id
        try:
            data = await stream.read(1024)
            await stream.write(data)
            emit(
                "echo-served",
                remotePeer=str(remote),
                received=data.decode(errors="replace"),
                connections=conn_views(host, remote),
            )
        except Exception as exc:
            emit("echo-error", error=error_chain(exc))
        finally:
            try:
                await stream.close()
            except Exception:
                pass

    async with host.run(listen_addrs=[addr]):
        host.set_stream_handler(ECHO_PROTOCOL, echo)
        emit("ready", peerId=host.get_id().to_string(), addr=str(addr))
        await wait_for_stop(deadline)
        # Final view of every connection this listener holds.
        emit(
            "final-connections",
            connections={
                str(pid): conn_views(host, pid)
                for pid in host.get_network().get_connections_map()
            },
        )


async def run_dialer(host: Any, target: str) -> None:
    info = info_from_p2p_addr(multiaddr.Multiaddr(target))
    async with host.run(listen_addrs=[]):
        emit("ready", peerId=host.get_id().to_string())
        try:
            await host.connect(info)
        except Exception as exc:
            emit("dial-error", error=error_chain(exc))
            return
        emit("connected", remotePeer=str(info.peer_id), connections=conn_views(host, info.peer_id))
        try:
            stream = await host.new_stream(info.peer_id, [ECHO_PROTOCOL])
            await stream.write(ECHO_MSG)
            got = b""
            with trio.fail_after(8):
                while len(got) < len(ECHO_MSG):
                    chunk = await stream.read(1024)
                    if not chunk:
                        break
                    got += chunk
            await stream.close()
            emit("echo", sent=ECHO_MSG.decode(), received=got.decode(errors="replace"), ok=got == ECHO_MSG)
        except Exception as exc:
            emit("echo-error", error=error_chain(exc))


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--role", choices=("listen", "dial"), required=True)
    parser.add_argument("--port", type=int, default=0)
    parser.add_argument("--target", default="")
    parser.add_argument("--defence", choices=("on", "off"), default="off")
    parser.add_argument("--seed-byte", type=int, required=True)
    parser.add_argument("--deadline", type=float, default=60.0)
    args = parser.parse_args()

    keypair = ed25519_key_pair(bytes([args.seed_byte]) * 32)
    defended = args.defence == "on"
    host = new_host(
        key_pair=keypair,
        sec_opt=build_sec_opt(keypair, defended),
        muxer_preference="YAMUX",
    )
    emit(
        "config",
        role=args.role,
        defence=args.defence,
        offered=list(OFFERED),
        # The order py-libp2p will actually propose/accept, read back from the
        # swarm rather than assumed from the dict we passed in.
        secOptOrder=[
            str(p)
            for p in host.get_network().upgrader.security_multistream.transports
        ],
    )
    if args.role == "listen":
        await run_listener(host, args.port, args.deadline)
    else:
        await run_dialer(host, args.target)
    emit("exit")


if __name__ == "__main__":
    # Library logs go to stderr so stdout stays machine-readable.
    logging.basicConfig(level=logging.WARNING, stream=sys.stderr)
    try:
        trio.run(main)
    except Exception as exc:  # harness boundary
        emit("fatal", error=error_chain(exc))
        sys.exit(1)
