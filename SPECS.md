# Specs: `docs/index.html` Grid Rewrite

## Goal
Replace the current text-based landing page with a centered 4x4 image grid built from `docs/images/thumbnails`.

## Requirements Mapping
1. Remove all existing text and interaction from the HTML page.
2. Render a 4x4 square grid (16 cells total).
3. Use one thumbnail image per cell as the cell background (`cover00.jpg` to `cover15.jpg`).
4. Keep the grid centered both vertically and horizontally in the viewport.
5. Grid sizing:
   - Default: grid side length is 80% of the viewport’s shortest dimension (`80vmin`).
   - Mobile: grid side length is 100% of the viewport’s shortest dimension (`100vmin`).
6. Hover behavior: hovered cell appears 50% transparent.

## Implementation Plan
1. Remove existing typography, animation, and JavaScript from `docs/index.html`.
2. Build a single `.grid` container with 16 `.cell` elements in HTML.
3. Apply CSS Grid (`repeat(4, 1fr)`) with square container dimensions.
4. Set each cell background image to one thumbnail file.
5. Add hover style (`opacity: 0.5`) with a small transition.
6. Add responsive media query for mobile sizing.

## Assumption
- “dosc/images/thumbnail” refers to `docs/images/thumbnails` in this repository.
