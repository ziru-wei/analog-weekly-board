# Changelog

## 0.1.3

- Suppress conflict copies when boards differ only in horizontal text whitespace or translations of at most 5 board pixels per item/pin.
- Apply the same comparison to archive conflicts and prevent adding near-identical copies of existing conflicts from the same week and kind.
- Preserve conflict detection for text content, line breaks, URLs, photos, structural changes, resizing, rotation, layer order, and larger movements. Existing conflict copies are not automatically deleted.
- Add 15 regression cases for similarity matching and conflict convergence.

## 0.1.2

- Render Dashboard tape with the board's blue tape material and use matching note fonts, padding, and automatic text sizing, including vellum labels.
- Fix repeated conflict copies when editing while a Google Drive upload is in progress.
- Merge downloads against the latest local state so edits made during network requests survive.
- Recover the sync baseline after an upload succeeds but its response is lost, including after reopening the app.
- Ignore store notifications that do not change the board document.
- Compare archive revisions directly instead of relying on device clocks.
- Add regression coverage for delayed uploads/downloads, failed responses, and genuine offline conflicts.
- Exclude local environment files, worker secrets, and developer notes from the Firefox review source archive.

Existing conflict copies remain available for recovery in the Dashboard.
