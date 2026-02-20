# accidendal
Page and a tools for the album Accidental

## Split PNG into 4x4 tiles

Use `split_png_grid.py` to split a `1024x1024` PNG into `16` images of `256x256`.

### Requirements

- Python 3
- Pillow (`pip install pillow`)

### Usage

- Split only:

```bash
python split_png_grid.py input.png
```

- Split and verify output names/count/sizes:

```bash
python split_png_grid.py input.png --verify
```

The script writes files to a subdirectory named `<original_name>_tiles` using names:

- `<original_name>_00.png`
- ...
- `<original_name>_15.png`
