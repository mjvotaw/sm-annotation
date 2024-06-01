import { App } from "../../App"
import { Overlay } from "./Overaly"

export class OverlayManager {
  view: HTMLDivElement
  overlays: Overlay[] = []
  app: App

  constructor(app: App, view: HTMLDivElement) {
    this.app = app
    this.view = view
  }

  openOverlay(overlay: Overlay) {
    if (overlay.options.overlay_id) {
      const existingOverlay = this.getOverlayById(overlay.options.overlay_id)
      if (existingOverlay) {
        return
      }
    }
    overlay.addToManager(this)
    this.overlays.push(overlay)
  }

  removeOverlay(overlay: Overlay) {
    this.overlays.splice(this.overlays.indexOf(overlay), 1)
  }

  getOverlayById(id: string): Overlay | undefined {
    for (const overlay of this.overlays) {
      if (overlay.options.overlay_id == id) return overlay
    }
    return undefined
  }

  closeOverlay(id: string) {
    const overlay = this.getOverlayById(id)
    if (overlay) {
      overlay.closeOverlay()
    }
  }
}
