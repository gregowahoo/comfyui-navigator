"""comfyui-navigator: floating side-panel that lists every group in the
current workflow and lets you click to pan/zoom to it (or right-click to
solo-run via rgthree's Fast Groups Muter).

JS-only extension — no nodes to drop. Active automatically when the open
workflow has 2+ groups.
"""

WEB_DIRECTORY = "./web"

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
