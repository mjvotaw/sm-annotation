import { App } from "../../App"
// import { NumberSpinner } from "../element/NumberSpinner"
import { WaterfallManager } from "../element/WaterfallManager"
import { ResizableWindow } from "./ResizableWindow"
import { basename, dirname } from "../../util/Path"
import { EventHandler } from "../../util/EventHandler"
import { FileHandler } from "../../util/file-handler/FileHandler"
import { WebFileHandler } from "../../util/file-handler/WebFileHandler"
import {
  Foot,
  WEIGHT_SHORT_NAMES,
  TECH_COUNTS,
  FEET_LABELS,
} from "../../util/ParityDataTypes"

export class ParityEditWindow extends ResizableWindow {
  app: App

  private innerContainer: HTMLDivElement
  private parityDisplayLabels: HTMLDivElement[] = []
  private parityOverrideSelects: HTMLSelectElement[] = []
  private parityImportContainer?: HTMLDivElement
  private parityImportTextarea?: HTMLTextAreaElement
  private parityDisplayContainer?: HTMLDivElement
  private techCountsDisplayContainer?: HTMLDivElement
  private nodeDisplayContainer?: HTMLDivElement

  // private parityWeightsContainer?: HTMLDivElement

  private currentWeights: { [key: string]: number }
  // private numberFields: { [key: string]: NumberSpinner } = {}

