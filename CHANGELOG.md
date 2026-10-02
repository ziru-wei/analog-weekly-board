# Changelog

## 0.1.2

- Keep placed pins, supply pins, and dragged pin previews above vellum and other board items.
- Open Dashboard boards with a double-click; retain keyboard activation.
- Clip thumbnail content to rounded corners and draw hover feedback inside a separate frame.

- Show elapsed sync time on the board and below the Dashboard profile avatar.
- Move account details and sync/sign-out actions into an avatar dropdown.
- Simplify Dashboard thumbnails to text bars and flat blue tape; defer offscreen rendering.
- Add a Drive-synced week-start selector, effective from the next selected weekday; preserve existing boards.
- Remove the back button and automatic archive explanatory line.
- Suppress conflict copies when boards differ only in horizontal text whitespace or translations of at most 5 board pixels per item/pin.
- Apply the same comparison to archive conflicts and prevent adding near-identical copies of existing conflicts from the same week and kind.
- Preserve conflict detection for text content, line breaks, URLs, photos, structural changes, resizing, rotation, layer order, and larger movements. Existing conflict copies are not automatically deleted.
- Add 15 regression cases for similarity matching and conflict convergence.
- Keep full archive details readable with the board's fonts, note sizing, vellum labels, and tape material.
- Fix repeated conflict copies when editing while a Google Drive upload is in progress.
- Merge downloads against the latest local state so edits made during network requests survive.
- Recover the sync baseline after an upload succeeds but its response is lost, including after reopening the app.
- Ignore store notifications that do not change the board document.
- Compare archive revisions directly instead of relying on device clocks.
- Add regression coverage for delayed uploads/downloads, failed responses, and genuine offline conflicts.
- Exclude local environment files, worker secrets, and developer notes from the Firefox review source archive.

Existing conflict copies remain available for recovery in the Dashboard.
