import { Foot, FootPlacement, State, Row } from "./ParityDataTypes"

import { LAYOUT, StageLayout } from "./StageLayouts"

export class ParityCostCalculator {
  private readonly layout: StageLayout

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
    OTHER: 500,
  }

  constructor(
    type: string,
    weights: { [key: string]: number } | undefined = undefined
  ) {
    this.layout = LAYOUT[type]
    if (weights != undefined) {
      this.WEIGHTS = weights
    }
  }

  setWeights(newWeights: { [key: string]: number }) {
    for (const k in this.WEIGHTS) {
      this.WEIGHTS[k] = newWeights[k] || this.WEIGHTS[k]
    }
  }

  getActionCost(
    initialState: State,
    resultState: State,
    rows: Row[],
    rowIndex: number
  ): { [id: string]: number } {
    const row = rows[rowIndex]
    const elapsedTime = resultState.second - initialState.second

    const costs: { [id: string]: number } = JSON.parse(
      JSON.stringify(this.WEIGHTS)
    )
    for (const t in costs) {
      costs[t] = 0
    }

    const combinedColumns: Foot[] = this.combineColumns(
      initialState,
      resultState
    )

    // Where were the feet before this state?
    const initialPlacement = this.footPlacementFromColumns(
      initialState.combinedColumns
    )
    // How did the feet move during this state?
    const resultPlacement = this.footPlacementFromColumns(resultState.columns)
    // What do the feet end up at the end of this state?
    const combinedPlacement = this.footPlacementFromColumns(combinedColumns)

    // Mine weighting

    for (let i = 0; i < combinedColumns.length; i++) {
      if (combinedColumns[i] != Foot.NONE && row.mines[i] !== undefined) {
        costs["MINE"] += this.WEIGHTS.MINE
        break
      }
    }

    for (let c = 0; c < row.holds.length; c++) {
      if (row.holds[c] === undefined) continue
      if (
        ((combinedColumns[c] == Foot.LEFT_HEEL ||
          combinedColumns[c] == Foot.LEFT_TOE) &&
          initialState.combinedColumns[c] != Foot.LEFT_TOE &&
          initialState.combinedColumns[c] != Foot.LEFT_HEEL) ||
        ((combinedColumns[c] == Foot.RIGHT_HEEL ||
          combinedColumns[c] == Foot.RIGHT_TOE) &&
          initialState.combinedColumns[c] != Foot.RIGHT_TOE &&
          initialState.combinedColumns[c] != Foot.RIGHT_HEEL)
      ) {
        const previousFoot = initialState.combinedColumns.indexOf(
          combinedColumns[c]
        )
        const tempcost =
          this.WEIGHTS.HOLDSWITCH *
          (previousFoot == -1
            ? 1
            : Math.sqrt(this.layout.getDistanceSq(c, previousFoot)))
        costs["HOLDSWITCH"] += tempcost
      }
    }

    // Small penalty for trying to jack a bracket during a hold
    if (resultPlacement.leftBracket) {
      let jackPenalty = 1
      if (
        initialState.movedFeet.has(Foot.LEFT_HEEL) ||
        initialState.movedFeet.has(Foot.LEFT_TOE)
      )
        jackPenalty = 1 / elapsedTime
      if (
        row.holds[resultPlacement.leftHeel] !== undefined &&
        row.holds[resultPlacement.leftToe] === undefined
      ) {
        costs["BRACKETTAP"] += this.WEIGHTS.BRACKETTAP * jackPenalty
      }
      if (
        row.holds[resultPlacement.leftToe] !== undefined &&
        row.holds[resultPlacement.leftHeel] === undefined
      ) {
        costs["BRACKETTAP"] += this.WEIGHTS.BRACKETTAP * jackPenalty
      }
    }

    if (resultPlacement.rightBracket) {
      let jackPenalty = 1
      if (
        initialState.movedFeet.has(Foot.RIGHT_TOE) ||
        initialState.movedFeet.has(Foot.RIGHT_HEEL)
      )
        jackPenalty = 1 / elapsedTime

      if (
        row.holds[resultPlacement.rightHeel] !== undefined &&
        row.holds[resultPlacement.rightToe] === undefined
      ) {
        costs["BRACKETTAP"] += this.WEIGHTS.BRACKETTAP * jackPenalty
      }
      if (
        row.holds[resultPlacement.rightToe] !== undefined &&
        row.holds[resultPlacement.rightHeel] === undefined
      ) {
        costs["BRACKETTAP"] += this.WEIGHTS.BRACKETTAP * jackPenalty
      }
    }

    // Weighting for moving a foot while the other isn't on the pad (so marked doublesteps are less bad than this)
    if (initialState.combinedColumns.some(x => x != Foot.NONE)) {
      for (const f of resultState.movedFeet) {
        switch (f) {
          case Foot.LEFT_HEEL:
          case Foot.LEFT_TOE:
            if (
              !(
                initialState.combinedColumns.includes(Foot.RIGHT_HEEL) ||
                initialState.combinedColumns.includes(Foot.RIGHT_TOE)
              )
            )
              costs["OTHER"] += this.WEIGHTS.OTHER
            break
          case Foot.RIGHT_HEEL:
          case Foot.RIGHT_TOE:
            if (
              !(
                initialState.combinedColumns.includes(Foot.LEFT_HEEL) ||
                initialState.combinedColumns.includes(Foot.RIGHT_TOE)
              )
            )
              costs["OTHER"] += this.WEIGHTS.OTHER
            break
        }
      }
    }

    const movedLeft =
      resultState.movedFeet.has(Foot.LEFT_HEEL) ||
      resultState.movedFeet.has(Foot.LEFT_TOE)
    const movedRight =
      resultState.movedFeet.has(Foot.RIGHT_HEEL) ||
      resultState.movedFeet.has(Foot.RIGHT_TOE)

    const didJump =
      ((initialState.movedFeet.has(Foot.LEFT_HEEL) &&
        !initialState.holdFeet.has(Foot.LEFT_HEEL)) ||
        (initialState.movedFeet.has(Foot.LEFT_TOE) &&
          !initialState.holdFeet.has(Foot.LEFT_TOE))) &&
      ((initialState.movedFeet.has(Foot.RIGHT_HEEL) &&
        !initialState.holdFeet.has(Foot.RIGHT_HEEL)) ||
        (initialState.movedFeet.has(Foot.RIGHT_TOE) &&
          !initialState.holdFeet.has(Foot.RIGHT_TOE)))

    // jacks don't matter if you did a jump before

    let jackedLeft = false
    let jackedRight = false

    if (!didJump) {
      if (resultPlacement.leftHeel != -1 && movedLeft) {
        if (
          initialState.combinedColumns[resultPlacement.leftHeel] ==
            Foot.LEFT_HEEL &&
          !resultState.holdFeet.has(Foot.LEFT_HEEL) &&
          ((initialState.movedFeet.has(Foot.LEFT_HEEL) &&
            !initialState.holdFeet.has(Foot.LEFT_HEEL)) ||
            (initialState.movedFeet.has(Foot.LEFT_TOE) &&
              !initialState.holdFeet.has(Foot.LEFT_TOE)))
        )
          jackedLeft = true
        if (
          initialState.combinedColumns[resultPlacement.leftToe] ==
            Foot.LEFT_TOE &&
          !resultState.holdFeet.has(Foot.LEFT_TOE) &&
          ((initialState.movedFeet.has(Foot.LEFT_HEEL) &&
            !initialState.holdFeet.has(Foot.LEFT_HEEL)) ||
            (initialState.movedFeet.has(Foot.LEFT_TOE) &&
              !initialState.holdFeet.has(Foot.LEFT_TOE)))
        )
          jackedLeft = true
      }

      if (resultPlacement.rightHeel != -1 && movedRight) {
        if (
          initialState.combinedColumns[resultPlacement.rightHeel] ==
            Foot.RIGHT_HEEL &&
          !resultState.holdFeet.has(Foot.RIGHT_HEEL) &&
          ((initialState.movedFeet.has(Foot.RIGHT_HEEL) &&
            !initialState.holdFeet.has(Foot.RIGHT_HEEL)) ||
            (initialState.movedFeet.has(Foot.RIGHT_TOE) &&
              !initialState.holdFeet.has(Foot.RIGHT_TOE)))
        )
          jackedRight = true
        if (
          initialState.combinedColumns[resultPlacement.rightToe] ==
            Foot.RIGHT_TOE &&
          !resultState.holdFeet.has(Foot.RIGHT_TOE) &&
          ((initialState.movedFeet.has(Foot.RIGHT_HEEL) &&
            !initialState.holdFeet.has(Foot.RIGHT_HEEL)) ||
            (initialState.movedFeet.has(Foot.RIGHT_TOE) &&
              !initialState.holdFeet.has(Foot.RIGHT_TOE)))
        )
          jackedRight = true
      }
    }

    // Doublestep weighting doesn't apply if you just did a jump or a jack

    if (
      movedLeft != movedRight &&
      (movedLeft || movedRight) &&
      resultState.holdFeet.size == 0 &&
      !didJump
    ) {
      let doublestepped = false

      if (
        movedLeft &&
        !jackedLeft &&
        ((initialState.movedFeet.has(Foot.LEFT_HEEL) &&
          !initialState.holdFeet.has(Foot.LEFT_HEEL)) ||
          (initialState.movedFeet.has(Foot.LEFT_TOE) &&
            !initialState.holdFeet.has(Foot.LEFT_TOE)))
      ) {
        doublestepped = true
      }
      if (
        movedRight &&
        !jackedRight &&
        ((initialState.movedFeet.has(Foot.RIGHT_HEEL) &&
          !initialState.holdFeet.has(Foot.RIGHT_HEEL)) ||
          (initialState.movedFeet.has(Foot.RIGHT_TOE) &&
            !initialState.holdFeet.has(Foot.RIGHT_TOE)))
      )
        doublestepped = true

      const lastRow = rows[rowIndex - 1]
      if (lastRow !== undefined) {
        for (const hold of lastRow.holds) {
          if (hold === undefined) continue
          const endBeat = row.beat
          const startBeat = lastRow.beat

          // if a hold tail extends past the last row & ends in between, we can doublestep
          if (
            hold.beat + hold.hold > startBeat &&
            hold.beat + hold.hold < endBeat
          )
            doublestepped = false
          // if the hold tail extends past this row, we can doublestep
          if (hold.beat + hold.hold >= endBeat) doublestepped = false
        }
      }

      // Jack detection is wrong, it's detecting a jack even if another foot moved after it
      /*if ((jackedLeft || jackedRight) && row_distance <= 12) {
          if (DoLogging||true) Console.WriteLine("[{0}->{1}] Penalty of 1000 for a fast jack given to {2} -> {3} with distance {4}", a.row, b.row, Stringify(a.panels), Stringify(newMovement.placement.panels), row_distance);
          newMovement.weighting += 1000;
        }*/

      if (doublestepped) {
        costs["DOUBLESTEP"] += this.WEIGHTS.DOUBLESTEP
      }

      if (
        jackedLeft &&
        resultState.movedFeet.has(Foot.LEFT_HEEL) &&
        resultState.movedFeet.has(Foot.LEFT_TOE)
      ) {
        costs["BRACKETJACK"] += this.WEIGHTS.BRACKETJACK
      }

      if (
        jackedRight &&
        resultState.movedFeet.has(Foot.RIGHT_HEEL) &&
        resultState.movedFeet.has(Foot.RIGHT_TOE)
      ) {
        costs["BRACKETJACK"] += this.WEIGHTS.BRACKETJACK
      }
    }

    if (
      movedLeft &&
      movedRight &&
      row.notes.filter(note => note !== undefined).length >= 2
    ) {
      costs["JUMP"] += this.WEIGHTS.JUMP / elapsedTime
    }

    if (combinedPlacement.leftToe == -1)
      combinedPlacement.leftToe = combinedPlacement.leftHeel
    if (combinedPlacement.rightToe == -1)
      combinedPlacement.rightToe = combinedPlacement.rightHeel

    // facing backwards gives a bit of bad weight (scaled heavily the further back you angle, so crossovers aren't Too bad; less bad than doublesteps)
    const heelFacing =
      combinedPlacement.leftHeel != -1 && combinedPlacement.rightHeel != -1
        ? this.layout.getXDifference(
            combinedPlacement.leftHeel,
            combinedPlacement.rightHeel
          )
        : 0
    const toeFacing =
      combinedPlacement.leftToe != -1 && combinedPlacement.rightToe != -1
        ? this.layout.getXDifference(
            combinedPlacement.leftToe,
            combinedPlacement.rightToe
          )
        : 0
    const leftFacing =
      combinedPlacement.leftHeel != -1 && combinedPlacement.leftToe != -1
        ? this.layout.getYDifference(
            combinedPlacement.leftHeel,
            combinedPlacement.leftToe
          )
        : 0
    const rightFacing =
      combinedPlacement.rightHeel != -1 && combinedPlacement.rightToe != -1
        ? this.layout.getYDifference(
            combinedPlacement.rightHeel,
            combinedPlacement.rightToe
          )
        : 0
    const heelFacingPenalty = Math.pow(-Math.min(heelFacing, 0), 1.8) * 100
    const toesFacingPenalty = Math.pow(-Math.min(toeFacing, 0), 1.8) * 100
    const leftFacingPenalty = Math.pow(-Math.min(leftFacing, 0), 1.8) * 100
    const rightFacingPenalty = Math.pow(-Math.min(rightFacing, 0), 1.8) * 100

    if (heelFacingPenalty > 0)
      costs["FACING"] += heelFacingPenalty * this.WEIGHTS.FACING
    if (toesFacingPenalty > 0)
      costs["FACING"] += toesFacingPenalty * this.WEIGHTS.FACING
    if (leftFacingPenalty > 0)
      costs["FACING"] += leftFacingPenalty * this.WEIGHTS.FACING
    if (rightFacingPenalty > 0)
      costs["FACING"] += rightFacingPenalty * this.WEIGHTS.FACING

    // spin
    const previousLeftPos = this.layout.averagePoint(
      initialState.combinedColumns.indexOf(Foot.LEFT_HEEL),
      initialState.combinedColumns.indexOf(Foot.LEFT_TOE)
    )
    const previousRightPos = this.layout.averagePoint(
      initialState.combinedColumns.indexOf(Foot.RIGHT_HEEL),
      initialState.combinedColumns.indexOf(Foot.RIGHT_TOE)
    )
    const leftPos = this.layout.averagePoint(
      combinedPlacement.leftHeel,
      combinedPlacement.leftToe
    )
    const rightPos = this.layout.averagePoint(
      combinedPlacement.rightHeel,
      combinedPlacement.rightToe
    )

    if (
      rightPos.x < leftPos.x &&
      previousRightPos.x < previousLeftPos.x &&
      rightPos.y < leftPos.y &&
      previousRightPos.y > previousLeftPos.y
    ) {
      costs["SPIN"] += this.WEIGHTS.SPIN
    }
    if (
      rightPos.x < leftPos.x &&
      previousRightPos.x < previousLeftPos.x &&
      rightPos.y > leftPos.y &&
      previousRightPos.y < previousLeftPos.y
    ) {
      costs["SPIN"] += this.WEIGHTS.SPIN
    }

    // if (
    //   leftPos.y < rightPos.y &&
    //   previousLeftPos.y < previousRightPos.y &&
    //   rightPos.x > leftPos.x &&
    //   previousRightPos.x < previousLeftPos.x
    // ) {
    //   costs["SPIN"] += this.WEIGHTS.SPIN
    // }

    // Footswitch penalty

    // ignore footswitch with 24 or less distance (8th note); penalise slower footswitches based on distance
    if (elapsedTime >= 0.25) {
      // footswitching has no penalty if there's a mine nearby
      if (
        !row.mines.some(x => x !== undefined) &&
        !row.fakeMines.some(x => x !== undefined)
      ) {
        const timeScaled = elapsedTime - 0.25

        for (let i = 0; i < combinedColumns.length; i++) {
          if (
            initialState.combinedColumns[i] == Foot.NONE ||
            resultState.columns[i] == Foot.NONE
          )
            continue

          if (
            initialState.combinedColumns[i] != resultState.columns[i] &&
            !resultState.movedFeet.has(initialState.combinedColumns[i])
          ) {
            costs["FOOTSWITCH"] +=
              Math.pow(timeScaled / 2.0, 2) * this.WEIGHTS.FOOTSWITCH
            break
          }
        }
      }
    }

    if (
      initialState.combinedColumns[0] != resultState.columns[0] &&
      resultState.columns[0] != Foot.NONE &&
      initialState.combinedColumns[0] != Foot.NONE &&
      !resultState.movedFeet.has(initialState.combinedColumns[0])
    ) {
      costs["SIDESWITCH"] += this.WEIGHTS.SIDESWITCH
    }

    if (
      initialState.combinedColumns[3] != resultState.columns[3] &&
      resultState.columns[3] != Foot.NONE &&
      initialState.combinedColumns[3] != Foot.NONE &&
      !resultState.movedFeet.has(initialState.combinedColumns[3])
    ) {
      costs["SIDESWITCH"] += this.WEIGHTS.SIDESWITCH
    }

    // add penalty if jacked

    if (
      (jackedLeft || jackedRight) &&
      (row.mines.some(x => x !== undefined) ||
        row.fakeMines.some(x => x !== undefined))
    ) {
      costs["MISSED_FOOTSWITCH"] += this.WEIGHTS.MISSED_FOOTSWITCH
    }

    // To do: small weighting for swapping heel with toe or toe with heel (both add up)

    // To do: huge weighting for having foot direction opposite of eachother (can't twist one leg 180 degrees)

    // weighting for jacking two notes too close to eachother
    if (elapsedTime < 0.1 && movedLeft != movedRight) {
      const timeScaled = 0.1 - elapsedTime
      if (jackedLeft || jackedRight) {
        costs["JACK"] += (1 / timeScaled - 1 / 0.1) * this.WEIGHTS.JACK
      }
    }

    // To do: weighting for moving a foot a far distance in a fast time
    for (const foot of resultState.movedFeet) {
      // foot == 0 is NO FOOT, so we shouldn't be calculating anything for that
      if (foot == Foot.NONE) {
        continue
      }

      const idxFoot = initialState.combinedColumns.indexOf(foot)
      if (idxFoot == -1) continue
      const dist =
        (Math.sqrt(
          this.layout.getDistanceSq(idxFoot, resultState.columns.indexOf(foot))
        ) *
          this.WEIGHTS.DISTANCE) /
        elapsedTime
      costs["DISTANCE"] += dist
    }

    // TODO: we don't want to bracket things if the other foot is obviously in the way

    // Are we trying to bracket a column that the other foot was just on?

    if (
      resultPlacement.leftBracket &&
      this.doesLeftFootOverlapRight(initialPlacement, resultPlacement)
    ) {
      costs["BADBRACKET"] += this.WEIGHTS.BADBRACKET / elapsedTime
    } else if (
      initialPlacement.leftBracket &&
      this.doesRightFootOverlapLeft(initialPlacement, resultPlacement)
    ) {
      costs["BADBRACKET"] += this.WEIGHTS.BADBRACKET / elapsedTime
    }

    if (
      resultPlacement.rightBracket &&
      this.doesRightFootOverlapLeft(initialPlacement, resultPlacement)
    ) {
      costs["BADBRACKET"] += this.WEIGHTS.BADBRACKET / elapsedTime
    } else if (
      initialPlacement.rightBracket &&
      this.doesLeftFootOverlapRight(initialPlacement, resultPlacement)
    ) {
      costs["BADBRACKET"] += this.WEIGHTS.BADBRACKET / elapsedTime
    }

    resultState.combinedColumns = combinedColumns

    let totalCost = 0
    for (const c in costs) {
      totalCost += costs[c]
    }
    costs["TOTAL"] = totalCost
    return costs
  }

  combineColumns(initialState: State, resultState: State) {
    const combinedColumns: Foot[] = new Array(resultState.columns.length).fill(
      Foot.NONE
    )
    // Merge initial + result position
    for (let i = 0; i < resultState.columns.length; i++) {
      // copy in data from b over the top which overrides it, as long as it's not nothing
      if (resultState.columns[i] != Foot.NONE) {
        combinedColumns[i] = resultState.columns[i]
        continue
      }

      // copy in data from a first, if it wasn't moved
      if (
        initialState.combinedColumns[i] == Foot.LEFT_HEEL ||
        initialState.combinedColumns[i] == Foot.RIGHT_HEEL
      ) {
        if (!resultState.movedFeet.has(initialState.combinedColumns[i])) {
          combinedColumns[i] = initialState.combinedColumns[i]
        }
      } else if (initialState.combinedColumns[i] == Foot.LEFT_TOE) {
        if (
          !resultState.movedFeet.has(Foot.LEFT_TOE) &&
          !resultState.movedFeet.has(Foot.LEFT_HEEL)
        ) {
          combinedColumns[i] = initialState.combinedColumns[i]
        }
      } else if (initialState.combinedColumns[i] == Foot.RIGHT_TOE) {
        if (
          !resultState.movedFeet.has(Foot.RIGHT_TOE) &&
          !resultState.movedFeet.has(Foot.RIGHT_HEEL)
        ) {
          combinedColumns[i] = initialState.combinedColumns[i]
        }
      }
    }
    return combinedColumns
  }

  // Does the left foot in resultPlacement overlap the right foot in initialPlacement?
  doesLeftFootOverlapRight(
    initialPlacement: FootPlacement,
    resultPlacement: FootPlacement
  ): boolean {
    if (
      initialPlacement.rightHeel > -1 &&
      (initialPlacement.rightHeel == resultPlacement.leftHeel ||
        initialPlacement.rightHeel == resultPlacement.leftToe)
    ) {
      return true
    }
    if (
      initialPlacement.rightToe > -1 &&
      (initialPlacement.rightToe == resultPlacement.leftHeel ||
        initialPlacement.rightToe == resultPlacement.leftToe)
    ) {
      return true
    }

    return false
  }

  // Does the right foot in resultPlacement overlap the left foot in initialPlacement?
  doesRightFootOverlapLeft(
    initialPlacement: FootPlacement,
    resultPlacement: FootPlacement
  ): boolean {
    if (
      initialPlacement.leftHeel > -1 &&
      (initialPlacement.leftHeel == resultPlacement.rightHeel ||
        initialPlacement.leftHeel == resultPlacement.rightToe)
    ) {
      return true
    }
    if (
      initialPlacement.leftToe > -1 &&
      (initialPlacement.leftToe == resultPlacement.rightHeel ||
        initialPlacement.leftToe == resultPlacement.rightToe)
    ) {
      return true
    }

    return false
  }

  // Does either foot from resultPlacement overlap the other in initialPlacement?
  doFeetOverlap(
    initialPlacement: FootPlacement,
    resultPlacement: FootPlacement
  ): boolean {
    return (
      this.doesRightFootOverlapLeft(initialPlacement, resultPlacement) ||
      this.doesLeftFootOverlapRight(initialPlacement, resultPlacement)
    )
  }

  footPlacementFromColumns(columns: Foot[]): FootPlacement {
    const placement: FootPlacement = {
      leftHeel: -1,
      leftToe: -1,
      rightHeel: -1,
      rightToe: -1,
      leftBracket: false,
      rightBracket: false,
    }

    for (let i = 0; i < columns.length; i++) {
      switch (columns[i]) {
        case Foot.NONE:
          break
        case Foot.LEFT_HEEL:
          placement.leftHeel = i
          break
        case Foot.LEFT_TOE:
          placement.leftToe = i
          break
        case Foot.RIGHT_HEEL:
          placement.rightHeel = i
          break
        case Foot.RIGHT_TOE:
          placement.rightToe = i
          break
      }
    }

    if (placement.leftHeel > -1 && placement.leftToe > -1) {
      placement.leftBracket = true
    }
    if (placement.rightHeel > -1 && placement.rightToe > -1) {
      placement.rightBracket = true
    }

    return placement
  }
}
