#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import random
from pathlib import Path

from PIL import Image


GRID_SIZE = 4
TILE_COUNT = GRID_SIZE * GRID_SIZE
SOURCE_SIZE = 2048
TILE_SIZE = SOURCE_SIZE // GRID_SIZE


def load_tiles(image_path: Path) -> list[Image.Image]:
    if image_path.suffix.lower() != ".png":
        raise ValueError("Input image must be a PNG file")

    with Image.open(image_path) as src:
        width, height = src.size
        if (width, height) != (SOURCE_SIZE, SOURCE_SIZE):
            raise ValueError(
                f"Expected {SOURCE_SIZE}x{SOURCE_SIZE}, got {width}x{height}"
            )

        src_rgb = src.convert("RGB")
        tiles: list[Image.Image] = []

        for row in range(GRID_SIZE):
            for col in range(GRID_SIZE):
                left = col * TILE_SIZE
                top = row * TILE_SIZE
                right = left + TILE_SIZE
                bottom = top + TILE_SIZE
                tiles.append(src_rgb.crop((left, top, right, bottom)))

    if len(tiles) != TILE_COUNT:
        raise RuntimeError(f"Expected {TILE_COUNT} tiles, got {len(tiles)}")

    return tiles


def permutation_signature(order: tuple[int, ...]) -> str:
    return "-".join(f"{index:02d}" for index in order)


def rotation_signature(rotations: tuple[int, ...]) -> str:
    return "-".join(str(angle) for angle in rotations)


def rotate_tile(tile: Image.Image, angle: int) -> Image.Image:
    if angle == 0:
        return tile
    if angle == 90:
        return tile.transpose(Image.Transpose.ROTATE_90)
    if angle == 180:
        return tile.transpose(Image.Transpose.ROTATE_180)
    if angle == 270:
        return tile.transpose(Image.Transpose.ROTATE_270)
    raise ValueError(f"Unsupported rotation angle: {angle}")


def compose_image(
    tiles: list[Image.Image],
    order: tuple[int, ...],
    rotations: tuple[int, ...],
) -> Image.Image:
    canvas = Image.new("RGB", (SOURCE_SIZE, SOURCE_SIZE))

    for position, (tile_index, angle) in enumerate(zip(order, rotations)):
        row = position // GRID_SIZE
        col = position % GRID_SIZE
        x = col * TILE_SIZE
        y = row * TILE_SIZE
        canvas.paste(rotate_tile(tiles[tile_index], angle), (x, y))

    return canvas


def positions_overlap(left: tuple[int, ...], right: tuple[int, ...]) -> bool:
    return any(left[index] == right[index] for index in range(TILE_COUNT))


def random_derangement(size: int, rng: random.Random) -> tuple[int, ...]:
    while True:
        candidate = list(range(size))
        rng.shuffle(candidate)
        if all(candidate[index] != index for index in range(size)):
            return tuple(candidate)


def next_adjacent_safe_order(
    previous: tuple[int, ...],
    seen: set[tuple[int, ...]],
    rng: random.Random,
    max_attempts: int = 5000,
) -> tuple[int, ...]:
    for _ in range(max_attempts):
        derangement = random_derangement(TILE_COUNT, rng)
        candidate = tuple(previous[index] for index in derangement)
        if candidate not in seen:
            return candidate

    raise RuntimeError(
        "Unable to find a new adjacent-safe permutation. "
        "Try a different seed or a smaller count."
    )


def generate_unique_orders(count: int, seed: int) -> list[tuple[int, ...]]:
    if count < 1:
        raise ValueError("count must be >= 1")

    rng = random.Random(seed)
    base = list(range(TILE_COUNT))
    rng.shuffle(base)

    first_order = tuple(base)
    orders = [first_order]
    seen = {first_order}

    while len(orders) < count:
        next_order = next_adjacent_safe_order(orders[-1], seen, rng)
        orders.append(next_order)
        seen.add(next_order)

    return orders


def validate_orders(orders: list[tuple[int, ...]]) -> None:
    if not orders:
        raise ValueError("No permutations were generated")

    if len(set(orders)) != len(orders):
        raise ValueError("Generated permutations are not unique")

    expected_tiles = tuple(range(TILE_COUNT))
    for order in orders:
        if tuple(sorted(order)) != expected_tiles:
            raise ValueError("A generated permutation does not contain all 16 tiles")

    for previous, current in zip(orders, orders[1:]):
        if positions_overlap(previous, current):
            raise ValueError(
                "Adjacent permutations share at least one tile position, "
                "which violates the generation rule"
            )


def random_rotations(rng: random.Random, enabled: bool) -> tuple[int, ...]:
    if not enabled:
        return tuple(0 for _ in range(TILE_COUNT))
    return tuple(rng.choice((0, 90, 180, 270)) for _ in range(TILE_COUNT))


def write_metadata(output_dir: Path, rows: list[tuple[int, str, str, str]]) -> None:
    metadata_path = output_dir / "metadata.csv"
    with metadata_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["index", "filename", "permutation", "rotations"])
        writer.writerows(rows)


def export_permutations(
    input_image: Path,
    output_dir: Path,
    count: int,
    seed: int,
    quality: int,
    random_rotate: bool,
) -> None:
    tiles = load_tiles(input_image)
    output_dir.mkdir(parents=True, exist_ok=True)

    orders = generate_unique_orders(count=count, seed=seed)
    validate_orders(orders)
    rng = random.Random(seed)
    rows: list[tuple[int, str, str, str]] = []

    for index, order in enumerate(orders, start=1):
        signature = permutation_signature(order)
        rotations = random_rotations(rng, enabled=random_rotate)
        rotation_data = rotation_signature(rotations)
        file_name = f"perm_{index:03d}_{signature}.jpg"
        image = compose_image(tiles, order, rotations)
        image.save(output_dir / file_name, format="JPEG", quality=quality, optimize=True)
        rows.append((index, file_name, signature, rotation_data))

    write_metadata(output_dir, rows)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Generate random 4x4 tile permutations from a 2048x2048 PNG and export JPG files."
        )
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=Path("permutations/accidental.png"),
        help="Path to the 2048x2048 PNG source image",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("permutations/jpg_random_300"),
        help="Directory where JPG permutations and metadata.csv are written",
    )
    parser.add_argument(
        "--count",
        type=int,
        default=300,
        help="Number of unique random permutations to generate",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=20260322,
        help="Random seed for reproducible output",
    )
    parser.add_argument(
        "--quality",
        type=int,
        default=92,
        help="JPEG quality (1-95)",
    )
    parser.add_argument(
        "--random-rotate",
        action="store_true",
        help="Apply an independent random 0/90/180/270 degree rotation to each tile",
    )
    args = parser.parse_args()

    if args.quality < 1 or args.quality > 95:
        raise ValueError("quality must be between 1 and 95")

    return args


def main() -> None:
    args = parse_args()
    export_permutations(
        input_image=args.input,
        output_dir=args.output_dir,
        count=args.count,
        seed=args.seed,
        quality=args.quality,
        random_rotate=args.random_rotate,
    )
    print(
        f"Generated {args.count} JPG permutations in {args.output_dir} "
        f"using seed={args.seed}; random_rotate={args.random_rotate}."
    )


if __name__ == "__main__":
    main()