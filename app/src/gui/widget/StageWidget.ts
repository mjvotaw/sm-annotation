import {
  Container,
  Graphics,
  IPointData,
  ObservablePoint,
  Sprite,
  Texture,
} from "pixi.js"
import { Widget } from "./Widget"
import { WidgetManager } from "./WidgetManager"
import { EventHandler } from "../../util/EventHandler"
import stageArrowUrl from "../../../assets/stage/StageArrow.png"
import footUrl from "../../../assets/stage/LeftFoot.png"
import { HoldNotedataEntry, NotedataEntry } from "../../chart/sm/NoteTypes"
import { Options } from "../../util/Options"

export class StageWidget extends Widget {
  stage: Sprite = new Sprite(Texture.WHITE)
  arrowFlashes: Container[] = []

  leftFoot: Container = new Container()
  rightFoot: Container = new Container()

  private lastBeatCrossed: number = -1
  private lastNoteDataIndex: number = 0
  private stageLightsBeatsLeft: number[] = []

  private LIGHTS_FALLOFF_BEATS: number = 0.125
  private LIGHTS_LOOKAHEAD_BEATS: number = 0.01

  private MIN_ROTATION: number = -0.5 * Math.PI
  private MAX_ROTATION: number = 0.5 * Math.PI

  private lastUpdateTime: number = 0

  private LEFT_DEFAULT_POSITION: FootPositionAtTime = {
    x: 100,
    y: 150,
    rotation: 0,
    beat: 0,
  }
  private RIGHT_DEFAULT_POSITION: FootPositionAtTime = {
    x: 200,
    y: 150,
    rotation: 0,
    beat: 0,
  }

  private leftFootPosition: FootPositionAtTime = {
    x: 100,
    y: 150,
    rotation: 0,
    beat: 0,
  }
  private rightFootPosition: FootPositionAtTime = {
    x: 200,
    y: 150,
    rotation: 0,
    beat: 0,
  }

  constructor(manager: WidgetManager) {
    super(manager)
    this.visible = false

    this.stage.tint = 0x525252
    this.stage.width = 300
    this.stage.height = 300
    this.stage.x = 0
    this.stage.y = 0
    this.scale.set(0.5)

    this.addChild(this.stage)
    this.buildDanceStage()
    this.buildFeet()
    this.setupEventHandlers()
  }

  update() {
    let isVisible = false
    if (this.manager.chartManager.chartView && Options.general.showDanceStage) {
      isVisible = true
    }
    this.visible = isVisible

    this.x = (this.manager.app.renderer.screen.width / 2) * -1 + 200
    this.y = (this.manager.app.renderer.screen.height / 2) * -1 + 200
    if (!isVisible) {
      return
    }

    const showFeet = window.Parity?.getIsEnabled() || false

    const currentTime = new Date().getTime()
    if (this.lastUpdateTime == 0) {
      this.lastUpdateTime = currentTime
      return
    }

    const currentBeat = this.manager.chartManager.getBeat()
    const beatDelta = currentBeat - this.lastBeatCrossed
    if (beatDelta != 0) {
      this.updateStage(currentBeat, showFeet)

      for (let i = 0; i < this.arrowFlashes.length; i++) {
        if (this.stageLightsBeatsLeft[i] > 0) {
          this.arrowFlashes[i].alpha = 1
        } else {
          this.arrowFlashes[i].alpha = Math.max(
            0,
            this.arrowFlashes[i].alpha - beatDelta * 3
          )
        }
      }

      this.leftFoot.visible = showFeet
      this.rightFoot.visible = showFeet
      if (showFeet) {
        this.leftFoot.position.set(
          this.leftFootPosition.x,
          this.leftFootPosition.y
        )
        this.leftFoot.rotation = this.leftFootPosition.rotation
        this.rightFoot.position.set(
          this.rightFootPosition.x,
          this.rightFootPosition.y
        )
        this.rightFoot.rotation = this.rightFootPosition.rotation
      }
    }
    this.lastUpdateTime = currentTime
    this.lastBeatCrossed = currentBeat
  }

  private setupEventHandlers() {
    EventHandler.on("chartLoaded", () => {
      this.reset()
    })

    EventHandler.on("playbackStop", () => {
      this.stageLightsBeatsLeft = [0, 0, 0, 0]
    })
    EventHandler.on("playbackStart", () => {})
  }

