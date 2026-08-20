#!/usr/bin/env python3
"""Build a modern macOS ICNS file from a 1024px RGBA PNG."""

import io
import struct
import sys
from pathlib import Path

from PIL import Image


def chunk(kind: bytes, payload: bytes) -> bytes:
    return kind + struct.pack(">I", len(payload) + 8) + payload


def main() -> None:
    source, destination = map(Path, sys.argv[1:3])
    image = Image.open(source).convert("RGBA")
    representations = [
        (b"icp4", 16),
        (b"icp5", 32),
        (b"icp6", 64),
        (b"ic07", 128),
        (b"ic08", 256),
        (b"ic09", 512),
        (b"ic10", 1024),
    ]
    body = bytearray()
    for kind, size in representations:
        resized = image.resize((size, size), Image.Resampling.LANCZOS)
        buffer = io.BytesIO()
        resized.save(buffer, format="PNG", optimize=True)
        body.extend(chunk(kind, buffer.getvalue()))
    destination.write_bytes(b"icns" + struct.pack(">I", len(body) + 8) + body)


if __name__ == "__main__":
    main()
