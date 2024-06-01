import {
  BitmapFont,
  Container,
  Renderer,
  TEXT_GRADIENT,
  Ticker,
  UPDATE_PRIORITY,
} from "pixi.js"
import semver from "semver"
import tippy from "tippy.js"
import "tippy.js/animations/scale-subtle.css"
import "tippy.js/dist/tippy.css"
import WebFont from "webfontloader"
import { ChartManager } from "./chart/ChartManager"
import { ContextMenuPopup } from "./gui/element/ContextMenu"
import { MenubarManager } from "./gui/element/MenubarManager"
import { UpdatePopup } from "./gui/popup/UpdatePopup"
import { DebugWidget } from "./gui/widget/DebugWidget"
import { WindowManager } from "./gui/window/WindowManager"
import { OverlayManager } from "./gui/overlay/OverlayManager"
import { ActionHistory } from "./util/ActionHistory"
import { BetterRoundedRect } from "./util/BetterRoundedRect"
import { EventHandler } from "./util/EventHandler"
import { Flags, loadFlags } from "./util/Flags"
import { Keybinds } from "./util/Keybinds"
import { Options } from "./util/Options"
import { ParityGenerator } from "./util/ParityGenerator"
import { fpsUpdate } from "./util/Performance"
import { isIFrame } from "./util/Util"
import { FileHandler } from "./util/file-handler/FileHandler"

declare global {
  interface Window {
    app: App
    Parity?: ParityGenerator
  }
  interface File {
    path?: string
  }
  interface HTMLInputElement {
    nwsaveas?: string
  }
}

interface Version {
  version: string
  type: string
  date: number
  downloads: {
    mac: string
    win: string
    linux: string
  }
  changelog: string[]
}

export class App {
  renderer: Renderer
  ticker: Ticker
  stage: Container
  view: HTMLCanvasElement
  chartManager: ChartManager
  windowManager: WindowManager
  overlayManager: OverlayManager
  menubarManager: MenubarManager
  actionHistory: ActionHistory

  private lastWidth = window.innerWidth
  private lastHeight = window.innerHeight

  constructor() {
    tippy.setDefaultProps({ duration: [200, 100], theme: "sm" })

    if (window.nw) {
      const activeWin = nw.Window.get()
      window.addEventListener("keydown", e => {
        if ((e.key == "r" && (e.metaKey || e.ctrlKey)) || e.key == "F5") {
          e.preventDefault()
          activeWin.reload()
        }
      })
      this.checkAppVersion()
    }

    Options.loadOptions()
    loadFlags()
    Keybinds.load(this)

    setInterval(() => Options.saveOptions(), 10000)
    if (Options.general.smoothAnimations)
      document.body.classList.add("animated")
    this.registerFonts()

    this.view = document.getElementById("pixi") as HTMLCanvasElement

    document.oncontextmenu = event => {
      event.preventDefault()
      if (!this.chartManager.loadedChart) return
      if (event.target != this.view) return
      ContextMenuPopup.open(this, event)
    }

    this.view.onmousedown = () => {
      ContextMenuPopup.close()
    }

    this.stage = new Container()
    this.stage.sortableChildren = true
    this.renderer = new Renderer({
      backgroundColor: 0x18191c,
      antialias: Options.performance.antialiasing,
      width: this.view.clientWidth,
      height: this.view.clientHeight,
      resolution: Options.performance.resolution,
      autoDensity: true,
      view: this.view,
      powerPreference: "low-power",
    })

    // This is just for using the pixijs chrome plugin
    // globalThis.__PIXI_STAGE__ = this.stage
    // globalThis.__PIXI_RENDERER__ = this.renderer

    this.ticker = new Ticker()
    this.ticker.maxFPS = 120
    this.ticker.add(() => {
      const startTime = performance.now()
      this.renderer.render(this.stage)
      DebugWidget.instance?.addFrameTimeValue(performance.now() - startTime)
      if (performance.memory?.usedJSHeapSize)
        DebugWidget.instance?.addMemoryTimeValue(
          performance.memory.usedJSHeapSize
        )
      fpsUpdate()
    }, UPDATE_PRIORITY.LOW)
    this.ticker.start()

    BetterRoundedRect.init(this.renderer)

    this.chartManager = new ChartManager(this)
    this.menubarManager = new MenubarManager(
      this,
      document.getElementById("menubar") as HTMLDivElement
    )
    this.windowManager = new WindowManager(
      this,
      document.getElementById("windows") as HTMLDivElement
    )
    this.overlayManager = new OverlayManager(
      this,
      document.getElementById("overlays") as HTMLDivElement
    )
    this.actionHistory = new ActionHistory(this)

    this.registerListeners()

    if (!Flags.hidePoweredByText && isIFrame()) {
      const embed = document.getElementById("embed") as HTMLDivElement
      embed.appendChild(document.createTextNode("Powered by "))
      const smLink = document.createElement("a")
      smLink.href = "https://tillvit.github.io/smeditor/"
      smLink.innerText = "SMEditor"
      smLink.target = "_blank"
      embed.appendChild(smLink)
      if (Flags.url != null) {
        embed.appendChild(document.createTextNode(" | Open this chart in a "))
        const newLink = document.createElement("a")
        const url = new URL(location.origin + "/smeditor/app/")
        newLink.innerText = "new tab"
        newLink.target = "_blank"
        url.searchParams.append("url", Flags.url)
        if (Flags.chartType !== null)
          url.searchParams.append("chartType", Flags.chartType)
        if (Flags.chartIndex !== null)
          url.searchParams.append("chartIndex", Flags.chartIndex + "")
        newLink.href = url.toString()
        embed.appendChild(newLink)
      }
    }

    FileHandler.initFileSystem().then(() => {
      // If this is their first time, show a tutorial,
      // otherwise, load a song

      const userId = localStorage.getItem("user_id")
      if (userId == null) {
        //TODO: Actually implement tutorial

        localStorage.setItem("user_id", "local-dev-user-id")
        // const tutorialOverlay = new TutorialOverlay()
        // this.overlayManager.openOverlay(tutorialOverlay)
        this.chartManager.loadSongFromAWS()
      } else {
        this.chartManager.loadSongFromAWS()
      }
      // if (notFirstTime == null)
      // {
      // }
      // else
      // {
      // }
      // this.windowManager.openWindow(new InitialWindow(this))
    })

    window.onbeforeunload = event => {
      if (ActionHistory.instance.isDirty() && Options.general.warnBeforeExit) {
        event.preventDefault()
        return (event.returnValue = "Are you sure you want to exit?")
      }
    }

    window.onunload = () => {
      Options.saveOptions()
    }
  }

