#!/usr/bin/env python3
"""Render the Weft TUI preview to brand/tui-preview.png (no browser needed)."""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1200, 760
S = 2
OUT = Path(__file__).with_name("tui-preview.png")

BG = (7, 11, 18)
PANEL = (11, 18, 32)
TEXT = (230, 237, 243)
MUTED = (139, 152, 169)
CYAN = (34, 211, 238)
CYAN_BRIGHT = (103, 232, 249)
CYAN_DIM = (14, 116, 144)
BORDER = (22, 78, 99)
LINE = (30, 41, 59)
TEAL = (94, 234, 212)
PINK = (251, 113, 133)
AMBER = (251, 191, 36)

FONT_DIR = Path("C:/Windows/Fonts")
MONO = str(FONT_DIR / "CascadiaMono.ttf")
CJK = str(FONT_DIR / "msyh.ttc")
SYM = str(FONT_DIR / "seguisym.ttf")


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def background() -> Image.Image:
    yy, xx = np.mgrid[0 : H * S, 0 : W * S].astype(np.float32)
    arr = np.zeros((H * S, W * S, 3), dtype=np.float32)
    arr[:] = BG

    def glow(cx: float, cy: float, radius: float, color: tuple[int, int, int], strength: float) -> None:
        d = np.sqrt(((xx - cx) / radius) ** 2 + ((yy - cy) / radius) ** 2)
        g = np.clip(1.0 - d, 0.0, 1.0) ** 2
        for i, c in enumerate(color):
            arr[:, :, i] += g * c * strength

    glow(W * S * 0.14, -H * S * 0.05, W * S * 0.82, CYAN, 0.11)
    glow(W * S * 0.92, H * S * 1.0, W * S * 0.75, CYAN_DIM, 0.10)

    # Subtle scanlines and vignette.
    arr[::3, :, :] *= 0.988
    d = np.sqrt(((xx - W * S / 2) / (W * S * 0.72)) ** 2 + ((yy - H * S / 2) / (H * S * 0.72)) ** 2)
    arr *= np.clip(1.0 - 0.10 * d**2, 0.0, 1.0)[:, :, None]
    return Image.fromarray(np.uint8(np.clip(arr, 0, 255)))


def text(draw: ImageDraw.ImageDraw, xy: tuple[float, float], value: str, f: ImageFont.FreeTypeFont, fill: tuple[int, int, int]) -> None:
    draw.text((xy[0] * S, xy[1] * S), value, font=f, fill=fill)


def rich(draw: ImageDraw.ImageDraw, x: float, y: float, parts: list[tuple[str, ImageFont.FreeTypeFont, tuple[int, int, int]]], gap: float = 0.0) -> float:
    for value, f, fill in parts:
        text(draw, (x, y), value, f, fill)
        x += draw.textlength(value, font=f) / S + gap
    return x


def rounded(draw: ImageDraw.ImageDraw, box: tuple[float, float, float, float], radius: float, fill, outline, width: int = 1) -> None:
    x0, y0, x1, y1 = [v * S for v in box]
    draw.rounded_rectangle((x0, y0, x1, y1), radius=radius * S, fill=fill, outline=outline, width=width * S)


