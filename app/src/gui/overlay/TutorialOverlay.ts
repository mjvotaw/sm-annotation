import { App } from "../../App"
import { SongPackSelectorWindow } from "../window/SongPackSelectorWindow"
import { Overlay } from "./Overaly"

export class TutorialOverlay extends Overlay {
  constructor(app: App) {
    super(app, {
      overlay_id: "tutorial-overlay",
    })

    this.initView()
  }

  initView() {
    this.viewElement.replaceChildren()

    const welcomeText = document.createElement("div")
    welcomeText.classList.add("tutorial-text")
    welcomeText.innerHTML =
      'Hey! It looks like this is your first time. <br />Please take a minute to read the <a href="https://github.com/mjvotaw/sm-annotation/blob/parity-editor/STEPANNOTATION.md" target="_blank">instructions</a> to familiarize yourself with how to use this.<br /><br />'

    const okButton = document.createElement("button")
    okButton.classList.add("tutorial-text")
    okButton.innerText = "Yeah I totally read the instructions!"

    okButton.onclick = () => {
      localStorage.setItem("user_id", window.crypto.randomUUID())
      SongPackSelectorWindow.openSongPackSelector(this.app)
      this.closeOverlay()
    }
    this.viewElement.appendChild(welcomeText)
    this.viewElement.appendChild(okButton)
  }
}
