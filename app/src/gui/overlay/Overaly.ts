import { OverlayManager } from "./OverlayManager"

// This is a super simple class for displaying screen-wide overlays

export interface OverlayOptions {
  overlay_id?: string
}

export abstract class Overlay {
  private overlayManager?: OverlayManager

  overlayElement: HTMLDivElement
  viewElement: HTMLDivElement
  options: OverlayOptions
  protected constructor(options: OverlayOptions) {
    this.options = options

    const overlayElement = document.createElement("div")
    const viewElement = document.createElement("div")

    if (options.overlay_id) {
      overlayElement.dataset.overlay_id = options.overlay_id
    }
    overlayElement.classList.add("overlay")
    viewElement.classList.add("overlay-inner")
    overlayElement.appendChild(viewElement)
    this.overlayElement = overlayElement
    this.viewElement = viewElement
  }

  addToManager(overlayManager: OverlayManager) {
    this.overlayManager = overlayManager
    overlayManager.view.appendChild(this.overlayElement)
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  onClose(): void {}

  closeOverlay() {
    if (this.overlayManager) {
      this.onClose()
      this.overlayManager.removeOverlay(this)
      setTimeout(
        () => this.overlayManager!.view.removeChild(this.overlayElement),
        40
      )
    }
  }
}
