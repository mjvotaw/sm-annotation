// This is most of the internals for ParityGenerator,
// as much of it as I can separate from the rest of the SMEditor code.
// I wanted to do this so that I could port the parity generating stuff
// into something I could more easily run from commandline.

// Generates foot parity given notedata
// Original algorithm by Jewel, polished by tillvit

import { LAYOUT } from "./StageLayouts"
import {
  HoldNotedataEntry,
  Notedata,
  NotedataEntry,
  isHoldNote,
} from "../chart/sm/NoteTypes"

import {
  Foot,
  OTHER_PART_OF_FOOT,
  State,
  Row,
  StepParityNode,
  StepParityGraph,
  BeatOverrides,
  ZERO_WEIGHT,
} from "./ParityDataTypes"
import { ParityCostCalculator } from "./ParityCost"

export const FEET = [
  Foot.LEFT_HEEL,
  Foot.LEFT_TOE,
  Foot.RIGHT_HEEL,
  Foot.RIGHT_TOE,
]

export const FEET_LABELS = [".", "L", "l", "R", "r"]

export const FEET_LABEL_TO_FOOT: { [key: string]: Foot } = {
  L: Foot.LEFT_HEEL,
  l: Foot.LEFT_TOE,
  R: Foot.RIGHT_HEEL,
  r: Foot.RIGHT_TOE,
}

export enum TechCountsCategory {
  Crossovers = 0,
  Footswitches,
  Sideswitches,
  Jacks,
  Brackets,
  Doublesteps,
  NUM_TechCountsCategory,
  Invalid,
}

export const TECH_COUNTS = ["XO", "FS", "SS", "JA", "BR", "DS"]

const JACK_CUTOFF = 0.176

export class ParityGenInternal {
  costCalculator: ParityCostCalculator

  private permuteCache: Map<number, Foot[][]> = new Map()
  private readonly layout

  constructor(type: string) {
    this.layout = LAYOUT[type]
    this.costCalculator = new ParityCostCalculator(type)
  }

  analyze(
    notedata: Notedata,
    beatOverrides: BeatOverrides | undefined,
    weights: { [key: string]: number }
  ): {
    graph: StepParityGraph
    selectedStates: State[]
    parities: Foot[][]
    techCounts: number[]
  } {
    this.costCalculator.setWeights(weights)

    const rows = this.createRows(notedata)

    const graph = this.buildStateGraph(rows, undefined)
    if (beatOverrides != undefined) {
      this.applyOverrides(graph, beatOverrides)
    }

    const selectedStates = this.selectStatesForRows(graph, rows.length)
    const parities = selectedStates.map(s => s.columns)
    this.setNoteParity(rows, parities, beatOverrides)
    const techCounts = this.calculateTechCounts(rows, this.layout.columnCount)

    return { graph, selectedStates, parities, techCounts }
  }

  calculatePermuteColumnKey(row: Row): number {
    let permuteCacheKey = 0
    for (let i = 0; i < this.layout.columnCount; i++) {
      if (row.notes[i] !== undefined || row.holds[i] !== undefined) {
        permuteCacheKey += Math.pow(2, i)
      }
    }
    return permuteCacheKey
  }

  getPermuteColumns(row: Row): Foot[][] {
    const cacheKey = this.calculatePermuteColumnKey(row)
    let permuteColumns = this.permuteCache.get(cacheKey)
    if (permuteColumns == undefined) {
      permuteColumns = this.permuteColumn(
        row,
        new Array(this.layout.columnCount).fill(Foot.NONE),
        0
      )
      this.permuteCache.set(cacheKey, permuteColumns)
    }
    return this.permuteCache.get(cacheKey)!
  }

