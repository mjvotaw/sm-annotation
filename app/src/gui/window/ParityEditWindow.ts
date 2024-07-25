import { App } from "../../App"
import { WaterfallManager } from "../element/WaterfallManager"
import { Window } from "./Window"
import { basename, dirname } from "../../util/Path"
import { EventHandler } from "../../util/EventHandler"
import { FileHandler } from "../../util/file-handler/FileHandler"
import { WebFileHandler } from "../../util/file-handler/WebFileHandler"
import { Foot } from "../../util/ParityDataTypes"
import { AnnotationData, saveAnnotation } from "../../util/AWS"

export class ParityEditWindow extends Window {
  app: App

  private innerContainer: HTMLDivElement
  private parityDisplayLabels: HTMLDivElement[] = []
  private parityOverrideSelects: HTMLSelectElement[] = []
  private parityImportContainer?: HTMLDivElement
  private parityImportTextarea?: HTMLTextAreaElement
  private parityDisplayContainer?: HTMLDivElement

  private currentWeights: { [key: string]: number }

  constructor(app: App) {
    const posLeft = Math.min(
      window.innerWidth / 2 + 250,
      window.innerWidth - 370
    )

    super({
      title: "Edit Foot Placements",
      width: 370,
      height: 300,
      left: posLeft,
      disableClose: true,
      win_id: "edit_parity_window",
      blocking: false,
    })

    this.app = app
    window.Parity?.setEnabled(true)
    this.currentWeights = window.Parity!.getWeights()
    this.innerContainer = document.createElement("div")

    this.initView()
    this.setupEventHandlers()
  }

  onClose() {
    window.Parity?.setEnabled(false)
    this.windowElement.dispatchEvent(new Event("closingWindow"))
    EventHandler.off("snapToTickChanged", this.updateParityDisplay.bind(this))
    EventHandler.off("parityUpdated", this.updateParityDisplay.bind(this))
  }

  // View building

  initView(): void {
    this.viewElement.replaceChildren()
    this.viewElement.classList.add("parity-data")
    this.innerContainer.classList.add("padding")

    this.addParityDisplay()
    this.addFooterButtons()

    this.viewElement.appendChild(this.innerContainer)
    this.parityDisplayContainer = document.createElement("div")
    this.updateParityDisplay()
  }

  addParityDisplay() {
    const numCols = this.app.chartManager?.loadedChart?.gameType.numCols || 0

    const container = document.createElement("div")
    container.classList.add("parity-display-container")

    const receptorContainer = document.createElement("div")
    receptorContainer.classList.add("receptor-display")

    const displayContainer = document.createElement("div")
    displayContainer.classList.add("parity-display")

    const overridesContainer = document.createElement("div")
    overridesContainer.classList.add("parity-display")

    const columnNames = ["left", "down", "up", "right"]

    for (let i = 0; i < numCols; i++) {
      const receptorPanel = document.createElement("div")
      receptorPanel.classList.add("receptor", columnNames[i])
      receptorContainer.appendChild(receptorPanel)
      // Create space for displaying current parity selections

      const displayPanel = document.createElement("div")
      displayPanel.classList.add("parity-display-panel")
      displayPanel.innerText = "None"

      displayContainer.appendChild(displayPanel)
      this.parityDisplayLabels.push(displayPanel)

      // Create selects
      const panel = document.createElement("div")
      panel.classList.add("parity-display-panel")

      const selector = this.createParitySelector()
      selector.setAttribute("data-column", `${i}`)
      selector.addEventListener(
        "change",
        this.handleParityOverrideChange.bind(this)
      )

      panel.appendChild(selector)

      overridesContainer.appendChild(panel)
      this.parityOverrideSelects.push(selector)
    }

    const displayLabel = document.createElement("div")
    displayLabel.innerText = "Current Foot Placements:"
    container.appendChild(displayLabel)

    container.appendChild(receptorContainer)
    container.appendChild(displayContainer)

    const overrideLabel = document.createElement("div")
    overrideLabel.innerText = "Corrections:"

    container.appendChild(overrideLabel)
    container.appendChild(overridesContainer)

    this.parityDisplayContainer = container
    this.innerContainer.appendChild(this.parityDisplayContainer)
  }

  createParitySelector(): HTMLSelectElement {
    const selector = document.createElement("select")
    selector.size = 5
    const optionLabels = [
      "None",
      "Left Heel",
      "Left Toe",
      "Right Heel",
      "Right Toe",
    ]

    const optionClasses = [
      "parity-None",
      "parity-LeftHeel",
      "parity-LeftToe",
      "parity-RightHeel",
      "parity-RightToe",
    ]

    for (let i = 0; i < optionLabels.length; i++) {
      const option = document.createElement("option")
      option.value = `${i}`
      option.innerText = optionLabels[i]
      option.classList.add(optionClasses[i])
      selector.appendChild(option)
    }
    return selector
  }

