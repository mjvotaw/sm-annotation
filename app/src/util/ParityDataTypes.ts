import { HoldNotedataEntry, NotedataEntry } from "../chart/sm/NoteTypes"

export enum Foot {
  NONE,
  LEFT_HEEL,
  LEFT_TOE,
  RIGHT_HEEL,
  RIGHT_TOE,
}

export interface FootPlacement {
  leftHeel: number
  leftToe: number
  rightHeel: number
  rightToe: number
  leftBracket: boolean
  rightBracket: boolean
}

export interface State {
  idx: number
  columns: Foot[]
  combinedColumns: Foot[]
  movedFeet: Set<Foot>
  holdFeet: Set<Foot>
  second: number
  beat: number
  rowIndex: number
}

// because sets aren't serializable, this is an intermediate
// interface for States
export interface SerializableState {
  idx: number
  columns: Foot[]
  combinedColumns: Foot[]
  movedFeet: Foot[]
  holdFeet: Foot[]
  second: number
  beat: number
  rowIndex: number
}

export interface Row {
  notes: (NotedataEntry | undefined)[]
  holds: (HoldNotedataEntry | undefined)[]
  holdTails: Set<number>
  mines: (number | undefined)[]
  fakeMines: (number | undefined)[]
  second: number
  beat: number
}

// A node within a StepParityGraph.
// Represents a given state, and its connections to the states in the
// following row of the step chart.
export class StepParityNode {
  id: number = 0 // The index of this node in its graph.nodes array
  neighbors: Map<number, { [id: string]: number }> = new Map() // Connections to, and the cost of moving to, the connected nodes. Keys are the connected node's id, and values are the cost.
  ancestors: Map<number, { [id: string]: number }> = new Map() // Connections to, and cost of moving from, a connected node to this node.

  state: State

  constructor(state: State, id: number) {
    this.state = state
    this.id = id
  }

  serialized(): SerializableNode {
    const mappedStuff: [number, { [id: string]: number }][] = []
    this.neighbors.forEach((val, key) => {
      mappedStuff.push([key, val])
    })

    const mappedAncestors: [number, { [id: string]: number }][] = []
    this.ancestors.forEach((val, key) => {
      mappedAncestors.push([key, val])
    })

    const serializableNode: SerializableNode = {
      id: this.id,
      stateIdx: this.state.idx,
      neighbors: mappedStuff,
      ancestors: mappedAncestors,
    }
    return serializableNode
  }
}

export interface SerializableNode {
  id: number
  neighbors: [number, { [id: string]: number }][]
  ancestors: [number, { [id: string]: number }][]
  stateIdx: number
}

// A graph, representing all of the possible states for a step chart.
export class StepParityGraph {
  nodes: Array<StepParityNode> = []
  states: Array<State> = []

  startNode: number = 0
  endNode: number = 0
  // A nested map to keep track of states and associated nodes
  // first key is row number,
  // second key is index of state in the graph's states array
  // resulting value is index of node in the graph's nodes array
  stateNodeMap: Map<number, Map<number, number>> = new Map()

  addOrGetExistingNode(state: State): StepParityNode {
    if (this.stateNodeMap.get(state.rowIndex) == undefined) {
      this.stateNodeMap.set(state.rowIndex, new Map<number, number>())
    }

    for (const [stateIdx, nodeIdx] of this.stateNodeMap.get(state.rowIndex)!) {
      if (compareStates(state, this.states[stateIdx])) {
        return this.nodes[nodeIdx]
      }
    }
    const stateIdx = this.states.length
    const nodeIdx = this.nodes.length
    state.idx = this.states.length
    this.states.push(state)
    const newNode = new StepParityNode(state, nodeIdx)
    this.nodes.push(newNode)
    this.stateNodeMap.get(state.rowIndex)?.set(stateIdx, nodeIdx)
    return newNode
  }

  addEdge(
    from: StepParityNode,
    to: StepParityNode,
    cost: { [id: string]: number }
  ) {
    from.neighbors.set(to.id, cost)
    to.ancestors.set(from.id, cost)
  }

  computeCheapestPath(): number[] {
    const start = this.startNode
    const end = this.endNode
    return this.getCheapestPathBetweenNodes(start, end)
  }

  getCheapestPathBetweenNodes(start: number, end: number): number[] {
    const shortest_path: number[] = []
    const cost = Array(this.nodes.length).fill(Number.MAX_VALUE)
    const predecessor = Array(this.nodes.length).fill(-1)

    cost[start] = 0
    for (let i = 0; i <= end; i++) {
      const node = this.nodes[i]!
      for (const [neighborNodeIdx, weight] of node.neighbors) {
        if (cost[i] + weight.TOTAL < cost[neighborNodeIdx]) {
          cost[neighborNodeIdx] = cost[i] + weight.TOTAL
          predecessor[neighborNodeIdx] = i
        }
      }
    }

    let current_node = end
    while (current_node != start) {
      if (current_node == -1) {
        console.warn(
          `getCheapestPathBetweenNodes:: current_node == -1, while searching for path between ${start} and ${end}`
        )
        break
      }
      if (current_node != end) {
        shortest_path.push(current_node)
      }
      current_node = predecessor[current_node]
    }
    shortest_path.reverse()
    return shortest_path
  }
}

// helper functions

function compareStates(state1: State, state2: State): boolean {
  if (state1.second !== state2.second) {
    return false
  }
  if (state1.rowIndex !== state2.rowIndex) {
    return false
  }
  if (!arraysAreEqual(state1.columns, state2.columns)) {
    return false
  }
  if (!arraysAreEqual(state1.combinedColumns, state2.combinedColumns)) {
    return false
  }
  if (!setsAreEqual(state1.movedFeet, state2.movedFeet)) {
    return false
  }
  if (!setsAreEqual(state1.holdFeet, state2.holdFeet)) {
    return false
  }
  return true
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

function setsAreEqual<T>(set1: Set<T>, set2: Set<T>): boolean {
  if (set1.size !== set2.size) {
    return false
  }
  for (const item of set1) {
    if (!set2.has(item)) {
      return false
    }
  }
  return true
}

// Math functions