  constructor(app: App) {
    const posLeft = Math.min(
      window.innerWidth / 2 + 250,
      window.innerWidth - 370
    )

    super({
      title: "Edit Parity Data",
      width: 400,
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
    EventHandler.off("smLoaded", this.resetParity.bind(this))
    EventHandler.off("chartLoaded", this.resetParity.bind(this))
    EventHandler.off("chartModified", this.resetParity.bind(this))
    EventHandler.off("snapToTickChanged", this.updateDisplay.bind(this))
    EventHandler.off("parityUpdated", this.updateDisplay.bind(this))
  }

  // View building

  initView(): void {
    this.viewElement.replaceChildren()
    this.viewElement.classList.add("parity-data")
    this.innerContainer.classList.add("padding")

    this.addParityDisplay()
    this.addTechCountsDisplay()
    this.addNodeDisplay()
    // this.addWeightEditor()
    this.addParityImport()
    this.addFooterButtons()

    this.viewElement.appendChild(this.innerContainer)
    this.resetParity()
    this.updateDisplay()
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
      receptorPanel.classList.add("receptor", columnNames[i % 4])
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

  addNodeDisplay() {
    const container = document.createElement("div")

    container.classList.add("parity-node-display")

    const nodesLabel = document.createElement("div")
    nodesLabel.classList.add("nodes-label")
    nodesLabel.innerText = "Nodes:"

    this.innerContainer.appendChild(nodesLabel)
    this.nodeDisplayContainer = container

    this.innerContainer.appendChild(this.nodeDisplayContainer)
  }

  addTechCountsDisplay() {
    const container = document.createElement("div")
    const label = document.createElement("div")
    label.innerText = "Tech Counts:"
    this.techCountsDisplayContainer = container
    this.innerContainer.appendChild(label)
    this.innerContainer.appendChild(this.techCountsDisplayContainer)
  }
  addFooterButtons() {
    const footer = document.createElement("div")
    footer.classList.add("footer")

    // const showHideWeights = document.createElement("button")
    // showHideWeights.innerText = "Show/Hide Weights"
    // showHideWeights.onclick = () => {
    //   this.parityWeightsContainer?.classList.toggle("hidden")
    //   this.parityDisplayContainer?.classList.toggle("hidden")
    // }
    // footer.appendChild(showHideWeights)

    const resetButton = document.createElement("button")
    resetButton.innerText = "Reset All Overrides"
    resetButton.onclick = () => {
      window.Parity?.resetBeatOverrides()
      this.resetParity()
    }
    footer.appendChild(resetButton)

    // const importButton = document.createElement("button")
    // importButton.innerText = "Import Parity Data"
    // importButton.onclick = () => {
    //   this.openParityImport()
    // }
    // footer.appendChild(importButton)

    // const saveButton = document.createElement("button")
    // saveButton.innerText = "Save Parity Data"
    // saveButton.onclick = () => {
    //   this.saveParity()
    // }
    // footer.appendChild(saveButton)

    // const saveNodesButton = document.createElement("button")
    // saveNodesButton.innerText = "Save Node Data"
    // saveNodesButton.onclick = () => {
    //   this.saveDataForMike()
    // }
    // footer.appendChild(saveNodesButton)

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

  // addWeightEditor() {
  //   const weightContainer = document.createElement("div")
  //   weightContainer.classList.add("parity-weights-container", "hidden")

  //   const weightKeys = Object.keys(this.currentWeights)
  //   weightKeys.forEach(title => {
  //     const weightLine = document.createElement("div")
  //     weightLine.classList.add("parity-weight")
  //     const label = document.createElement("div")
  //     label.classList.add("label")
  //     label.innerText = title

  //     const item = NumberSpinner.create(this.currentWeights[title], 10, 0)
  //     item.onChange = value => {
  //       this.currentWeights[title] = value || this.currentWeights[title]
  //       this.updateParityWeights()
  //     }
  //     weightLine.appendChild(label)
  //     weightLine.appendChild(item.view)
  //     weightContainer.appendChild(weightLine)
  //     this.numberFields[title] = item
  //   })
  //   this.parityWeightsContainer = weightContainer
  //   this.innerContainer.appendChild(weightContainer)
  // }
  // Event handling

  setupEventHandlers() {
    const reloadParity = () => {
      this.resetParity()
    }

    EventHandler.on("smLoaded", this.resetParity.bind(this))
    EventHandler.on("chartLoaded", this.resetParity.bind(this))
    EventHandler.on("chartModified", this.resetParity.bind(this))

    const updateDisplay = () => {
      this.updateDisplay()
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

  updateDisplay() {
    if (this.app.chartManager == undefined || window.Parity == undefined) {
      return
    }
    const beat = this.app.chartManager?.getBeat()
    const parity = window.Parity?.getParityForBeat(beat)
    const overrides = window.Parity?.getBeatOverride(beat)

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

    this.updateTechCounts()
    this.updateNodes()
  }

  updateTechCounts() {
    const techCounts = window.Parity?.lastTechCounts ?? []
    const techCountsStringParts: string[] = []
    for (let i = 0; i < TECH_COUNTS.length; i++) {
      const tc = techCounts[i] ?? 0
      techCountsStringParts.push(`${TECH_COUNTS[i]}: ${tc}`)
    }

    if (this.techCountsDisplayContainer) {
      this.techCountsDisplayContainer.innerHTML =
        techCountsStringParts.join(" ")
    }
  }

  updateNodes() {
    const beat = this.app.chartManager?.getBeat()
    const nodes = window.Parity?.getAllNodesForBeat(beat)
    const selectedStates = window.Parity?.lastSelectedStates ?? []
    const selectedStateIds = selectedStates.map(s => s.idx)
    // this is a whole bunch of code for displaying all of the nodes for a given row,
    // and the weights that make up the costs for each parent node.

    const nodeDisplay = this.nodeDisplayContainer
    if (nodes && nodeDisplay) {
      const nodesLabel = this.innerContainer.querySelector(".nodes-label")
      if (nodesLabel) {
        nodesLabel.innerHTML = `Nodes (${nodes.length}):`
      }
      nodeDisplay.textContent = ""

      nodes.forEach(node => {
        if (node.ancestors.size == 0) {
          return
        }
        const isSelected = selectedStateIds.includes(node.state.idx)

        const parityStr = node.state.combinedColumns
          .map(f => FEET_LABELS[f])
          .join("")

        const nodeCostDiv = document.createElement("div")
        nodeCostDiv.classList.add("hidden")

        let allCosts = 0
        let costCount = 0
        let selectedParentCost = -1

        for (const [parent_id, cost] of node.ancestors.entries()) {
          const isParentSelected = selectedStateIds.includes(parent_id)
          allCosts += cost["TOTAL"]
          costCount += 1
          const costElem = document.createElement("div")
          costElem.classList.add("parity-node-cost-item")
          if (isParentSelected) {
            selectedParentCost = Math.round(cost["TOTAL"])
            costElem.classList.add("selected")
          }
          const costParentId = document.createElement("div")
          costParentId.innerText = `${parent_id}:: `
          costElem.appendChild(costParentId)
          for (const costName in cost) {
            if (costName == "OVERRIDE") {
              continue
            }
            const shortName = WEIGHT_SHORT_NAMES[costName]
            const costSpan = document.createElement("div")
            costSpan.classList.add("parity-node-cost-inner-item")

            costSpan.setAttribute("title", costName)
            costSpan.innerHTML = `<div>${shortName}</div><div>${Math.round(
              cost[costName]
            )}</div>`
            costElem.appendChild(costSpan)
          }
          nodeCostDiv.appendChild(costElem)
        }

        const nodeText = `${node.id}: ${parityStr} cost: ${selectedParentCost}`

        const nodeDiv = document.createElement("div")
        nodeDiv.classList.add("parity-node-display-item")
        if (isSelected) {
          nodeDiv.classList.add("parity-node-display-item-selected")
        }
        const nodeTextDiv = document.createElement("div")
        nodeTextDiv.classList.add("parity-node-cost-avg")
        nodeTextDiv.innerText = nodeText

        nodeTextDiv.addEventListener("click", () => {
          nodeCostDiv.classList.toggle("hidden")
        })

        nodeDiv.appendChild(nodeTextDiv)
        nodeDiv.appendChild(nodeCostDiv)
        nodeDisplay.appendChild(nodeDiv)
      })
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

  async saveDataForMike() {
    if (window.Parity?.lastGraph == undefined) {
      return
    }

    const minimalNodes = window.Parity.lastGraph.toSerializableMinimalNodes()
    const selectedNodes = window.Parity.lastGraph.computeCheapestPath()
    const overrides = window.Parity.getOverridesByRow()

    const dataToSave = {
      nodes: minimalNodes,
      selectedNodes: selectedNodes,
      overrides: overrides,
    }
    const dataJson = JSON.stringify(dataToSave)
    const error = await this.saveJsonData(dataJson, "node-data")
    if (error == null) {
      WaterfallManager.create("Saved Node Data")
    } else {
      WaterfallManager.createFormatted("Failed to save file: " + error, "error")
    }
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
