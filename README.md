# Analog Weekly Board

A finite, tactile corkboard built with React, TypeScript, and Vite.

```sh
npm install
npm run dev
npm run build
npm run typecheck
```

Open the Vite URL (normally http://localhost:5173). History uses keyboard shortcuts.

## Weekly archive, Dashboard & sync

Each Monday–Sunday week has its own board; when Monday arrives the finished week is archived automatically (the first week may be partial). Double-click the dark area outside the board to open the **Dashboard** with every archive (Esc returns). Data lives in IndexedDB. Sign in with Google on the Dashboard to sync boards, archives and photos across devices through the hidden app-data folder of your Google Drive — see [docs/google-drive-setup.md](docs/google-drive-setup.md). Browser extensions: `npm run build:ext` (Chrome + Firefox); long-lived sign-in needs the tiny auth worker in [worker/](worker/README.md).

Sync uses a local revision and the last acknowledged cloud revision. Requests run serially; downloads merge against the latest local state, and successful uploads advance the baseline even if editing continued during the request. An IndexedDB upload checkpoint recovers acknowledgements after interrupted requests. Photos remain separate content-addressed assets. Genuine divergent edits preserve a conflict copy; existing copies can be restored or discarded in the Dashboard. This is periodic snapshot sync, not real-time collaborative editing: simultaneous writes from different devices to Drive are not atomic.

Run `npm test` for sync regression tests and `npm run typecheck` for TypeScript validation. `npm run package:amo` prepares the Firefox extension, source archive, and reviewer notes in `release/amo/`. See [CHANGELOG.md](CHANGELOG.md) for changes.

Conflict detection ignores spaces/tabs in displayed text and translations of up to 5 board pixels per item or pin. Line breaks, actual content, URLs, images, sizing, rotation, and layer order still matter. When two divergent current boards differ only within this tolerance, the cloud version becomes current without a conflict copy; archives retain the existing timestamp-based winner. Ordinary one-sided edits still sync normally. Existing conflict copies remain available, but another near-identical copy for the same week and kind is not added.

- Double-click empty cork to create and edit a compact, unpinned black label with white text. Drag from the bottom-left paper stack to create a compact sticky note without a pin; its next top sheet gets a random color. A separate supply to the right of the stack, near the board’s lower edge, has seven pins (three above, four below): elapsed weekdays including today are red, with the remaining pins white, counting Monday first. Drag a supply pin to copy it; drop on cork for an independent pin or on any component to attach it and follow that component.
- Double-click a note to write. Right-click a note for the metal paper-color palette.
- Paste an image from the clipboard to add a borderless photograph. File pickers and image dropping are intentionally unavailable. Paste a full HTTP(S) URL to add a website clipping.
- Select a photo, then press **Enter** to cycle through white instant-photo paper, a print with black top and bottom margins touching the image, and a borderless print with softly worn edges; press **Space** to enlarge it (the rest of the board dims and blurs); **double-click** it to crop in place (Enter applies, Esc cancels, R resets). The caption remains stored. Only the white frame shows a caption; double-click its lower margin to edit the faded handwriting; Enter or clicking elsewhere finishes editing.
- Drag papers to arrange them. Select a paper to reveal its resize handle. Photos retain their natural image aspect ratio; hold Shift to resize freely.
- Drag a pin immediately onto another pin to connect them. Releasing elsewhere cancels only the new string, preserving the source pin and its existing strings. While dragging a new string, press Space to place a matching pin at the cursor and connect it immediately; over a component, the new pin attaches to it. This only works inside the board, and the pin plus string undo together.
- Right-click a pin to open its metal color palette. Hold a pin for about half a second and drag to reposition it, move it to another component, or detach it onto cork. A short click simply selects the pin.
- Shift-double-click a paper to add another pin at that point.
- Strings are rendered above all papers, with pins above the strings. Click a string to select it in red; it pulls taut and stays taut while selected, then rebounds to its relaxed curve when deselected, with its shadow intact. Reduced-motion preferences skip this animation.
- Delete/Backspace removes the selected paper, pin, or string; editing text is protected. Escape cancels a gesture and restores its starting state.
- Undo with Cmd/Ctrl+Z; redo with Cmd/Ctrl+Shift+Z. There are no history buttons. A new document edit clears the redo branch. Continuous drags, resizes, and edits form single history entries; removing a pin and its strings is also one entry.
- The full board fits the window initially. Scroll up or trackpad-pinch outward to zoom toward the pointer, up to 2.5× the fitted size. Zooming back stops at the fitted size. Drag empty cork to pan while zoomed in.
- Double-click a website card’s large title to edit it; Enter or clicking elsewhere commits the change. Its domain link opens the original URL in a new tab. Ticket cutouts are transparent to the board beneath.

## Implementation

`src/model.ts` defines the JSON-serializable document, deterministic item variation, and rotated pin geometry. `src/store.ts` contains the local document adapter and the item/pin/connection commands. `useDocument` subscribes through React's external-store interface; a future Yjs adapter can retain the command API. Removing a paper or pin also removes its incident strings.

`src/App.tsx` owns ephemeral selection, editing, pointer gestures, menus, and temporary strings. `src/components/ColorPalette.tsx` contains the shallow polished-metal tray, subtle pointer-following reflection, unchanged swatch rendering, and all paper/pin color profiles. Paper colors follow bright Post-it-style hues; pins use vivid glossy plastic colors. `src/components/WebsiteCard.tsx` owns the website clipping layout and its adaptive detail levels. Small clippings reduce padding, hide images/descriptions, and clamp their titles; notes reduce spacing and type size, then scroll for longer text. `src/components/Item.tsx` renders DOM papers and caption editors; `src/components/Pin.tsx` renders the pins in a separate overlay. `src/components/Ropes.tsx` renders every connection in a single SVG above the paper layer. The document store has bounded snapshot history and gesture transactions for undo; neither interaction state nor history is part of the serializable document. Papers can extend beyond the finite 1600 × 1000 board; geometry commands stop their pins at the cork boundary. Pin silhouettes update from their live board positions, with contact shadows anchored under the plastic bases.

`src/texture.ts` retains the supplied `1.html` texture's seeded Gaussian and multiscale smooth-field algorithm, tuned to a warmer cork color and finer pores. It draws a subtle joint between two panels. A canvas generates only this static cork bitmap; it is not used to render objects or interactions. The original file is preserved.

The paper palette approximates Post-it's bright [Power Pink and Acid Lime](https://www.post-it.com/3M/en_US/p/d/v100849330/) colors; these are screen approximations, not published brand HEX values. Pasted website clippings start at a compact height and reserve description space only when their size permits it.

The lower-right metal shelf holds a large matte blue painter’s tape roll. Click to pick it up, then press and drag anywhere on the board to lay a straight strip. Release to leave the strip, and keep drawing additional strips. Escape cancels an unfinished strip and returns the roll; clicking the empty tray slot also returns it. Each strip supports selection, movement, deletion, and undo/redo and starts without pins. Selected strips have left/right endpoint handles that change length while keeping the opposite end and tape width fixed. `Tape.tsx` and `Tape.css` adapt the supplied `blue-painters-tape-v6-restored-tear.html`, with the original texture retained for the roll and fixed-scale, overlap-blended copies of the supplied paper scan via `tapeTexture.ts` for strips, preserving the original grain direction without mirror seams or stretching.

This phase is session-only: refresh restores the composed demo. Imported images use browser object URLs, with no upload or backend. A serialized document can contain those URL strings, but the image bytes are not durable. Website previews use a clean domain fallback instead of cross-origin scraping.

The bundled demo photograph comes from [Unsplash](https://images.unsplash.com/photo-1473116763249-2faaef81ccda). Local fonts are Marker Felt (WOFF2) for photo captions, LXGW WenKai for Chinese, and Fluxisch Else for other English content. Website cards retain their original font stacks. The photo and fonts are bundled locally.

Tape stays fully within the cork when drawn, moved, or lengthened. Papers stop above the lower-right shelf; the held roll has a generous return target around that shelf. Empty notes have no placeholder text.

With nothing selected or being edited, typing produces a translucent tracing-paper label at the top center. Enter commits it to the board; Escape cancels the draft. The floating composer and committed tracing-paper layer use backdrop blur over all content below them. Black and tracing-paper labels stay entirely inside the board. Unpinned regular notes may overhang by at most one third of their width; the clip image’s measured bounds block paper movement.

## License

Source code: [GPL-3.0-or-later](LICENSE) — required because the app uses `@threepipe/webgi-plugins` (GPL-3.0 with additional terms). Bundled fonts and images keep their own licenses: LXGW WenKai and Sarasa Mono are under the SIL Open Font License; check the license of any other font or image before reusing it.
