#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def split_image_4x4(input_path: Path) -> Path:
    if input_path.suffix.lower() != ".png":
        raise ValueError("Input must be a .png file")

    with Image.open(input_path) as img:
        width, height = img.size
        if (width, height) != (1024, 1024):
            raise ValueError(f"Expected image size 1024x1024, got {width}x{height}")

        tile_size = 256
        output_dir = input_path.parent / f"{input_path.stem}_tiles"
        output_dir.mkdir(parents=True, exist_ok=True)

        index = 0
        for row in range(4):
            for col in range(4):
                left = col * tile_size
                upper = row * tile_size
                right = left + tile_size
                lower = upper + tile_size

                tile = img.crop((left, upper, right, lower))
                out_name = f"{input_path.stem}_{index:02d}.png"
                tile.save(output_dir / out_name, format="PNG")
                index += 1

    return output_dir


def verify_tiles(input_path: Path, output_dir: Path) -> None:
    expected_names = [f"{input_path.stem}_{index:02d}.png" for index in range(16)]

    actual_files = sorted(p.name for p in output_dir.glob("*.png"))
    if actual_files != expected_names:
        raise ValueError(
            "Output files are missing or incorrectly named. "
            f"Expected: {expected_names}; found: {actual_files}"
        )

    for name in expected_names:
        tile_path = output_dir / name
        with Image.open(tile_path) as tile:
            if tile.size != (256, 256):
                raise ValueError(
                    f"Tile {name} has invalid size {tile.size[0]}x{tile.size[1]}"
                )


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Split a 1024x1024 PNG into a 4x4 grid and export 16 "
            "tiles of 256x256 each."
        )
    )
    parser.add_argument("image", type=Path, help="Path to the source PNG image")
    parser.add_argument(
        "--verify",
        action="store_true",
        help="Verify output tiles count, naming, and dimensions after splitting",
    )
    args = parser.parse_args()

    output_dir = split_image_4x4(args.image)
    if args.verify:
        verify_tiles(args.image, output_dir)
        print("Verification passed: 16 tiles named 00-15 at 256x256 each.")
    print(f"Saved 16 tiles to: {output_dir}")


if __name__ == "__main__":
    main()
