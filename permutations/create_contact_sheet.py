#!/usr/bin/env python3
from __future__ import annotations

import argparse
import math
from pathlib import Path

from PIL import Image, ImageOps


def sorted_jpgs(input_dir: Path, output_file: Path) -> list[Path]:
    output_resolved = output_file.resolve()
    files = [
        path
        for path in sorted(input_dir.iterdir())
        if path.is_file() and path.suffix.lower() in {".jpg", ".jpeg"}
        and path.resolve() != output_resolved
    ]
    if not files:
        raise ValueError(f"No JPG files found in {input_dir}")
    return files


def suggested_columns(image_count: int) -> int:
    return max(1, math.ceil(math.sqrt(image_count)))


def make_contact_sheet(
    files: list[Path],
    output_file: Path,
    thumb_size: int,
    columns: int | None,
    gap: int,
    background: tuple[int, int, int],
) -> None:
    if columns is None:
        columns = suggested_columns(len(files))

    rows = math.ceil(len(files) / columns)
    sheet_width = columns * thumb_size + (columns + 1) * gap
    sheet_height = rows * thumb_size + (rows + 1) * gap

    sheet = Image.new("RGB", (sheet_width, sheet_height), color=background)

    for i, file_path in enumerate(files):
        row = i // columns
        col = i % columns
        x = gap + col * (thumb_size + gap)
        y = gap + row * (thumb_size + gap)

        with Image.open(file_path) as image:
            thumb = ImageOps.fit(image.convert("RGB"), (thumb_size, thumb_size))
        sheet.paste(thumb, (x, y))

    output_file.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output_file, format="JPEG", quality=92, optimize=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create a JPG contact sheet from a directory of JPG files."
    )
    parser.add_argument(
        "--input-dir",
        type=Path,
        default=Path("permutations/jpg_random_300"),
        help="Directory that contains source JPG files",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("permutations/jpg_random_300/contact_sheet.jpg"),
        help="Output contact sheet JPG path",
    )
    parser.add_argument(
        "--thumb-size",
        type=int,
        default=192,
        help="Thumbnail size in pixels",
    )
    parser.add_argument(
        "--columns",
        type=int,
        default=None,
        help="Number of columns in the contact sheet; defaults to a near-square layout",
    )
    parser.add_argument(
        "--gap",
        type=int,
        default=8,
        help="Gap size in pixels between thumbnails",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.thumb_size <= 0:
        raise ValueError("thumb-size must be > 0")
    if args.columns is not None and args.columns <= 0:
        raise ValueError("columns must be > 0")
    if args.gap < 0:
        raise ValueError("gap must be >= 0")

    files = sorted_jpgs(args.input_dir, args.output)
    make_contact_sheet(
        files=files,
        output_file=args.output,
        thumb_size=args.thumb_size,
        columns=args.columns,
        gap=args.gap,
        background=(20, 20, 20),
    )
    print(f"Contact sheet created: {args.output} ({len(files)} images)")


if __name__ == "__main__":
    main()