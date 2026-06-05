# comfyui-navigator

> A floating panel that lists every group in your ComfyUI workflow, lets you
> jump between them, toggle them on/off, and run only the ones you want — all
> at one click, regardless of canvas zoom.

For graphs that span 30,000+ pixels with 15+ logical sub-workflows packed
into them, scrolling to your Fast Groups Muter just to flip a toggle is its
own pain. This panel keeps that whole control surface always visible.

<img width="1277" height="629" alt="Image" src="https://github.com/user-attachments/assets/ef642144-3df2-4255-8c99-a460db7ec64a" />
<img width="1274" height="604" alt="Image" src="https://github.com/user-attachments/assets/552149c2-55c4-46af-8796-564af87e34fc" />

## What it does

- **Auto-detects every group** in the current workflow. No setup, no nodes
  to drop.
- **Click a row → pan + zoom** to that group.
- **Click the toggle pill → enable/disable** the group (drives your existing
  [rgthree-comfy](https://github.com/rgthree/rgthree-comfy) Fast Groups Muter
  behind the scenes).
- **Enable All / Disable All / Run** buttons in the toolbar.
- **Drag rows to reorder them** — define a "step 1 → step 2 → ..." flow.
  Order persists across reloads.
- **Keyboard shortcuts** — number keys jump to that row (1, 2, ... and
  multi-digit like 10, 11, ... for longer lists). Configurable to any key
  in the settings panel.
- **Custom colors** — four theme variables exposed via color pickers.
- **Respects `matchColors`** — if you scope a Fast Groups Muter to specific
  group colors (e.g. for sub-groups), the panel mirrors only the primary
  muter's groups and hides the sub-group rows.

## Requirements

- ComfyUI (any recent version)
- [rgthree-comfy](https://github.com/rgthree/rgthree-comfy) installed and at
  least one `Fast Groups Muter` node on the graph

Without a muter, the panel still shows your groups and the jump/reorder
features work — but toggles render as a dashed placeholder (no muter to
drive). Drop a muter to unlock the full UX.

## Install

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/gregowahoo/comfyui-navigator.git
```

Restart ComfyUI. The panel appears top-right of the canvas whenever you open
a workflow with two or more groups.

## Usage

1. Have at least one `Fast Groups Muter (rgthree)` on your graph.
2. The panel renders one row per managed group:
   - **Click toggle pill** → flip the group on/off (drives the muter)
   - **Click row body** → pan + zoom to that group
   - **Drag a row** → reorder (drop indicator shows where it'll land)
3. Toolbar:
   - **Enable All / Disable All** — flip every group
   - **▶ Run** — queue the prompt (only enabled groups execute)
   - **⚙ Settings** — colors, keyboard shortcuts, row order reset
4. Drag the **panel header** to move the panel anywhere; double-click
   the header (or the **▾** button) to collapse.

## Keyboard shortcuts

Defaults:
- `1`, `2`, `3`, ... jump to that row by position.
- **Multi-digit** numbers work too: type `1` `5` within ~350ms to jump
  to row 15. Single digits stay snappy — if no two-digit row could
  possibly start with that digit (e.g. `2` when you only have 15 rows),
  the jump fires immediately with no wait.
- Drag-reorder a row and its number reassigns automatically (the row
  in slot 1 always gets `1`, slot 2 gets `2`, etc.).

Override any default in **⚙ Settings → Keyboard shortcuts**. Custom mappings
override only the specific keys you bind; the remaining defaults stay active.

`Ctrl` / `Alt` / `Meta` modifiers are ignored — those are reserved for
browser/ComfyUI hotkeys. Single-char keys only (custom mappings).

## Settings (⚙)

- **Colors** — four pickers: body, header bar, accent (toggle "on" glow + button
  hover), row hover. Live preview, persists to localStorage.
- **Keyboard shortcuts** — add `key → group` rows. Empty list = defaults.
- **Reset row order** — clear the drag-defined order (back to rgthree's sort).
- **Reset all settings** — wipes colors, shortcuts, and order.

## Known limitations

- The panel reads `LGraphCanvas.ds.scale` / `.offset` to compute pan/zoom
  targets. If ComfyUI's internal canvas API changes name, panning may break.
- Pinning to viewport works only while panel is visible — collapsed = no nav.
- Drag-to-reorder uses HTML5 DnD; on some touchscreens / styluses the drop
  zones may need a longer hold to trigger. Mouse works as expected.

## License

MIT — see [LICENSE](LICENSE).

## Acknowledgements

Built on top of [rgthree-comfy](https://github.com/rgthree/rgthree-comfy)'s
Fast Groups Muter. This panel just gives that node a floating, searchable,
keyboard-driven, drag-reorderable face.
