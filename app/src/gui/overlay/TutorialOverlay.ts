import { Overlay } from "./Overaly"

export class TutorialOverlay extends Overlay {
  constructor() {
    super({
      overlay_id: "tutorial-overlay",
    })
    this.initView()
  }

  initView() {
    this.viewElement.replaceChildren()

    // this.viewElement.appendChild()
  }
}
