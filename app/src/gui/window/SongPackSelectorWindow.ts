import scrollIntoView from "scroll-into-view-if-needed"
import { App } from "../../App"
import { Window } from "./Window"
import { SongPackData, getSongPacks } from "../../util/AWS"

interface SongPackSelectorWindowOptions {
  title: string
  disableClose?: boolean
}

export class SongPackSelectorWindow extends Window {
  app: App

  static openSongPackSelector(app: App) {
    app.windowManager.openWindow(
      new SongPackSelectorWindow(app, {
        title: "Load Random Song",
      })
    )
  }

  constructor(app: App, options: SongPackSelectorWindowOptions) {
    super({
      title: options.title,
      width: 500,
      height: 400,
      disableClose: options.disableClose,
      win_id: "file_selector" + Math.random(),
      blocking: true,
    })
    this.app = app

    this.initView()
  }

  async initView() {
    // Create the window
    this.viewElement.replaceChildren()

    //Padding container
    const padding = document.createElement("div")
    padding.classList.add("padding")

    //Menu Button Options
    const menu_options = document.createElement("div")
    menu_options.classList.add("menu-options")

    const menu_options_left = document.createElement("div")
    menu_options_left.classList.add("menu-left")
    const menu_options_right = document.createElement("div")
    menu_options_right.classList.add("menu-right")
    menu_options.appendChild(menu_options_left)
    menu_options.appendChild(menu_options_right)

    const cancel = document.createElement("button")
    cancel.innerText = "Cancel"
    cancel.onclick = () => {
      this.closeWindow()
    }

    const select_btn = document.createElement("button")
    select_btn.innerText = "Load Song"
    select_btn.classList.add("confirm")
    select_btn.onclick = () => this.loadSong()
    menu_options_left.appendChild(cancel)
    menu_options_right.appendChild(select_btn)

    const desc = document.createElement("p")
    desc.innerText = "Select a song pack:"

    //Create file explorer
    const scroll = document.createElement("div")
    scroll.classList.add("dir-selector")

    scroll.onclick = e => {
      if (e.target != scroll) return
      this.selectElement(undefined)
    }

    const file_options = document.createElement("div")
    file_options.classList.add("file-options")

    padding.appendChild(desc)
    padding.appendChild(scroll)
    padding.appendChild(file_options)
    padding.appendChild(menu_options)
    this.viewElement.appendChild(padding)

    await this.createDiv().then(elements => scroll.replaceChildren(...elements))
  }

  private async expand(element: HTMLElement) {
    if (!element.parentElement!.classList.contains("folder")) return
    element.parentElement!.classList.remove("collapsed")
    const children = element.nextSibling as HTMLDivElement
    await this.createDiv().then(elements => {
      children.replaceChildren(...elements)
    })
  }

  private selectElement(element: HTMLElement | undefined) {
    this.viewElement
      .querySelector(".info.selected")
      ?.classList.remove("selected")
    if (!element) {
      return
    }
    element.classList.add("selected")
    scrollIntoView(element, {
      scrollMode: "if-needed",
      block: "nearest",
      inline: "nearest",
    })
    const button: HTMLButtonElement =
      this.viewElement.querySelector("button.confirm")!
    const pack_id = element.dataset.pack_id
    button.disabled = true
    if (!pack_id) return
    button.disabled = false
  }

  private async createDiv(): Promise<HTMLDivElement[]> {
    const songPacks = await getSongPacks()

    let elements = songPacks.map(songPack =>
      this.createSongPackElement(songPack)
    )
    const randomElement = this.createAnyPackElement()
    elements = [randomElement, ...elements]
    return elements
  }

  private createSongPackElement(songPack: SongPackData) {
    const new_div = document.createElement("div")
    new_div.classList.add("item")

    const info = document.createElement("div")
    info.classList.add("info")
    info.dataset.pack_id = songPack.pack_id.toString()
    new_div.appendChild(info)

    const title = document.createElement("span")
    title.innerText = songPack.pack_name
    title.classList.add("title")

    const percentComplete = Math.floor(
      (songPack.songs_with_one_annotation / songPack.total_songs) * 100
    )
    const details = document.createElement("span")
    details.innerText = `(${songPack.total_songs} songs, ${percentComplete}% complete)`
    details.classList.add("details")

    info.appendChild(title)
    info.appendChild(details)
    info.addEventListener("click", () => this.selectElement(info))

    return new_div
  }

  private createAnyPackElement() {
    const new_div = document.createElement("div")
    new_div.classList.add("item")

    const info = document.createElement("div")
    info.classList.add("info", "selected")
    info.dataset.pack_id = "--any-pack--"
    new_div.appendChild(info)

    const title = document.createElement("span")
    title.innerText = "(Random Song from any pack)"
    title.classList.add("title")

    info.appendChild(title)
    info.addEventListener("click", () => this.selectElement(info))

    return new_div
  }

  private loadSong() {
    const selected: HTMLElement | null =
      this.viewElement.querySelector(".info.selected")
    const pack_id_str = selected?.dataset.pack_id
    if (!pack_id_str) return

    const pack_id =
      pack_id_str == "--any-pack--" ? undefined : parseInt(pack_id_str)
    this.app.chartManager.loadSongFromAWS(pack_id)
    this.closeWindow()
  }

  async selectPath(path: string | undefined) {
    if (!path) return
    const scroll = this.viewElement.querySelector<HTMLElement>(".dir-selector")
    if (!scroll) return
    const parts = path.split("/")
    parts.pop()
    const pathBuild = []
    while (parts.length > 0) {
      pathBuild.push(parts.shift())
      const element = scroll.querySelector<HTMLElement>(
        "div[data-path='" + this.escapeSelector(pathBuild.join("/")) + "']"
      )
      if (!element) return
      await this.expand(element)
    }
    const finalElement = scroll.querySelector<HTMLElement>(
      "div[data-path='" + this.escapeSelector(path) + "']"
    )
    if (!finalElement) return
    this.selectElement(finalElement)
  }

  private escapeSelector(selector: string) {
    return selector.replaceAll(/'/g, "\\'")
  }
}
