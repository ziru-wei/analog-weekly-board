# Changelog

## 0.1.3.1

- Finalize all drag gestures at pointer-release coordinates and capture on the stable workspace. Prevent fast supply drops, card moves, resizes, rope connections and tape gestures from disappearing or missing their final position; preserve double-click editing and deletion.

- Prevent pointer-captured double clicks on board objects from opening Dashboard; require a click starting outside the board and remaining outside.

- Enlarge WebGL silver pins by 50% and their hit areas; give the curtain its own full-size background frame.

- Catch up silver-pinned items from all overdue boards into the current week, retaining silver pins on the new copies and removing them from past boards. Repeat each week until the current pin is removed.

- Force all boards into full Monday–Sunday weeks, remove partial-week dates, and preserve board contents and silver-pin carry-over.

- Prepare refreshed Chrome, Firefox and AMO review packages.
- Fix weeks to Monday–Sunday and remove the calendar preference, ignoring legacy local and cloud settings.
- Fill the next-week curtain board background and widen the theatre curtain to cover its full width.

## 0.1.3

- Support multiple boards per week and migrate existing archives without losing their content. Keep one editing tab active at a time.
- Add Command/Ctrl+A to select all cards, pins and strings; copy and paste complete layouts between boards with independent IDs and one-step undo.
- Order weeks from oldest to newest within each Dashboard month. Stack boards with overlapping previews, clearer shadows and hover feedback.
- Hide additional-board creation behind five consecutive left clicks on This week and a confirmation; confirm deletion of a week's last board.
- Review sync conflicts one pair at a time in a compact dialog with detailed, read-only previews. Keep one version, postpone, or resume from the account menu; show an avatar warning while unresolved.
- Preserve original board identity when resolving conflicts and sync resolution records so other devices cannot restore discarded copies.
- Redraw the future-week theatre curtain with flat red colour blocks and fine gold details.
- Render the colour palette as a thin pressed-metal tray with square pigment pads and subtle pointer-driven WebGL reflections. Match next week's curtain backing to the current board colour.
- Add a distinct WebGL silver ball pin to the lower-left supply. Carry silver-pinned items into the next week's first board while preserving earlier weeks, layout, other attached pins and internal strings.
- Stop carrying an item when its silver pin is removed. When removing an older pin, ask whether to remove matching later pins if the latest week still has one; retain all existing items.
- Double-click placed pins to remove them without opening the Dashboard.


## 0.1.2

- Duplicate board items with Option/Alt-drag or Command/Ctrl+C and V, preserving content and attached pins with independent IDs and single-step undo.

- Toggle tracing-paper and black labels with Enter, measuring their content in the destination font to fit narrower paper or longer strips.

- Use the authored localhost board as the first-use layout, preserving all 22 elements, seven pins and two strings. Existing boards are preserved.
- Shift-click to select or deselect multiple items; move, Option-drag, copy/paste and delete the group together, preserving relative positions and internal strings.

- Animate tracing-paper growth and its release onto the board, respecting reduced motion.
- Remove hover tooltips and bottom shortcut hints. Use a smaller 300 × 220 ordinary website preset, omit description subtitles, and let preview images fill remaining space.

- Preserve the perforated paper shape in compact website cards, with a vertical divider, shared typography and text-only domain links with hover feedback.

- Check and request missing Firefox host permissions before creating YouTube frames, including extension upgrades.
- Add a red pin at the upper-right corner of every newly pasted website card, including YouTube and social posts.
- Show video and social-post markers in static Dashboard thumbnails.
- Add website title/image previews and Instagram/X embeds; preserve Xiaohongshu share tokens and show a fallback for login-required notes.
- Toggle selected website cards between expanded and thumbnail-left compact layouts with Enter; restore prior dimensions and switch layouts automatically in both resize directions.
- Allow all website cards to shrink to 150 × 76 board units with responsive content.

- Embed YouTube videos inside website clippings automatically, with support for common video URL formats and start timestamps.
- Use compact 16:9 video cards, fetch video titles, fit existing links automatically, and retain an Open on YouTube fallback.
- Show a dark loading screen until board fonts, images, tray and player frames settle, with a timeout for unavailable resources.
- Identify extension-initiated player requests for YouTube playback; document the added player host permission and network behavior.

- Add Option + . on macOS (Alt + . elsewhere) to open or focus the Firefox extension's board.
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