  permuteColumn(row: Row, columns: Foot[], column: number): Foot[][] {
    if (column >= columns.length) {
      let leftHeelIndex = -1
      let leftToeIndex = -1
      let rightHeelIndex = -1
      let rightToeIndex = -1
      for (let i = 0; i < columns.length; i++) {
        if (columns[i] == Foot.NONE) continue
        if (columns[i] == Foot.LEFT_HEEL) leftHeelIndex = i
        if (columns[i] == Foot.LEFT_TOE) leftToeIndex = i
        if (columns[i] == Foot.RIGHT_HEEL) rightHeelIndex = i
        if (columns[i] == Foot.RIGHT_TOE) rightToeIndex = i
      }
      if (
        (leftHeelIndex == -1 && leftToeIndex != -1) ||
        (rightHeelIndex == -1 && rightToeIndex != -1)
      ) {
        return []
      }
      if (leftHeelIndex != -1 && leftToeIndex != -1) {
        if (!this.layout.bracketCheck(leftHeelIndex, leftToeIndex)) return []
      }
      if (rightHeelIndex != -1 && rightToeIndex != -1) {
        if (!this.layout.bracketCheck(rightHeelIndex, rightToeIndex)) return []
      }
      return [columns]
    }
    const permutations = []
    if (row.notes[column] || row.holds[column]) {
      for (const foot of FEET) {
        if (columns.includes(foot)) continue
        const newColumns = [...columns]
        newColumns[column] = foot
        permutations.push(...this.permuteColumn(row, newColumns, column + 1))
      }
      return permutations
    }
    return this.permuteColumn(row, columns, column + 1)
  }

  buildOverridenPermuteColumns(
    row: Row,
    permuteColumns: Foot[][],
    beatOverrides: BeatOverrides
  ): Foot[][] {
    if (beatOverrides.hasBeatOverride(row.beat)) {
      const updatedPermuteColumns: Foot[][] = []
      const overrides: Foot[] = beatOverrides.getBeatOverride(row.beat)
      for (const pc of permuteColumns) {
        const updatedPc: Foot[] = [...pc]

        for (let c = 0; c < this.layout.columnCount; c++) {
          const noteOverride = overrides[c]
          if (noteOverride != Foot.NONE) {
            updatedPc[c] = noteOverride
          }
        }

        // Check that this updated permuteColumn doesn't have something wacky like
        // two left heels
        if (
          countOfItem(updatedPc, Foot.LEFT_HEEL) > 1 ||
          countOfItem(updatedPc, Foot.LEFT_TOE) > 1 ||
          countOfItem(updatedPc, Foot.RIGHT_HEEL) > 1 ||
          countOfItem(updatedPc, Foot.RIGHT_TOE) > 1
        ) {
          continue
        }
        if (
          updatedPermuteColumns.filter(u => arraysAreEqual(u, updatedPc))
            .length > 0
        ) {
          continue
        }
        updatedPermuteColumns.push(updatedPc)
      }

      // Sanity check that we have at least one valid permutation
      if (updatedPermuteColumns.length == 0) {
        console.warn(
          `Could not generate any valid permutations with parity overrides for row at beat ${row.beat}, clearing overrides, as there must be something invalid about it.`
        )
        beatOverrides.removeBeatOverride(row.beat)
        return permuteColumns
      } else {
        return updatedPermuteColumns
      }
    }
    return permuteColumns
  }