  private updateStage(currentBeat: number, showFeet: boolean) {
    // TODO: make this work for other layouts

    if (this.manager.chartManager.loadedChart == undefined) {
      return
    }

    const notes = this.manager.chartManager.loadedChart.getNotedata()
    let beatDelta = currentBeat - this.lastBeatCrossed
    if (notes.length == 0) {
      return
    }

    // If the user scrolled backwards, reset lastNoteDataIndex to the note just before the current beat
    if (currentBeat < this.lastBeatCrossed) {
      this.lastNoteDataIndex = Math.max(
        0,
        notes.findIndex(n => n.beat >= currentBeat - 1) - 1
      )
      beatDelta = 0
    }

    // Update the amount of time left to display previous note flashes
    for (let i = 0; i < this.stageLightsBeatsLeft.length; i++) {
      this.stageLightsBeatsLeft[i] = Math.max(
        0,
        this.stageLightsBeatsLeft[i] - beatDelta
      )
    }

    let leftHeel: NotedataEntry | undefined
    let leftToe: NotedataEntry | undefined
    let rightHeel: NotedataEntry | undefined
    let rightToe: NotedataEntry | undefined

    if (currentBeat <= notes.at(-1)!.beat) {
      for (let index = this.lastNoteDataIndex; index < notes.length; index++) {
        const note = notes[index]

        if (note.beat > currentBeat + this.LIGHTS_LOOKAHEAD_BEATS) {
          this.lastNoteDataIndex = index
          break
        }
        if (note.fake) {
          continue
        }

        if (["Tap", "Hold", "Roll"].includes(note.type)) {
          if (note.type == "Hold" || note.type == "Roll") {
            this.stageLightsBeatsLeft[notes[index].col] = (
              note as HoldNotedataEntry
            ).hold
          } else {
            this.stageLightsBeatsLeft[notes[index].col] =
              this.LIGHTS_FALLOFF_BEATS
          }

          if (showFeet && note.parity != undefined) {
            switch (note.parity) {
              case "L":
                leftHeel = note
                break
              case "l":
                leftToe = note
                break
              case "R":
                rightHeel = note
                break
              case "r":
                rightToe = note
                break
            }
          }
        }
      }
    }

    if (showFeet) {
      const newLeftPos: FootPositionAtTime = { ...this.leftFootPosition }
      const newRightPos: FootPositionAtTime = { ...this.rightFootPosition }

      if (leftHeel && leftToe) {
        const leftPos = this.midpoint(
          this.arrowFlashes[leftHeel.col].position,
          this.arrowFlashes[leftToe.col].position
        )
        newLeftPos.x = leftPos.x
        newLeftPos.y = leftPos.y
        newLeftPos.beat = leftHeel.beat
        newLeftPos.rotation = this.getBracketAngle(
          this.arrowFlashes[leftHeel.col].position,
          this.arrowFlashes[leftToe.col].position
        )
      } else if (leftHeel) {
        const leftPos = this.arrowFlashes[leftHeel.col].position
        newLeftPos.x = leftPos.x
        newLeftPos.y = leftPos.y
        newLeftPos.beat = leftHeel.beat
      }

      if (rightHeel && rightToe) {
        const rightPos = this.midpoint(
          this.arrowFlashes[rightHeel.col].position,
          this.arrowFlashes[rightToe.col].position
        )
        newRightPos.x = rightPos.x
        newRightPos.y = rightPos.y
        newRightPos.beat = rightHeel.beat

        newRightPos.rotation = this.getBracketAngle(
          this.arrowFlashes[rightHeel.col].position,
          this.arrowFlashes[rightToe.col].position
        )
      } else if (rightHeel) {
        const rightPos = this.arrowFlashes[rightHeel.col].position
        newRightPos.x = rightPos.x
        newRightPos.y = rightPos.y
        newRightPos.beat = rightHeel.beat
      }

      if (leftHeel && !leftToe) {
        const angle = Math.max(
          this.MIN_ROTATION,
          Math.min(
            this.MAX_ROTATION,
            this.getFeetAngle(newLeftPos, newRightPos)
          )
        )
        newLeftPos.rotation = angle
      }

      if (rightHeel && !rightToe) {
        const angle = Math.max(
          this.MIN_ROTATION,
          Math.min(
            this.MAX_ROTATION,
            this.getFeetAngle(newLeftPos, newRightPos)
          )
        )
        newRightPos.rotation = angle
      }

      this.leftFootPosition = newLeftPos
      this.rightFootPosition = newRightPos
    }
  }

  private reset() {
    this.lastBeatCrossed = -1
    this.lastNoteDataIndex = 0
    for (let i = 0; i < this.stageLightsBeatsLeft.length; i++) {
      this.stageLightsBeatsLeft[i] = 0
    }

    this.leftFootPosition = { ...this.LEFT_DEFAULT_POSITION }
    this.rightFootPosition = { ...this.RIGHT_DEFAULT_POSITION }
  }

