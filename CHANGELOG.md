# Changelog

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