  createRows(notedata: Notedata) {
    let activeHolds: (HoldNotedataEntry | undefined)[] = []
    let lastColumnSecond: number | null = null
    let lastColumnBeat: number | null = null
    let notes: NotedataEntry[] = []
    let mines: (number | undefined)[] = []
    let fakeMines: (number | undefined)[] = []
    let nextMines: (number | undefined)[] = []
    let nextFakeMines: (number | undefined)[] = []
    const rows: Row[] = []
    for (const note of notedata) {
      if (note.type == "Mine") {
        if (note.second == lastColumnSecond && rows.length > 0) {
          if (note.fake) {
            nextFakeMines[note.col] = note.second
          } else {
            nextMines[note.col] = note.second
          }
        } else {
          if (note.fake) {
            fakeMines[note.col] = note.second
          } else {
            mines[note.col] = note.second
          }
        }
        continue
      }
      if (note.fake) continue
      if (lastColumnSecond != note.second) {
        if (lastColumnSecond != null && lastColumnBeat != null) {
          rows.push({
            notes,
            holds: activeHolds.map(hold => {
              if (hold === undefined || hold.second >= lastColumnSecond!)
                return undefined
              return hold
            }),
            holdTails: new Set(
              activeHolds
                .filter(hold => {
                  if (hold === undefined) return false
                  if (
                    Math.abs(hold.beat + hold.hold - lastColumnBeat!) > 0.0005
                  ) {
                    return false
                  }
                  return true
                })
                .map(hold => hold!.col)
            ),
            mines: nextMines,
            fakeMines: nextFakeMines,
            second: lastColumnSecond,
            beat: lastColumnBeat,
          })
        }
        lastColumnSecond = note.second
        lastColumnBeat = note.beat
        notes = []
        nextMines = mines
        nextFakeMines = fakeMines
        mines = []
        fakeMines = []
        activeHolds = activeHolds.map(hold => {
          if (hold === undefined || note.beat > hold.beat + hold.hold)
            return undefined
          return hold
        })
      }
      notes[note.col] = note
      if (isHoldNote(note)) {
        activeHolds[note.col] = note
      }
    }
    rows.push({
      notes,
      holds: activeHolds.map(hold => {
        if (hold === undefined || hold.second >= lastColumnSecond!)
          return undefined
        return hold
      }),
      holdTails: new Set(
        activeHolds
          .filter(hold => {
            if (hold === undefined) return false
            if (Math.abs(hold.beat + hold.hold - lastColumnBeat!) > 0.0005) {
              return false
            }
            return true
          })
          .map(hold => hold!.col)
      ),
      mines: nextMines,
      fakeMines: nextFakeMines,
      second: lastColumnSecond!,
      beat: lastColumnBeat!,
    })

    return rows
  }

  generateParities(
    notedata: Notedata,
    beatOverrides: BeatOverrides | undefined
  ): Foot[][] {
    const rows = this.createRows(notedata)

    const graph = this.buildStateGraph(rows, beatOverrides)
    const states = this.selectStatesForRows(graph, rows.length)
    const parities = states.map(s => s.columns)
    this.setNoteParity(rows, parities, beatOverrides)
    return parities
  }

  selectStatesForRows(graph: StepParityGraph, rowCount: number): State[] {
    const nodes_for_rows = graph.computeCheapestPath()
    const states: State[] = []
    for (let i = 0; i < rowCount; i++) {
      const node = graph.nodes[nodes_for_rows[i]]
      states.push(node.state)
    }

    return states
  }

  setNoteParity(
    rows: Row[],
    parities: Foot[][],
    beatOverrides: BeatOverrides | undefined
  ) {
    for (let i = 0; i < rows.length; i++) {
      const parityForRow = parities[i]
      for (let j = 0; j < this.layout.columnCount; j++) {
        if (rows[i].notes[j]) {
          rows[i].notes[j]!.parity = FEET_LABELS[parityForRow[j]]
          rows[i].notes[j]!.parityOverride =
            beatOverrides && beatOverrides.hasBeatOverride(rows[i].beat)
        }
      }
    }
  }

  // Generates a StepParityGraph from the given array of Rows.
  // The graph inserts two additional nodes: one that represent the beginning of the song, before the first note,
  // and one that represents the end of the song, after the final note.
  buildStateGraph(
    rows: Row[],
    beatOverrides: BeatOverrides | undefined
  ): StepParityGraph {
    const graph: StepParityGraph = new StepParityGraph()
    const beginningState: State = new State(-1, rows[0].second - 1, -1, [])

    const startNode: StepParityNode = graph.addOrGetExistingNode(beginningState)
    graph.startNode = startNode.id

    const previousStates: Array<State> = []
    previousStates.push(beginningState)

    for (let i = 0; i < rows.length; i++) {
      const uniqueNodeIdxs = new Set<number>()
      while (previousStates.length > 0) {
        const state = previousStates.shift()!
        const initialNode = graph.addOrGetExistingNode(state)
        let permuteColumns: Foot[][] = this.getPermuteColumns(rows[i])
        if (beatOverrides && beatOverrides.hasBeatOverride(rows[i].beat)) {
          permuteColumns = this.buildOverridenPermuteColumns(
            rows[i],
            permuteColumns,
            beatOverrides
          )
        }

        for (const columns of permuteColumns) {
          const resultState: State = this.initResultState(
            state,
            rows[i],
            i,
            columns
          )
          const cost = this.costCalculator.getActionCost(
            state,
            resultState,
            rows,
            i
          )
          const resultNode = graph.addOrGetExistingNode(resultState)
          graph.addEdge(initialNode, resultNode, cost)

          uniqueNodeIdxs.add(resultNode.id)
        }
      }

      for (const nodeIdx of uniqueNodeIdxs) {
        previousStates.push(graph.nodes[nodeIdx].state)
      }
    }

    // at this point, previousStates holds all of the states for the very last row,
    // which just get connected to the endState

    const endState: State = new State(
      rows.length,
      rows[rows.length - 1].second + 1,
      rows[rows.length - 1].beat + 1,
      []
    )

    const endNode = graph.addOrGetExistingNode(endState)
    graph.endNode = endNode.id
    while (previousStates.length > 0) {
      const state = previousStates.shift()!
      const node = graph.addOrGetExistingNode(state)
      graph.addEdge(node, endNode, { ...ZERO_WEIGHT })
    }

    return graph
  }

