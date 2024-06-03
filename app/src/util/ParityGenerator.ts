// Generates foot parity given notedata
// Original algorithm by Jewel, polished by tillvit

import { App } from "../App"
import { EventHandler } from "./EventHandler"
import { LAYOUT } from "./StageLayouts"

import {
  Foot,
  State,
  StepParityGraph,
  StepParityNode,
  BeatOverrides,
} from "./ParityDataTypes"
import { ParityGenInternal } from "./ParityGenInternals"
import { ActionHistory } from "./ActionHistory"

export class ParityGenerator {
  private readonly app
  private layout
  private parityGenInternal: ParityGenInternal
  private isEnabled: boolean = false

  beatOverrides: BeatOverrides
  lastGraph?: StepParityGraph
  lastStates?: State[]
  lastParities: Foot[][] = []

  private DEFAULT_WEIGHTS: { [key: string]: number } = {
    DOUBLESTEP: 850,
    BRACKETJACK: 20,
    JACK: 30,
    JUMP: 30,
    BRACKETTAP: 400,
    HOLDSWITCH: 55,
    MINE: 10000,
    FOOTSWITCH: 5000,
    MISSED_FOOTSWITCH: 500,
    FACING: 2,
    DISTANCE: 6,
    SPIN: 1000,
    SIDESWITCH: 130,
    BADBRACKET: 40,
    OTHER: 0,
  }

  private WEIGHTS: { [key: string]: number } = {
    DOUBLESTEP: 850,
    BRACKETJACK: 20,
    JACK: 30,
    JUMP: 30,
    BRACKETTAP: 400,
    HOLDSWITCH: 55,
    MINE: 10000,
    FOOTSWITCH: 5000,
    MISSED_FOOTSWITCH: 500,
    FACING: 2,
    DISTANCE: 6,
    SPIN: 1000,
    SIDESWITCH: 130,
    BADBRACKET: 40,
    OTHER: 0,
  }

  constructor(app: App, type: string) {
    this.app = app
    this.layout = LAYOUT[type]
    this.beatOverrides = new BeatOverrides(this.layout.columnCount)
    this.parityGenInternal = new ParityGenInternal(type)
  }

  help() {
    console.log(`Currently only compatible with dance-single.
Available commands: 
analyze(): analyze the current chart
  
clear(): clear parity highlights`)
  }

  private isAnalyzing: boolean = false
  analyze() {
    if (this.isAnalyzing) {
      return
    }
    const notedata = this.app.chartManager.loadedChart?.getNotedata()
    if (!notedata) return
    this.isAnalyzing = true
    const { graph, selectedStates, parities } = this.parityGenInternal.analyze(
      notedata,
      this.beatOverrides,
      this.WEIGHTS,
      this.lastGraph
    )
    this.lastGraph = graph
    this.lastStates = selectedStates
    this.lastParities = parities

    this.isAnalyzing = false
    EventHandler.emit("parityUpdated")
  }

  setEnabled(enabled: boolean) {
    this.isEnabled = enabled
  }

  getIsEnabled(): boolean {
    return this.isEnabled
  }

  clearState() {
    this.lastGraph = undefined
    this.lastStates = undefined
    this.lastParities = []
    this.beatOverrides = new BeatOverrides(this.layout.columnCount)
  }

  //
  // Methods for checking/setting overrides
  //

  hasOverrideAtBeat(beat: number): boolean {
    return this.beatOverrides.hasOverrideAtBeat(beat)
  }

  getOverridesAtBeat(beat: number): Foot[] {
    return this.beatOverrides.getOverridesAtBeat(beat)
  }

  getNoteOverride(beat: number, col: number): Foot {
    return this.beatOverrides.getNoteOverride(beat, col)
  }

  updateNoteOverride(beat: number, col: number, foot: Foot) {
    if (!this.isNoteOverrideValid(beat, col, foot)) {
      EventHandler.emit("parityUpdated")
      return
    }
    const previousOverride = this.getNoteOverride(beat, col)

    ActionHistory.instance.run({
      action: () => {
        this.beatOverrides.setNoteOverride(beat, col, foot)
        this.analyze()
      },
      undo: () => {
        this.beatOverrides.setNoteOverride(beat, col, previousOverride)
        this.analyze()
      },
    })
  }

  resetBeatOverrides() {
    const previousOverrides = this.beatOverrides.getBeatOverrides()

    ActionHistory.instance.run({
      action: () => {
        this.beatOverrides.setBeatOverrides({})
        this.analyze()
      },
      undo: () => {
        this.beatOverrides.setBeatOverrides(previousOverrides)
        this.analyze()
      },
    })
  }

  // Does setting this foot for the given column create
  // a foot placement that is valid?
  // First checks if setting this override would create
  // a definitely invalid foot placement
  // Then, checks to make sure there's at least one state
  // for the given beat with the given foot at the given column
  isNoteOverrideValid(beat: number, col: number, foot: Foot): boolean {
    // If foot == Foot.NONE, then that means we're clearing this override,
    // which is always a valid thing to do
    if (foot == Foot.NONE) {
      return true
    }
    if (!this.beatOverrides.isNoteOverrideValid(beat, col, foot)) {
      return false
    }

    const possibleStates = this.lastGraph!.getStatesForBeat(beat)

    let atLeastOneValidState = false
    for (const state of possibleStates) {
      if (state.combinedColumns[col] == foot) {
        atLeastOneValidState = true
        break
      }
    }

    return atLeastOneValidState
  }

  //
  // Retrieving various data by beat/row
  //