  private buildDanceStage() {
    // TODO: change stages when layout changes

    const leftArrow = this.makeArrow(0, 100, 0, 0.5)
    const downArrow = this.makeArrow(100, 200, 1.5, 0.5)
    const upArrow = this.makeArrow(100, 0, 0.5, 0.5)
    const rightArrow = this.makeArrow(200, 100, 1, 0.5)
    this.addChild(leftArrow)
    this.addChild(downArrow)
    this.addChild(upArrow)
    this.addChild(rightArrow)

    const leftArrowFlash = this.makeArrow(0, 100, 0, 0)
    const downArrowFlash = this.makeArrow(100, 200, 1.5, 0)
    const upArrowFlash = this.makeArrow(100, 0, 0.5, 0)
    const rightArrowFlash = this.makeArrow(200, 100, 1, 0)
    this.addChild(leftArrowFlash)
    this.addChild(downArrowFlash)
    this.addChild(upArrowFlash)
    this.addChild(rightArrowFlash)

    this.arrowFlashes = [
      leftArrowFlash,
      downArrowFlash,
      upArrowFlash,
      rightArrowFlash,
    ]
    this.stageLightsBeatsLeft = [0, 0, 0, 0]
  }

  private makeArrow(
    x: number,
    y: number,
    rotation: number,
    alpha: number
  ): Container {
    const arrowSprite = Sprite.from(stageArrowUrl, { width: 256, height: 256 })
    arrowSprite.width = 100
    arrowSprite.height = 100
    arrowSprite.anchor.set(0.5)
    arrowSprite.rotation = rotation * Math.PI

    const arrowContainer = new Container()
    arrowContainer.x = x + 50
    arrowContainer.y = y + 50
    arrowContainer.addChild(arrowSprite)
    arrowContainer.alpha = alpha
    return arrowContainer
  }

  private buildFeet() {
    // I don't think I like graphics programming

    const footHeightScale = 100 / 256
    const leftFootSprite = Sprite.from(footUrl, { width: 111, height: 276 })
    leftFootSprite.scale.set(footHeightScale)

    const rightFootSprite = Sprite.from(footUrl, { width: 111, height: 276 })
    rightFootSprite.scale.set(footHeightScale)
    rightFootSprite.anchor.x = 1
    rightFootSprite.scale.x *= -1

    const leftFootColor = new Graphics()
    leftFootColor.beginFill(0x0390fc)
    leftFootColor.drawRect(0, 0, 43, 107)
    leftFootColor.endFill()

    leftFootColor.mask = leftFootSprite

    const rightFootColor = new Graphics()
    rightFootColor.beginFill(0xfcad03)
    rightFootColor.drawRect(0, 0, 43, 107)
    rightFootColor.endFill()

    rightFootColor.mask = rightFootSprite

    this.leftFoot.addChild(leftFootColor)
    this.leftFoot.addChild(leftFootSprite)

    this.rightFoot.addChild(rightFootColor)
    this.rightFoot.addChild(rightFootSprite)

    this.leftFoot.pivot.set(20, 53)
    this.rightFoot.pivot.set(20, 53)

    this.addChild(this.leftFoot)
    this.addChild(this.rightFoot)

    this.leftFoot.visible = false
    this.rightFoot.visible = false
  }

  // Math stuff

  private midpoint(p1: ObservablePoint, p2: ObservablePoint): IPointData {
    return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
  }

  private getBracketAngle(p1: IPointData, p2: IPointData): number {
    if (p1.y == p2.y) {
      return 0
    }
    const top = p1.y < p2.y ? p1 : p2
    const bottom = p1.y > p2.y ? p1 : p2

    const dy = Math.abs(bottom.y - top.y)
    const dx = bottom.x - top.x
    return Math.atan2(dy, dx) - Math.PI * 0.5
  }

  private getFeetAngle(
    left: FootPositionAtTime,
    right: FootPositionAtTime
  ): number {
    const dy = right.y - left.y
    const dx = right.x - left.x

    // Right foot is on left side of stage, and on the same "row"
    // we need to make sure it's pointing in a sane direction
    if (dy == 0 && dx < 0) {
      // whichever foot was on the pad first gets the priority, as it's
      // probably pointing in the right direction
      if (left.beat < right.beat) {
        return left.rotation
      } else {
        return right.rotation
      }
    }
    return Math.atan2(dy, dx)
  }
}

interface FootPositionAtTime {
  x: number
  y: number
  rotation: number
  beat: number
}
