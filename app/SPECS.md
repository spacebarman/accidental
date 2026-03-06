This basically decouples the Grid and Cover views of the app in /docs, and connects them via a backend.

## Stack
- Node.js
- Websockets (simple implementation, as few librarieds as possible)

## Architecture:
- Websockets server
- 2 web apps:
  - Grid: mobile app displaying a grid of 16 images (similar to grid view of original app in /docs)
  - Cover: desktop ap that displays a single image (similar to the cover view of the original app in /docs)

## Grid app specific requirements:
- It acts as a remote control for the desktop app: when a tile from the grid is tapped, the image in the desktop app switches to that image, and plays back the corresponding song.
- Below the grid, instead of the buttons shown in the original app, there will be some brief instructions and a link to buy the album (TBD).

## Cover app specific requirements:
- This app is not meant for direct interaction, so no need for links or buttons, just display.
- It should display the cover corresponding to the song currently being played
- Just as in the original app. a progress bar should be just below the cover image
- No buttons, just the text "SPACEBARMAN · ACCIDENTAL"