  updateParitySelectorOptions(
    selector: HTMLSelectElement,
    disableToes: boolean,
    disableHeels: boolean
  ) {
    // If There's only one note present at the current beat, we don't want users
    // to select left/right toe, so hide those options, and rename left/right heel
    // to just "left foot" and "right foot"
    if (disableToes) {
      selector.children.item(2)?.setAttribute("disabled", "disabled")
      selector.children.item(2)?.classList.add("hidden")
      selector.children.item(4)?.setAttribute("disabled", "disabled")
      selector.children.item(4)?.classList.add("hidden")

      selector.children.item(1)!.innerHTML = "Left Foot"
      selector.children.item(3)!.innerHTML = "Right Foot"
    } else {
      selector.children.item(2)?.removeAttribute("disabled")
      selector.children.item(2)?.classList.remove("hidden")
      selector.children.item(4)?.removeAttribute("disabled")
      selector.children.item(4)?.classList.remove("hidden")

      selector.children.item(1)!.innerHTML = "Left Heel"
      selector.children.item(3)!.innerHTML = "Right Heel"
    }

    // And if we want to hide the heels as well? Then hide them
    if (disableHeels) {
      selector.children.item(1)?.setAttribute("disabled", "disabled")
      selector.children.item(1)?.classList.add("hidden")
      selector.children.item(3)?.setAttribute("disabled", "disabled")
      selector.children.item(3)?.classList.add("hidden")
    } else {
      selector.children.item(1)?.removeAttribute("disabled")
      selector.children.item(1)?.classList.remove("hidden")
      selector.children.item(3)?.removeAttribute("disabled")
      selector.children.item(3)?.classList.remove("hidden")
    }
  }

  addFooterButtons() {
    const footer = document.createElement("div")
    footer.classList.add("footer")

    const resetButton = document.createElement("button")
    resetButton.innerText = "Reset All Corrections"
    resetButton.onclick = () => {
      window.Parity?.resetBeatOverrides()
      window.Parity?.analyze()
    }
    footer.appendChild(resetButton)

    const saveNodesButton = document.createElement("button")
    saveNodesButton.innerText = "Save Foot Placements"
    saveNodesButton.onclick = () => {
      this.saveDataForMike()
    }
    footer.appendChild(saveNodesButton)

    this.innerContainer.appendChild(footer)
  }

  // Event handling

  setupEventHandlers() {
    EventHandler.on("snapToTickChanged", this.updateParityDisplay.bind(this))
    EventHandler.on("parityUpdated", this.updateParityDisplay.bind(this))
  }

  updateParityDisplay() {
    if (this.app.chartManager == undefined || window.Parity == undefined) {
      return
    }
    const beat = this.app.chartManager?.getBeat()
    const parity = window.Parity?.getParityForBeat(beat)
    const overrides = window.Parity?.getOverridesAtBeat(beat)
    // How many notes are present on this beat? (how many items in parity have a parity other that NONE?)
    const activeNoteCount =
      parity == undefined ? 0 : parity.filter(p => p != Foot.NONE).length
    const optionLabels = [
      "None",
      "Left Heel",
      "Left Toe",
      "Right Heel",
      "Right Toe",
    ]
    const optionTextColors = [
      "text-parity-None",
      "text-parity-LeftHeel",
      "text-parity-LeftToe",
      "text-parity-RightHeel",
      "text-parity-RightToe",
    ]

    if (parity == undefined) {
      // no notes on this beat, disable everything
      for (let i = 0; i < this.parityDisplayLabels.length; i++) {
        this.parityDisplayLabels[i].innerText = "None"
        this.parityDisplayLabels[i].classList.remove(...optionTextColors)
        this.parityDisplayLabels[i].classList.add(optionTextColors[0])

        this.parityOverrideSelects[i].value = "0"
        this.parityOverrideSelects[i].disabled = true
        this.updateParitySelectorOptions(
          this.parityOverrideSelects[i],
          true,
          true
        )
      }
      for (const l of this.parityDisplayLabels) {
        l.innerText = "None"
      }
    } else {
      // if there's only one note, we only show the user left/right foot options, so replace
      // left/right heel text
      if (activeNoteCount == 1) {
        optionLabels[1] = "Left Foot"
        optionLabels[3] = "Right Foot"
      }
      for (let i = 0; i < parity.length; i++) {
        this.parityDisplayLabels[i].innerText = optionLabels[parity[i]]
        this.parityDisplayLabels[i].classList.remove(...optionTextColors)
        this.parityDisplayLabels[i].classList.add(optionTextColors[parity[i]])
        this.parityOverrideSelects[i].value = `${overrides[i]}`
        this.parityOverrideSelects[i].disabled = parity[i] == Foot.NONE
        if (parity[i] == Foot.NONE) {
          this.updateParitySelectorOptions(
            this.parityOverrideSelects[i],
            true,
            true
          )
        } else {
          this.updateParitySelectorOptions(
            this.parityOverrideSelects[i],
            activeNoteCount == 1,
            false
          )
        }
      }
    }
  }