  applyOverrides(graph: StepParityGraph, beatOverrides: BeatOverrides) {
    for (const node of graph.nodes) {
      if (beatOverrides.shouldNodeBeOverridden(node)) {
        node.ancestors.forEach((_, aidx) => {
          const costToNode = graph.nodes[aidx].neighbors.get(node.id)
          if (costToNode != undefined) {
            costToNode["OVERRIDE"] += 100000
            costToNode["TOTAL"] += 100000
            graph.nodes[aidx].neighbors.set(node.id, { ...costToNode })
            node.ancestors.set(aidx, { ...costToNode })
          }
        })
      }
    }
  }

  // Creates a new State, which is the result of moving from the given
  // initialState to the steps of the given row with the given foot
  // placements in columns.
  initResultState(
    initialState: State,
    row: Row,
    rowIndex: number,
    columns: Foot[]
  ): State {
    const resultState: State = new State(
      rowIndex,
      row.second,
      row.beat,
      columns
    )

    for (let i = 0; i < this.layout.columnCount; i++) {
      resultState.combinedColumns.push(Foot.NONE)
      if (columns[i] == undefined) {
        continue
      }

      if (row.holds[i] == undefined) {
        resultState.movedFeet.add(columns[i])
      } else if (initialState.combinedColumns[i] != columns[i]) {
        resultState.movedFeet.add(columns[i])
      }
      if (row.holds[i] != undefined) {
        resultState.holdFeet.add(columns[i])
      }
    }

    return resultState
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

  calculateTechCounts(rows: Row[], columnCount: number) {
    const previousFootPlacement: number[] = []
    const currentFootPlacement: number[] = []
    const techCounts: number[] = []
    let previousNoteCount = 0
    for (let t = 0; t < 6; t++) {
      techCounts.push(0)
    }

    for (let i = 0; i <= FEET.length; i++) {
      previousFootPlacement.push(-1)
      currentFootPlacement.push(-1)
    }

    const previousColumns: Foot[] = []
    const currentColumns: Foot[] = []

    for (let i = 0; i < columnCount; i++) {
      previousColumns.push(Foot.NONE)
      currentColumns.push(Foot.NONE)
    }

    for (let r = 0; r < rows.length; r++) {
      const currentRow = rows[r]
      let noteCount: number = 0
      const techs: string[] = []

      // copy the foot placement for the current row into currentColumns,
      // and count up how many notes there are in this row

      for (let c = 0; c < columnCount; c++) {
        const currentNote = currentRow.notes[c]
        if (currentNote != undefined) {
          const currFoot = currentNote.parity
            ? FEET_LABEL_TO_FOOT[currentNote.parity]
            : Foot.NONE

          if (currentNote.type != "Tap" && currentNote.type != "Hold") {
            continue
          }

          currentFootPlacement[currFoot] = c
          currentColumns[c] = currFoot
          noteCount += 1
        }
      }

      /*
      Jacks are same arrow same foot
      Doublestep is same foot on successive arrows
      Brackets are jumps with one foot

      Footswitch is different foot on the up or down arrow
      Sideswitch is footswitch on left or right arrow
      Crossovers are left foot on right arrow or vice versa
      */

      // check for jacks and doublesteps
      if (r > 0 && noteCount == 1 && previousNoteCount == 1) {
        for (const foot of FEET) {
          if (
            currentFootPlacement[foot] == -1 ||
            previousFootPlacement[foot] == -1
          ) {
            continue
          }

          if (previousFootPlacement[foot] == currentFootPlacement[foot]) {
            if (currentRow.second - rows[r - 1].second < JACK_CUTOFF) {
              techs.push(TECH_COUNTS[TechCountsCategory.Jacks])
              techCounts[TechCountsCategory.Jacks] += 1
            }
          } else {
            techs.push(TECH_COUNTS[TechCountsCategory.Doublesteps])
            techCounts[TechCountsCategory.Doublesteps] += 1
          }
        }
      }

      // check for brackets
      if (noteCount >= 2) {
        if (
          currentFootPlacement[Foot.LEFT_HEEL] != -1 &&
          currentFootPlacement[Foot.LEFT_TOE] != -1
        ) {
          techs.push(TECH_COUNTS[TechCountsCategory.Brackets])
          techCounts[TechCountsCategory.Brackets] += 1
        }

        if (
          currentFootPlacement[Foot.RIGHT_HEEL] != -1 &&
          currentFootPlacement[Foot.RIGHT_TOE] != -1
        ) {
          techs.push(TECH_COUNTS[TechCountsCategory.Brackets])
          techCounts[TechCountsCategory.Brackets] += 1
        }
      }

      for (let c = 0; c < columnCount; c++) {
        if (currentColumns[c] == Foot.NONE) {
          continue
        }

        // this same column was stepped on in the previous row, but not by the same foot ==> footswitch or sideswitch
        if (
          previousColumns[c] != Foot.NONE &&
          previousColumns[c] != currentColumns[c] &&
          OTHER_PART_OF_FOOT[previousColumns[c]] != currentColumns[c]
        ) {
          // this is assuming only 4-panel single
          if (c == 0 || c == 3) {
            techs.push(TECH_COUNTS[TechCountsCategory.Sideswitches])
            techCounts[TechCountsCategory.Sideswitches] += 1
          } else {
            techs.push(TECH_COUNTS[TechCountsCategory.Footswitches])
            techCounts[TechCountsCategory.Footswitches] += 1
          }
        }
        // if the right foot is pressing the left arrow, or the left foot is pressing the right ==> crossover
        else if (
          c == 0 &&
          previousColumns[c] == Foot.NONE &&
          (currentColumns[c] == Foot.RIGHT_HEEL ||
            currentColumns[c] == Foot.RIGHT_TOE)
        ) {
          techs.push(TECH_COUNTS[TechCountsCategory.Crossovers])
          techCounts[TechCountsCategory.Crossovers] += 1
        } else if (
          c == 3 &&
          previousColumns[c] == Foot.NONE &&
          (currentColumns[c] == Foot.LEFT_HEEL ||
            currentColumns[c] == Foot.LEFT_TOE)
        ) {
          techs.push(TECH_COUNTS[TechCountsCategory.Crossovers])
          techCounts[TechCountsCategory.Crossovers] += 1
        }
      }

      const techs_string = techs.join(",")
      for (const note of currentRow.notes) {
        if (note != undefined) {
          note.tech = techs_string
        }
      }

      // Move the values from currentFootPlacement to previousFootPlacement,
      // and reset currentFootPlacement
      for (let f = 0; f <= FEET.length; f++) {
        previousFootPlacement[f] = currentFootPlacement[f]
        currentFootPlacement[f] = -1
      }
      for (let c = 0; c < columnCount; c++) {
        previousColumns[c] = currentColumns[c]
        currentColumns[c] = Foot.NONE
      }
      previousNoteCount = noteCount
    }

    console.log("TECH COUNTS:")
    for (let t = 0; t < TECH_COUNTS.length; t++) {
      console.log(`${TECH_COUNTS[t]}: ${techCounts[t]}`)
    }

    return techCounts
  }
}

function arraysAreEqual<T>(array1: T[], array2: T[]): boolean {
  if (array1.length !== array2.length) {
    return false
  }

  for (let i = 0; i < array1.length; i++) {
    if (array1[i] !== array2[i]) {
      return false
    }
  }

  return true
}

function countOfItem<T>(array: T[], item: T): number {
  return array.filter(a => a == item).length
}
