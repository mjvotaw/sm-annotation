import { Overlay } from "./Overaly"

export class LoadingOverlay extends Overlay {
  constructor() {
    super({
      overlay_id: "loading-overlay",
    })
    this.initView()
  }

  initView() {
    this.viewElement.replaceChildren()
    const loadingText = document.createElement("div")

    loadingText.classList.add("loading-text")
    loadingText.innerText = "Loading..."
    this.viewElement.appendChild(loadingText)
  }
}