  getParityForBeat(beat: number): Foot[] | undefined {
    if (this.lastStates == undefined) {
      return undefined
    }
    for (const state of this.lastStates) {
      if (Math.abs(state.beat - beat) < 0.0001) {
        return state.columns
      }
      if (state.beat > beat) {
        break
      }
    }
    return undefined
  }

  getNodeForBeat(beat: number): StepParityNode | undefined {
    if (this.lastGraph == undefined || this.lastStates == undefined) {
      return undefined
    }

    for (const state of this.lastStates) {
      if (Math.abs(state.beat - beat) < 0.0001) {
        return this.lastGraph.addOrGetExistingNode(state)
      }
      if (state.beat > beat) {
        break
      }
    }
    return undefined
  }

  getAllNodesForBeat(beat: number): StepParityNode[] {
    if (this.lastGraph == undefined) {
      return []
    }

    const nodes: StepParityNode[] = []

    for (const node of this.lastGraph.nodes) {
      if (Math.abs(node.state.beat - beat) < 0.0001) {
        nodes.push(node)
      } else if (node.state.beat > beat) {
        break
      }
    }
    return nodes
  }

  getAllNodesForRow(row: number): StepParityNode[] {
    if (this.lastGraph == undefined) {
      return []
    }

    const nodes: StepParityNode[] = []

    for (const node of this.lastGraph.nodes) {
      if (node.state.rowIndex == row) {
        nodes.push(node)
      } else if (node.state.rowIndex > row) {
        break
      }
    }
    return nodes
  }

  getOverridesByRow() {
    const notedata = this.app.chartManager.loadedChart?.getNotedata()
    if (!notedata) return []
    const rows = this.parityGenInternal.createRows(notedata)
    const overridesByRow = this.beatOverrides.getOverridesByRow(rows)
    return overridesByRow
  }

  // Loads pre-calculated note parity data from json string
  loadParityData(jsonString: string): boolean {
    const notedata = this.app.chartManager.loadedChart?.getNotedata()
    if (!notedata) return false
    const rows = this.parityGenInternal.createRows(notedata)
    const parities = this.deserializeParityData(jsonString)
    if (parities == undefined) {
      return false
    }
    const paritiesWithoutOverrides = this.parityGenInternal.generateParities(
      notedata,
      undefined
    )

    // This is mostly a sanity check
    if (
      parities.length != rows.length ||
      parities.length != paritiesWithoutOverrides.length
    ) {
      return false
    }

    // Now that we've loaded the json data, we need to figure out if it represents any
    // notes that were overridden.
    const rowDifferences = this.getParityDifferences(
      paritiesWithoutOverrides,
      parities
    )
    // And then map those differences to beat instead of row

    const beatDifferences: { [key: string]: Foot[] } = {}
    for (const rowIndex in rowDifferences) {
      const beatStr = rows[rowIndex].beat.toFixed(3)
      beatDifferences[beatStr] = rowDifferences[rowIndex]
    }
    this.lastParities = parities
    this.beatOverrides.setBeatOverrides(beatDifferences)
    this.parityGenInternal.setNoteParity(
      rows,
      this.lastParities,
      this.beatOverrides
    )
    return true
  }

  // Returns rows that differ between p1 and p2
  // For a given row, the values of p2 that differ from p1 are returned
  // For examples, given p1 = [[0010], [3100]], p2 = [[0010], [2100]]
  // returns {1: [2000]}
  getParityDifferences(p1: Foot[][], p2: Foot[][]): { [key: number]: Foot[] } {
    const rowDifferences: { [key: number]: Foot[] } = {}

    for (let r = 0; r < p1.length; r++) {
      const diffs: Foot[] = []
      let hasDifference: boolean = false
      for (let c = 0; c < p1[r].length; c++) {
        if (p1[r][c] != p2[r][c]) {
          diffs.push(p2[r][c])
          hasDifference = true
        } else {
          diffs.push(Foot.NONE)
        }
      }
      if (hasDifference) {
        rowDifferences[r] = diffs
      }
    }
    return rowDifferences
  }

  // This just returns the `columns` for each row, indicating the position of
  // each foot for a given row
  // This just returns the `columns` for each row, indicating the position of
  // each foot for a given row
  serializeParityData(indent: boolean = false): string {
    return JSON.stringify(this.lastParities, null, indent ? 2 : undefined)
  }

  deserializeParityData(jsonString: string): Foot[][] | undefined {
    try {
      const deserialized: Foot[][] = JSON.parse(jsonString)
      return deserialized
    } catch (e) {
      return undefined
    }
  }

  serializeStepGraph(indent: boolean = false): string {
    if (this.lastGraph != undefined) {
      return this.lastGraph.serialized(indent)
    }
    return ""
  }

  clear() {
    const notedata = this.app.chartManager.loadedChart?.getNotedata()
    if (!notedata) return
    notedata.forEach(note => (note.parity = undefined))
  }

  //
  // Getting/setting weights
  //

  getWeights(): { [key: string]: number } {
    const weightsCopy: { [key: string]: number } = JSON.parse(
      JSON.stringify(this.WEIGHTS)
    )
    return weightsCopy
  }

  getDefaultWeights(): { [key: string]: number } {
    const weightsCopy: { [key: string]: number } = JSON.parse(
      JSON.stringify(this.DEFAULT_WEIGHTS)
    )
    return weightsCopy
  }

  updateWeights(newWeights: { [key: string]: number }) {
    for (const k in this.WEIGHTS) {
      this.WEIGHTS[k] = newWeights[k] || this.WEIGHTS[k]
    }
  }

  resetWeights() {
    this.updateWeights(this.DEFAULT_WEIGHTS)
  }
}
