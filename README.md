# comfyui-navigator

Floating side panel that lists every **group** in your current workflow and
lets you jump between them instantly. For graphs that span 30000+ pixels with
15+ workflows-within-a-workflow, this turns "scroll forever to find the
upscale section" into "click the row, you're there."

## What it does

- Auto-detects every group on the open workflow (no setup, no node to drop)
- Click a row → animated pan + zoom to fit that group on screen
- Search box at the top — type "qwen" to narrow to Qwen groups
- **Right-click a row → Solo run** (mutes every other group via rgthree's
  Fast Groups Muter if installed, falls back to per-node mode flag if not)
- **Right-click → Reset** to re-enable everything
- **Keyboard 1–9** jumps to the first nine groups
- Drag the header to move the panel anywhere; collapse with ▾
- Position + collapsed state persisted across reloads (localStorage)

Hides itself automatically if the workflow has fewer than 2 groups (nothing
to navigate between).

## Install

```
cd <ComfyUI>/custom_nodes
git clone <repo-url> comfyui-navigator
```

Restart ComfyUI. The panel appears in the top-right of the canvas whenever
you open a workflow with multiple groups.

## Recommended pairing

- **Fast Groups Muter (rgthree)** — drop one on the graph and Solo / Reset
  drive it directly. Without it, Solo falls back to flipping
  `node.mode = LiteGraph.NEVER` per-node (cruder, no chip indicators).

## License

MIT
