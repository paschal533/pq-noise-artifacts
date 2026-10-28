#!/usr/bin/env python3
"""Build docs/xxhfs-animated.svg, the animated README figure.

Run from the repo root:  python docs/make_xxhfs_animation.py

Pattern (Noise HFS, XXhfs):   -> e, e1    <- e, ee, ekem1, s, es    -> s, se
Sizes, empty handshake payloads (the same assumption as docs/xxhfs-handshake.svg):
  e 32 B (X25519), e1 1,184 B (ML-KEM-768 encapsulation key), ekem1 1,088 B ciphertext + 16 B tag,
  s 32 B + 16 B tag, and a 16 B tag on each encrypted (empty) payload.
  A = 1,216 B, B = 1,200 B, C = 64 B; 2,480 B in total against 192 B for classical XX.
Message A is sent in the clear because no key exists yet; from `ee` on, every payload and static key
is encrypted. Plain CSS animation, so GitHub plays it in an <img>; prefers-reduced-motion shows the
finished diagram.
"""

from __future__ import annotations

from pathlib import Path

OUT = Path(__file__).resolve().parent / "xxhfs-animated.svg"

W, H = 960, 470
XI, XR = 96, 580              # initiator and responder lifelines
SCALE, MIN_CHIP = 0.28, 26    # px per byte; small fields get a readable minimum width
CYCLE = 12

INK, MUTED, GRID, BG = "#1f2933", "#6b7280", "#e5e1d8", "#fbfaf6"
DH, KEM = "#2f6f9f", "#7c3aed"

# (label, bytes or None for a DH token, kind, sent encrypted?)
MSGS = [
    ("A", 130, +1, 0.4, [("e", 32, "dh", False), ("e1", 1184, "kem", False)]),
    ("B", 222, -1, 2.3, [("e", 32, "dh", False), ("ee", None, "dh", False),
                         ("ekem1", 1104, "kem", True), ("s", 48, "dh", True),
                         ("es", None, "dh", False), ("tag", 16, "tag", True)]),
    ("C", 314, +1, 5.1, [("s", 48, "dh", True), ("se", None, "dh", False), ("tag", 16, "tag", True)]),
]
KEYS = [  # (time s, token, text, colour)
    (3.5, "ee", "MixKey( X25519 ee )", DH),
    (3.8, "ekem1", "MixKey( ML-KEM-768 shared secret )", KEM),
    (4.1, "es", "MixKey( X25519 es )", DH),
    (6.3, "se", "MixKey( X25519 se )", DH),
]


class Svg:
    def __init__(self) -> None:
        self.body: list[str] = []
        self.css: list[str] = []
        self.n = 0

    def _anim(self, frames: str) -> str:
        self.n += 1
        k = f"k{self.n}"
        self.css.append(f"#{k}{{animation:{k} {CYCLE}s linear infinite}}@keyframes {k}{{{frames}}}")
        return k

    @staticmethod
    def p(t: float) -> float:
        return round(100 * t / CYCLE, 2)

    def appear(self, t: float) -> str:
        p = self.p(t)
        return self._anim(f"0%,{p}%{{opacity:0;transform:translateY(4px)}}"
                          f"{p + 2}%,96%{{opacity:1;transform:none}}100%{{opacity:0}}")

    def travel(self, t1: float, t2: float) -> str:
        p1, p2 = self.p(t1), self.p(t2)
        return self._anim(f"0%,{p1}%{{stroke-dashoffset:1;opacity:0}}{p1 + 0.01}%{{opacity:1}}"
                          f"{p2}%,96%{{stroke-dashoffset:0;opacity:1}}100%{{opacity:0}}")

    def add(self, s: str) -> None:
        self.body.append(s)

    def text(self, x: float, y: float, s: str, **kw: str) -> None:
        attrs = " ".join(f'{k.rstrip("_").replace("_", "-")}="{v}"' for k, v in kw.items())
        self.add(f'<text x="{x:.1f}" y="{y}" {attrs}>{s}</text>')


def arrow(svg: Svg, y: float, direction: int, t1: float, t2: float, colour: str, width: float = 2) -> None:
    a, b = (XI, XR) if direction > 0 else (XR, XI)
    k = svg.travel(t1, t2)
    svg.add(f'<path id="{k}" class="draw" pathLength="1" d="M{a} {y} L{b - 8 * direction} {y}" '
            f'stroke="{colour}" stroke-width="{width}" fill="none"/>')
    k = svg.appear(t2)
    svg.add(f'<path id="{k}" d="M{b} {y} l{-10 * direction} -5 v10 z" fill="{colour}"/>')


