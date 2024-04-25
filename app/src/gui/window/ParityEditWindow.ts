import { App } from "../../App"
import { NumberSpinner } from "../element/NumberSpinner"
import { WaterfallManager } from "../element/WaterfallManager"
import { Window } from "./Window"
import { basename, dirname } from "../../util/Path"
import { EventHandler } from "../../util/EventHandler"
import { FileHandler } from "../../util/file-handler/FileHandler"
import { WebFileHandler } from "../../util/file-handler/WebFileHandler"
import { Foot } from "../../util/ParityGenerator"

export class ParityEditWindow extends Window {
  app: App

  private innerContainer: HTMLDivElement
  private parityDisplayLabels: HTMLDivElement[] = []
  private parityOverrideSelects: HTMLSelectElement[] = []
  private parityImportContainer?: HTMLDivElement
  private parityImportTextarea?: HTMLTextAreaElement
  private parityDisplayContainer?: HTMLDivElement
  private parityWeightsContainer?: HTMLDivElement

  private currentWeights: { [key: string]: number }
  private numberFields: { [key: string]: NumberSpinner } = {}

  constructor(app: App) {
    const posLeft = Math.min(
      window.innerWidth / 2 + 250,
      window.innerWidth - 370
    )

    super({
      title: "Edit Parity Data",
      width: 370,
      height: 420,
      left: posLeft,
      disableClose: false,
      win_id: "parity_stuff",
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
  }

  // View building

  initView(): void {
    this.viewElement.replaceChildren()
    this.viewElement.classList.add("parity-data")
    this.innerContainer.classList.add("padding")

    this.addParityDisplay()
    this.addWeightEditor()
    this.addParityImport()
    this.addFooterButtons()

    this.viewElement.appendChild(this.innerContainer)
    this.resetParity()
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

    container.appendChild(receptorContainer)

    const displayLabel = document.createElement("div")
    displayLabel.innerText = "Current Parity:"
    container.appendChild(displayLabel)
    container.appendChild(displayContainer)

    const overrideLabel = document.createElement("div")
    overrideLabel.innerText = "Overrides:"

    container.appendChild(overrideLabel)
    container.appendChild(overridesContainer)

    this.innerContainer.appendChild(container)
    this.parityDisplayContainer = container
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

  addFooterButtons() {
    const footer = document.createElement("div")
    footer.classList.add("footer")

    const showHideWeights = document.createElement("button")
    showHideWeights.innerText = "Show/Hide Weights"
    showHideWeights.onclick = () => {
      this.parityWeightsContainer?.classList.toggle("hidden")
      this.parityDisplayContainer?.classList.toggle("hidden")
    }
    footer.appendChild(showHideWeights)

    const resetButton = document.createElement("button")
    resetButton.innerText = "Reset All Overrides"
    resetButton.onclick = () => {
      window.Parity?.resetBeatOverrides()
      this.resetParity()
    }
    footer.appendChild(resetButton)

    const importButton = document.createElement("button")
    importButton.innerText = "Import Parity Data"
    importButton.onclick = () => {
      this.openParityImport()
    }
    footer.appendChild(importButton)

    const saveButton = document.createElement("button")
    saveButton.innerText = "Save Parity Report"
    saveButton.onclick = () => {
      this.saveParityReport()
    }
    footer.appendChild(saveButton)

    this.innerContainer.appendChild(footer)
  }

  addParityImport() {
    const importContainer = document.createElement("div")
    importContainer.classList.add("import-parity-container")
    importContainer.classList.add("hidden")

    const label = document.createElement("p")
    label.innerText = "Import Parity Data"
    importContainer.appendChild(label)

    const importTextarea = document.createElement("textarea")
    importTextarea.placeholder = "Paste parity JSON data here"
    importContainer.appendChild(importTextarea)

    const buttonContainer = document.createElement("div")
    buttonContainer.classList.add("import-buttons")

    const importButton = document.createElement("button")
    importButton.innerText = "Import"
    importButton.onclick = () => {
      this.importParity()
    }

    const cancelButton = document.createElement("button")
    cancelButton.innerText = "Close"
    cancelButton.onclick = () => {
      this.closeParityImport()
    }

    buttonContainer.appendChild(importButton)
    buttonContainer.appendChild(cancelButton)
    importContainer.appendChild(buttonContainer)
    this.parityImportContainer = importContainer
    this.parityImportTextarea = importTextarea
    this.innerContainer.appendChild(importContainer)
  }

  addWeightEditor() {
    const weightContainer = document.createElement("div")
    weightContainer.classList.add("parity-weights-container", "hidden")

    const weightKeys = Object.keys(this.currentWeights)
    weightKeys.forEach(title => {
      const weightLine = document.createElement("div")
      weightLine.classList.add("parity-weight")
      const label = document.createElement("div")
      label.classList.add("label")
      label.innerText = title

      const item = NumberSpinner.create(this.currentWeights[title], 10, 0)
      item.onChange = value => {
        this.currentWeights[title] = value || this.currentWeights[title]
        this.updateParityWeights()
      }
      weightLine.appendChild(label)
      weightLine.appendChild(item.view)
      weightContainer.appendChild(weightLine)
      this.numberFields[title] = item
    })
    this.parityWeightsContainer = weightContainer
    this.innerContainer.appendChild(weightContainer)
  }
  // Event handling

  setupEventHandlers() {
    const reloadParity = () => {
      this.resetParity()
    }

    EventHandler.on("smLoaded", reloadParity)
    EventHandler.on("chartLoaded", reloadParity)
    EventHandler.on("chartModified", reloadParity)

    const updateDisplay = () => {
      this.updateParityDisplay()
    }
    EventHandler.on("snapToTickChanged", updateDisplay)
    EventHandler.on("parityUpdated", updateDisplay)

    this.windowElement.addEventListener("closingWindow", function () {
      EventHandler.off("smLoaded", reloadParity)
      EventHandler.off("chartLoaded", reloadParity)
      EventHandler.off("chartModified", reloadParity)
      EventHandler.off("snapToTickChanged", updateDisplay)
      EventHandler.off("parityUpdated", updateDisplay)
    })
  }

  updateParityDisplay() {
    console.log("updateParityDisplay")
    if (this.app.chartManager == undefined || window.Parity == undefined) {
      return
    }
    const beat = this.app.chartManager?.getBeat()
    const parity = window.Parity?.getParityForBeat(beat)
    const overrides = window.Parity?.getRowOverride(beat)

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
      }
      for (const l of this.parityDisplayLabels) {
        l.innerText = "None"
      }
    } else {
      for (let i = 0; i < parity.length; i++) {
        this.parityDisplayLabels[i].innerText = optionLabels[parity[i]]
        this.parityDisplayLabels[i].classList.remove(...optionTextColors)
        this.parityDisplayLabels[i].classList.add(optionTextColors[parity[i]])

        this.parityOverrideSelects[i].value = `${overrides[i]}`
        this.parityOverrideSelects[i].disabled = parity[i] == Foot.NONE
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
      window.Parity?.addNoteOverride(beat, column, parity)
      window.Parity?.analyze()
    }
  }

  resetParity() {
    window.Parity?.resetBeatOverrides()
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
    const smPath = this.app.chartManager.smPath
    const difficulty =
      this.app.chartManager.loadedChart?.difficulty || "No Difficulty"

    const dir = dirname(smPath)
    const fileName = basename(dir)

    const jsonFilename = `${fileName}-${difficulty}-parity.json`
    const jsonPath = dir + "/" + jsonFilename

    console.log(`saving parity data to  ${jsonPath}`)

    let error: string | null = null
    if (await FileHandler.getFileHandle(jsonPath, { create: true })) {
      await FileHandler.writeFile(jsonPath, parityJson).catch(err => {
        const message = err.message
        error = message
      })

      const blob = new Blob([parityJson], { type: "application/json" })
      ;(FileHandler.getStandardHandler() as WebFileHandler).saveBlob(
        blob,
        jsonFilename
      )
    }

    if (error == null) {
      WaterfallManager.create("Exported Parity Data")
    } else {
      WaterfallManager.createFormatted("Failed to save file: " + error, "error")
    }
  }

  async saveParityReport() {
    if (window.Parity == undefined) {
      return
    }
    const parityJson = window.Parity.generateParityReport()
    const smPath = this.app.chartManager.smPath
    const difficulty =
      this.app.chartManager.loadedChart?.difficulty || "No Difficulty"

    const dir = dirname(smPath)
    const fileName = basename(dir)

    const jsonFilename = `${fileName}-${difficulty}-parity-report.json`
    const jsonPath = dir + "/" + jsonFilename

    console.log(`saving parity data to  ${jsonPath}`)

    let error: string | null = null
    if (await FileHandler.getFileHandle(jsonPath, { create: true })) {
      await FileHandler.writeFile(jsonPath, parityJson).catch(err => {
        const message = err.message
        error = message
      })

      const blob = new Blob([parityJson], { type: "application/json" })
      ;(FileHandler.getStandardHandler() as WebFileHandler).saveBlob(
        blob,
        jsonFilename
      )
    }

    if (error == null) {
      WaterfallManager.create("Saved Parity Report")
    } else {
      WaterfallManager.createFormatted("Failed to save file: " + error, "error")
    }
  }
}
