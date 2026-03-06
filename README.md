# accidendal
Page and a tools for the album Accidental

## Installation Version (`app/`)

This repository includes an installation-focused version of the app in `app/`:

- `grid` view (`/grid`): mobile remote with a 4x4 tile grid
- `cover` view (`/cover`): desktop display with cover art + progress bar
- backend: Node.js + WebSocket server coordinating both views

### Run

```bash
cd app
npm install
npm start
```

Server default URL: `http://localhost:8787`

- Open `http://localhost:8787/cover` on the installation display
- Open `http://localhost:8787/grid?qr=true` on mobile (for example via QR code)

Requests to `/grid` without `?qr=true` are redirected to `https://www.spacebarman.com/accidental`.
When the Grid app opens with `?qr=true`, the server treats it as a new session (QR-scan equivalent) and reshuffles the randomized playlist.
The Cover app requires one explicit tap/click after each boot to enable browser audio playback.

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