def main() -> None:
    img = background().convert("RGBA")
    draw = ImageDraw.Draw(img)

    mono_11 = font(MONO, 22)
    mono_12 = font(MONO, 24)
    mono_13 = font(MONO, 26)
    mono_14 = font(MONO, 28)
    mono_15 = font(MONO, 30)
    mono_17 = font(MONO, 34)
    mono_18 = font(MONO, 36)
    mono_24 = font(MONO, 48)
    logo_font = font(MONO, 34)
    cjk_13 = font(CJK, 26)
    cjk_14 = font(CJK, 28)
    cjk_17 = font(CJK, 34)
    cjk_18 = font(CJK, 36)
    sym_14 = font(SYM, 28)

    # Top bar
    text(draw, (42, 26), "≡", cjk_13, CYAN)
    text(draw, (68, 25), "WEFT / TUI PREVIEW", mono_12, MUTED)
    right = "120 × 34 · TRUECOLOR"
    rw = draw.textlength(right, font=mono_11) / S
    text(draw, (1158 - rw, 26), right, mono_11, (100, 116, 139))
    draw.line((42 * S, 48 * S, 1158 * S, 48 * S), fill=LINE, width=S)

    # Logo with a soft cyan glow.
    logo = [
        "  ██╗    ██╗███████╗███████╗████████╗",
        "  ██║    ██║██╔════╝██╔════╝╚══██╔══╝",
        "  ██║ █╗ ██║█████╗  █████╗     ██║",
        "  ██║███╗██║██╔══╝  ██╔══╝     ██║",
        "  ╚███╔███╔╝███████╗██║        ██║",
        "   ╚══╝╚══╝ ╚══════╝╚═╝        ╚═╝",
    ]
    glow_layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow_layer)
    for i, line in enumerate(logo):
        gd.text((42 * S, (66 + i * 31.5) * S), line, font=logo_font, fill=(34, 211, 238, 80))
    glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(12 * S))
    img = Image.alpha_composite(img, glow_layer)
    draw = ImageDraw.Draw(img)
    for i, line in enumerate(logo):
        text(draw, (42, 66 + i * 34.5), line, logo_font, CYAN)

    # Brand line
    x = 42
    x = rich(draw, x, 286, [("WEFT", mono_18, CYAN)], gap=7)
    x = rich(draw, x, 286, [("七襄", cjk_18, CYAN_BRIGHT)], gap=18)
    x = rich(draw, x, 291, [("v2.5.0", mono_12, MUTED)], gap=14)
    x = rich(draw, x, 291, [("·", mono_12, (51, 65, 85))], gap=14)
    rich(draw, x, 289, [("三线成纬，七襄成章", cjk_13, MUTED)])

    # Welcome box
    rounded(draw, (42, 316, 1158, 506), 14, PANEL, BORDER, 1)
    # subtle top accent
    draw.line((60 * S, 317 * S, 1140 * S, 317 * S), fill=(20, 78, 99), width=S)

    text(draw, (66, 332), "≡", cjk_17, CYAN)
    text(draw, (100, 330), "Welcome to Weft!", mono_17, CYAN)

    rich(draw, 66, 370, [
        ("/help", mono_14, CYAN_BRIGHT), (" for help", mono_14, MUTED),
    ], gap=0)
    rich(draw, 300, 370, [
        ("/status", mono_14, CYAN_BRIGHT), (" for runtime", mono_14, MUTED),
    ], gap=0)
    rich(draw, 574, 370, [
        ("/plan", mono_14, CYAN_BRIGHT), (" to start", mono_14, MUTED),
    ], gap=0)

    def row(y: float, key: str, parts: list[tuple[str, ImageFont.FreeTypeFont, tuple[int, int, int]]], value_x: float = 158) -> None:
        text(draw, (66, y), key, mono_14, (100, 116, 139))
        rich(draw, value_x, y, parts)

    row(406, "cwd", [("D:\\dsh_env\\workspaces\\codex_claude_dsh_comb_mod", mono_14, TEXT)])
    row(434, "model", [("deepseek-flash", mono_14, TEXT), ("  ·  deepseek", mono_14, MUTED)])
    row(462, "sandbox", [("workspace-write", mono_14, TEXT), ("  ·  approvals ", mono_14, MUTED), ("ask", mono_14, CYAN_BRIGHT)])

    # Tip
    text(draw, (42, 530), "※", cjk_14, CYAN_BRIGHT)
    text(draw, (72, 528), "Tip", mono_13, TEXT)
    text(draw, (116, 529), "计划先落盘，执行先沙箱；缓存靠前缀，记忆靠评估。", cjk_13, MUTED)

    # Prompt
    text(draw, (42, 566), ">", mono_17, CYAN)
    prompt = "把 01-codex / 02-claude / 03-dsh 综合成 M0 实现计划"
    # Mixed CJK/Latin: draw as one CJK string for stable spacing.
    text(draw, (72, 566), prompt, cjk_14, TEXT)
    caret_x = 72 + draw.textlength(prompt, font=cjk_14) / S + 10
    draw.rectangle((caret_x * S, 570 * S, (caret_x + 9) * S, 590 * S), fill=CYAN)

    # Footer + status
    foot = "? for shortcuts"
    fw = draw.textlength(foot, font=mono_11) / S
    text(draw, (1158 - fw, 674), foot, mono_11, (71, 85, 105))

    draw.line((42 * S, 704 * S, 1158 * S, 704 * S), fill=LINE, width=S)
    text(draw, (42, 716), "⏺", sym_14, TEAL)
    text(draw, (70, 718), "weft v2.5.0", mono_12, MUTED)
    text(draw, (196, 718), "│", mono_12, (51, 65, 85))
    text(draw, (216, 718), "workspace-write", mono_12, MUTED)
    text(draw, (382, 718), "│", mono_12, (51, 65, 85))
    text(draw, (402, 718), "approvals ask", mono_12, MUTED)

    status_right = [("cache ", mono_12, MUTED), ("—", mono_12, (100, 116, 139)),
                    ("   │   ", mono_12, (51, 65, 85)), ("0 tok", mono_12, MUTED),
                    ("   │   ", mono_12, (51, 65, 85)), ("0.0s", mono_12, MUTED)]
    total = sum(draw.textlength(v, font=f) / S for v, f, _ in status_right)
    rich(draw, 1158 - total, 718, status_right)

    img.convert("RGB").save(OUT, "PNG", optimize=True)
    print(f"wrote {OUT} ({img.width}x{img.height})")


if __name__ == "__main__":
    main()
