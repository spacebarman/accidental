
# Accidental Web App – Technical Specifications

## Overview
This static web app presents a 4x4 grid of album artwork tiles, each corresponding to a track from the album "Accidental" by Spacebarman. The app provides a randomized audio playback experience, album information in multiple languages, and a visually engaging, accessible interface. All logic is implemented client-side in a single HTML file with embedded CSS and JavaScript.

## Features

- **4x4 Responsive Grid:**
   - 16 tiles, each showing a unique album artwork thumbnail.
   - Tiles highlight the currently playing track and indicate the next track visually.
   - Clicking a tile starts playback of the corresponding track and shuffles the play order.

- **Audio Playback:**
   - Tracks are played in a randomized, non-repeating order until all have played.
   - Playback controls: Play/Pause, Next Track, Toggle Grid/Cover View.
   - Progress bar animates as audio plays; tile transforms reflect progress.
   - Audio files are referenced via a base64-encoded, JSON-stringified playlist array, decoded at runtime for light obfuscation.

- **Info Dialog:**
   - Modal dialog with album information, instructions, and notes.
   - Language selector (English, Spanish, Catalan) with persistent preference.
   - “Get this album on Bandcamp” link (localized) and external site link.
   - Accessible close button and keyboard shortcuts (Escape, I, C, N, Space).

- **UI/UX Details:**
   - Custom SVG icons for controls (play, pause, next, info, view toggle).
   - Smooth CSS transitions for progress, tile transforms, and control states.
   - Controls and info dialog are keyboard accessible and screen-reader friendly.
   - Brand header: “SPACEBARMAN” links to the artist’s site; “ACCIDENTAL” is plain text.

- **Obfuscation/Anti-leech:**
   - Playlist URLs are not exposed directly in the source; they are decoded from a base64-encoded JSON string at runtime.
   - Variable/function names and logic may be intentionally non-descriptive or rearranged for deterrence.
   - No server-side protection; all files are statically hosted.

## File Structure

- `docs/index.html` – Main app (HTML, CSS, JS, SVG icons, logic)
- `docs/images/thumbnails/` – 16 tile images
- `docs/images/coverarts/` – 16 cover images for cover view
- `docs/images/icon-*.svg` – SVG icons for controls
- `docs/fonts/` – Custom fonts

## Accessibility & Internationalization

- All controls have ARIA labels and keyboard shortcuts.
- Info dialog and controls are navigable via keyboard.
- Album info is available in English, Spanish, and Catalan; language preference is saved in localStorage.

## Limitations

- Audio files are still accessible to determined users via browser dev tools or network inspection.
- No DRM or server-side download protection.
- Static hosting only; no backend or dynamic playlist generation.

## Version

Specs updated: February 2026