def message(svg: Svg, label: str, y: float, direction: int, t0: float, fields: list) -> None:
    arrow(svg, y, direction, t0, t0 + 1.0, INK)
    total = sum(n for _, n, _, _ in fields if n)
    k = svg.appear(t0 + 1.0)
    parts = [f'<g id="{k}">']
    # chips read in token order, left to right, sitting against the sender's lifeline
    widths = [24 if n is None else max(MIN_CHIP, n * SCALE) + 4 for _, n, _, _ in fields]
    x = XI + 14 if direction > 0 else XR - 14 - sum(widths) + 4
    for name, n, kind, enc in fields:
        colour = {"dh": DH, "kem": KEM, "tag": MUTED}[kind]
        if n is None:  # a DH token: no bytes on the wire
            cx = x + 11
            parts.append(f'<circle cx="{cx}" cy="{y - 16}" r="9" fill="#fff" stroke="{colour}" '
                         f'stroke-width="1.6"/><text x="{cx}" y="{y - 12.5}" text-anchor="middle" '
                         f'font-size="9.5" font-weight="700" fill="{colour}">{name}</text>')
            x += 24
            continue
        w = max(MIN_CHIP, n * SCALE)
        x0 = x
        fill, ink = ("#fff", colour) if enc else (colour, "#fff")
        parts.append(f'<rect x="{x0:.1f}" y="{y - 26}" width="{w:.1f}" height="20" rx="4" fill="{fill}" '
                     f'stroke="{colour}" stroke-width="1.6"/>')
        big = w > 120
        tag = f"{name} · {n:,} B" if big else name
        parts.append(f'<text x="{x0 + w / 2:.1f}" y="{y - 12}" text-anchor="middle" font-size="11" '
                     f'font-weight="600" fill="{ink}">{tag}</text>')
        if not big:
            parts.append(f'<text x="{x0 + w / 2:.1f}" y="{y + 14}" text-anchor="middle" font-size="9.5" '
                         f'class="num" fill="{MUTED}">{n}</text>')
        x += w + 4
    parts.append(f'<text x="{XR + 14}" y="{y + 4}" font-size="12.5" font-weight="700" fill="{INK}">'
                 f'{label} <tspan class="num" font-weight="400" fill="{MUTED}">{total:,} B</tspan></text>')
    parts.append("</g>")
    svg.add("".join(parts))


def build() -> str:
    s = Svg()
    s.text(32, 40, "Noise XXhfs: one handshake, two independent secrets", font_size="18",
           font_weight="700", fill=INK)
    s.text(32, 61, "Noise_XXhfs_25519+MLKEM768_ChaChaPoly_SHA256, empty payloads. The three XX messages stay; "
           "the KEM rides inside them.", font_size="12.5", fill=MUTED)
    for x, who in ((XI, "initiator"), (XR, "responder")):
        s.add(f'<line x1="{x}" y1="96" x2="{x}" y2="400" stroke="{GRID}" stroke-width="2"/>')
        s.text(x, 90, who, text_anchor="middle", font_size="12.5", font_weight="700", fill=INK)

    for label, y, d, t0, fields in MSGS:
        message(s, label, y, d, t0, fields)

    # key schedule panel
    px = 690
    s.add(f'<rect x="{px - 16}" y="84" width="{W - px - 8}" height="240" rx="12" fill="#fff" stroke="{GRID}"/>')
    s.text(px, 108, "chaining key ck", font_size="12.5", font_weight="700", fill=INK)
    for i, (t, _tok, line, colour) in enumerate(KEYS):
        k = s.appear(t)
        y = 140 + i * 34
        s.add(f'<g id="{k}"><rect x="{px}" y="{y - 15}" width="6" height="22" rx="2" fill="{colour}"/>'
              f'<text x="{px + 14}" y="{y}" font-size="12" fill="{INK}" class="num">{line}</text></g>')
    k = s.appear(7.0)
    s.add(f'<g id="{k}"><text x="{px}" y="{140 + 4 * 34 + 2}" font-size="12" font-weight="700" fill="{INK}">'
          f'Split() → c1, c2</text></g>')

    # transport frames, one each way (split() gives each direction its own key)
    for y, d, name in ((372, +1, "c1"), (396, -1, "c2")):
        arrow(s, y, d, 7.5, 8.3, "#0f766e", width=2.4)
        k = s.appear(8.3)
        s.add(f'<text id="{k}" x="{(XI + XR) / 2}" y="{y - 6}" text-anchor="middle" font-size="11" '
              f'fill="#0f766e">transport frame, key {name}</text>')

    # legend and footnote
    ly = 352
    for i, (colour, filled, txt) in enumerate([(DH, True, "X25519"), (KEM, True, "ML-KEM-768"),
                                               (MUTED, False, "outlined: sent encrypted")]):
        x = px + (0, 78, 0)[i]
        y = ly + (0, 0, 22)[i]
        s.add(f'<rect x="{x}" y="{y - 10}" width="14" height="12" rx="3" fill="{colour if filled else "#fff"}" '
              f'stroke="{colour}" stroke-width="1.6"/>')
        s.text(x + 20, y, txt, font_size="11.5", fill=INK)
    s.text(32, 438, "The session key is secret if either X25519 or ML-KEM-768 is unbroken. "
           "Authentication stays classical.", font_size="12", fill=INK)
    s.text(32, 457, "2,480 B on the wire, 2,288 B more than classical XX (192 B). Chip widths are to scale; "
           "circles are DH operations, which add no bytes.", font_size="11.5", fill=MUTED)

    css = ("text{font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}"
           ".num{font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace}"
           ".draw{stroke-dasharray:1;stroke-dashoffset:0}"
           + "".join(s.css)
           + "@media (prefers-reduced-motion:reduce){*{animation:none!important}}")
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" '
            f'role="img" aria-labelledby="t d"><title id="t">Noise XXhfs handshake, animated</title>'
            f'<desc id="d">Message A carries e and the ML-KEM-768 key e1 (1,216 B). Message B carries e, ee, '
            f'the KEM ciphertext ekem1, s and es (1,200 B). Message C carries s and se (64 B). Each DH result '
            f'and the KEM shared secret are mixed into the chaining key, which splits into one key per '
            f'direction.</desc><style>{css}</style>'
            f'<rect width="{W}" height="{H}" rx="16" fill="{BG}"/>' + "".join(s.body) + "</svg>\n")


if __name__ == "__main__":
    OUT.write_text(build(), encoding="utf-8", newline="\n")
    print("wrote", OUT)