  registerFonts() {
    BitmapFont.from(
      "Main",
      {
        fontFamily: "Assistant",
        fontSize: 20,
        fill: "white",
      },
      {
        chars: [
          ["a", "z"],
          ["A", "Z"],
          "!@#$%^&*()~{}[]:.-?=,_",
          "0123456789/",
          " ",
        ],
        resolution: window.devicePixelRatio,
      }
    )

    BitmapFont.from(
      "Fancy",
      {
        fontFamily: "Assistant",
        fontSize: 40,
        fontWeight: "700",
        fill: ["#dddddd", "#ffffff"],
        fillGradientType: TEXT_GRADIENT.LINEAR_VERTICAL,
        stroke: 0xaaaaaa,
        strokeThickness: 3,
      },
      {
        chars: [
          ["a", "z"],
          ["A", "Z"],
          "!@#$%^&*()~{}[]:.-?=,_",
          "0123456789/",
          " ",
        ],
        resolution: window.devicePixelRatio,
      }
    )
  }

  registerListeners() {
    window.addEventListener("keydown", function (e) {
      if (e.code == "Tab") {
        e.preventDefault()
      }
      if (e.code == "Enter") {
        if (e.target instanceof HTMLButtonElement) {
          e.preventDefault()
        }
      }
    })

    window.addEventListener("dragstart", function (e) {
      if (e.target instanceof HTMLImageElement) {
        e.preventDefault()
      }
    })

    setInterval(() => {
      const screenWidth = window.innerWidth
      const screenHeight =
        window.innerHeight - document.getElementById("menubar")!.clientHeight
      if (this.lastHeight != screenHeight || this.lastWidth != screenWidth) {
        this.lastHeight = screenHeight
        this.lastWidth = screenWidth
        this.onResize(screenWidth, screenHeight)
        EventHandler.emit("resize")
      }
    }, 100)

    window.addEventListener("dragover", event => {
      event.preventDefault()
      event.dataTransfer!.dropEffect = "copy"
    })
  }

  onResize(screenWidth: number, screenHeight: number) {
    this.renderer.screen.width = screenWidth
    this.renderer.screen.height = screenHeight
    this.view.width = screenWidth * this.renderer.resolution
    this.view.height = screenHeight * this.renderer.resolution
    this.view.style.width = `${screenWidth}px`
    this.view.style.height = `${screenHeight}px`
  }

  checkAppVersion() {
    if (!window.nw) return
    const gui = nw.require("nw.gui")

    const BUILD_TYPES: Record<string, number> = {
      stable: 3,
      beta: 2,
      alpha: 1,
      nightly: 0,
    }
    let os = "win"
    if (navigator.userAgent.includes("Mac")) os = "mac"
    else if (navigator.userAgent.includes("Linux")) os = "linux"
    fetch("/smeditor/assets/app/versions.json")
      .then(data => data.json())
      .then((versions: Version[]) => {
        versions = versions.sort((a, b) => {
          if (BUILD_TYPES[a.type] != BUILD_TYPES[b.type])
            return BUILD_TYPES[b.type] - BUILD_TYPES[a.type]
          return b.date - a.date
        })
        const version = versions[0]
        if (
          semver.lt(gui.App.manifest.version, version.version) &&
          localStorage.getItem("downloadedVersion") !== version.version
        ) {
          UpdatePopup.open(
            version.version,
            version.downloads[os as keyof Version["downloads"]]
          )
        }
      })
  }
}

document.querySelector("body")!.innerHTML = `<div id="popups"></div>
          <div id="view-wrapper"> 
            <div id="menubar"></div>
            <div id="waterfall"></div>
            <canvas id="pixi"></canvas>
          </div> 
          <div id="context-menu"></div>
          <div id="blocker" style="display: none"></div>
          <div id="windows"></div>
          <div id="overlays"></div>
          <div id="embed"></div>
        `

WebFont.load({
  custom: {
    families: ["Assistant"],
  },
  active: init,
  inactive: init,
  classes: false,
})

function init() {
  // Check WebGL
  const canvas = document.createElement("canvas")
  const gl = (canvas.getContext("webgl") ||
    canvas.getContext("experimental-webgl")) as WebGLRenderingContext

  if (!gl) {
    document.querySelector(
      "body"
    )!.innerHTML = `<div class='browser-unsupported'>
      <div class='browser-unsupported-item'>
      <h1>WebGL is not enabled</h1>
      <div>Please visit your browser settings and enable WebGL.</div>
      </div>
    </div>`
  } else {
    window.app = new App()
  }
}