  handleParityOverrideChange(e: Event) {
    if (e.target instanceof HTMLSelectElement) {
      const selector: HTMLSelectElement = e.target
      const columnStr = selector.getAttribute("data-column")
      if (columnStr == null) {
        return
      }
      const column = parseInt(columnStr)
      const parity = parseInt(selector.value)
      const beat = this.app.chartManager?.getBeat()
      window.Parity?.updateNoteOverride(beat, column, parity)
    }
  }

  resetParity() {
    window.Parity?.clearState()
    window.Parity?.analyze()
  }

  updateParityWeights() {
    window.Parity?.updateWeights(this.currentWeights)
    window.Parity?.analyze()
  }

  importParity() {
    const jsonStr = this.parityImportTextarea?.value
    if (jsonStr) {
      if (window.Parity?.loadParityData(jsonStr)) {
        WaterfallManager.create("Imported Parity Data")
      } else {
        WaterfallManager.createFormatted(
          "Failed to import parity data. You probably messed up your JSON or something.",
          "error"
        )
      }
    }
  }

  openParityImport() {
    this.parityImportContainer?.classList.remove("hidden")
  }

  closeParityImport() {
    if (this.parityImportTextarea != undefined) {
      this.parityImportTextarea.value = ""
      this.parityImportContainer?.classList.add("hidden")
    }
  }

  async saveParity() {
    if (window.Parity == undefined) {
      return
    }
    const parityJson = window.Parity.serializeParityData(true)
    const error = await this.saveJsonData(parityJson, "parity")
    if (error == null) {
      WaterfallManager.create("Exported Parity Data")
    } else {
      WaterfallManager.createFormatted("Failed to save file: " + error, "error")
    }
  }

  async saveStephGraph() {
    if (window.Parity == undefined) {
      return
    }
    const parityJson = window.Parity.serializeStepGraph()
    const error = await this.saveJsonData(parityJson, "step-graph")

    if (error == null) {
      WaterfallManager.create("Saved Step Graph")
    } else {
      WaterfallManager.createFormatted("Failed to save file: " + error, "error")
    }
  }

  private isSavingData: boolean = false

  async saveDataForMike() {
    if (this.isSavingData) {
      return
    }

    if (window.Parity?.lastGraph == undefined) {
      return
    }

    const selectedNodes = window.Parity.lastGraph.computeCheapestPath()
    const overrides = window.Parity.getOverridesByRow()

    const dataToSave: AnnotationData = {
      selected_nodes: selectedNodes,
      overrides: overrides,
      parities: window.Parity.lastParities,
    }

    const userId = localStorage.getItem("user_id")
    const songId = this.app.chartManager.loadedChartAWSInfo?.song_id ?? null
    console.log(
      `user_id: ${userId}, song_id: ${songId}, dataToSave:`,
      dataToSave
    )
    if (userId == null || songId == null) {
      return
    }
    this.isSavingData = true
    try {
      const success = await saveAnnotation(userId, songId, dataToSave)
      if (success) {
        WaterfallManager.create("Saved Annotation Data")
      } else {
        WaterfallManager.create("Failed to save Annotatoin Data :C")
      }
    } catch (err) {
      console.log("error saving data:", err)
    }
    this.isSavingData = false
  }

  async saveJsonData(data: string, fileSuffix: string): Promise<string | null> {
    const smPath = this.app.chartManager.smPath
    const difficulty =
      this.app.chartManager.loadedChart?.difficulty || "No Difficulty"

    const dir = dirname(smPath)
    const fileName = basename(dir)

    const jsonFilename = `${fileName}-${difficulty}-${fileSuffix}.json`
    const jsonPath = dir + "/" + jsonFilename

    console.log(`saving data to  ${jsonPath}`)

    let error: string | null = null
    if (await FileHandler.getFileHandle(jsonPath, { create: true })) {
      await FileHandler.writeFile(jsonPath, data).catch(err => {
        const message = err.message
        error = message
      })

      const blob = new Blob([data], { type: "application/json" })
      ;(FileHandler.getStandardHandler() as WebFileHandler).saveBlob(
        blob,
        jsonFilename
      )
    }

    return error
  }
}
