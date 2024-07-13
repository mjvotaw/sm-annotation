import { Container, Sprite } from "pixi.js"
import { WaterfallManager } from "../../../gui/element/WaterfallManager"
import { rgbtoHex } from "../../../util/Color"
import { Options } from "../../../util/Options"
import { EditMode, EditTimingMode } from "../../ChartManager"
import { ChartRenderer, ChartRendererComponent } from "../../ChartRenderer"
import {
  NoteSkin,
  NoteSkinElementCreationOptions,
  NoteSkinElementOptions,
  NoteSkinOptions,
  NoteSkinSprite,
} from "../../gameTypes/noteskin/NoteSkin"
import { NoteSkinRegistry } from "../../gameTypes/noteskin/NoteSkinRegistry"
import { TimingWindow } from "../../play/TimingWindow"
import {
  isHoldDroppedTimingWindow,
  isHoldTimingWindow,
  isMineTimingWindow,
  isStandardMissTimingWindow,
  isStandardTimingWindow,
} from "../../play/TimingWindowCollection"
import { NotedataEntry } from "../../sm/NoteTypes"
import { HoldJudgementContainer } from "./HoldJudgementContainer"
import { NoteContainer } from "./NoteContainer"
import { NoteFlashContainer } from "./NoteFlashContainer"
import { ReceptorContainer } from "./ReceptorContainer"
import { SelectionNoteContainer } from "./SelectionNoteContainer"

export type NotefieldObject = NoteObject | HoldObject

export interface NoteObject extends Container {
  type: "note"
}

interface HoldObjectOptions {
  Active: {
    Body: NoteSkinSprite
    TopCap: NoteSkinSprite
    BottomCap: NoteSkinSprite
    Head: NoteSkinSprite
  }
  Inactive: {
    Body: NoteSkinSprite
    TopCap: NoteSkinSprite
    BottomCap: NoteSkinSprite
    Head: NoteSkinSprite
  }
}

export class HoldObject extends Container {
  type = "hold"

  private active
  private inactive

  private wasActive = false

  private options

  constructor(options: HoldObjectOptions) {
    super()
    const active = new Container()
    const inactive = new Container()

    active.addChild(
      options.Active.BottomCap,
      options.Active.Body,
      options.Active.TopCap,
      options.Active.Head
    )
    inactive.addChild(
      options.Inactive.BottomCap,
      options.Inactive.Body,
      options.Inactive.TopCap,
      options.Inactive.Head
    )

    this.options = options

    active.visible = false

    this.active = active
    this.inactive = inactive

    this.addChild(inactive, active)
  }

  setActive(active: boolean) {
    if (this.wasActive != active) {
      this.wasActive = active
      this.active.visible = active
      this.inactive.visible = !active
    }
  }

  setBrightness(brightness: number) {
    const states = ["Active", "Inactive"] as const
    const items = ["Body", "TopCap", "BottomCap"] as const
    for (const state of states) {
      for (const item of items) {
        if ("tint" in this.options[state][item]) {
          ;(this.options[state][item] as Sprite).tint = rgbtoHex(
            brightness * 255,
            brightness * 255,
            brightness * 255
          )
        }
      }
    }
  }

  setLength(length: number) {
    const states = ["Active", "Inactive"] as const
    for (const state of states) {
      this.options[state].Body.height = length
      this.options[state].Body.y = length
      this.options[state].BottomCap.y = length
      this.options[state].BottomCap.scale.y = length < 0 ? -0.5 : 0.5
    }
  }
}

export class Notefield extends Container implements ChartRendererComponent {
  readonly noteskinOptions!: NoteSkinOptions
  readonly noteskin!: NoteSkin
  readonly gameType
  readonly renderer
  private readonly receptors!: ReceptorContainer
  private readonly notes!: NoteContainer
  private readonly selectionNotes!: SelectionNoteContainer
  private readonly flashes!: NoteFlashContainer
  private readonly holdJudges!: HoldJudgementContainer
  private ghostNote?: NotefieldObject
  private ghostNoteEntry?: NotedataEntry

  private readonly columnX: number[] = []

  constructor(renderer: ChartRenderer) {
    super()

    this.renderer = renderer
    this.gameType = renderer.chart.gameType
    const noteskinOptions = NoteSkinRegistry.getNoteSkin(
      this.gameType,
      Options.chart.noteskin[renderer.chart.gameType.id]
    )

    if (!noteskinOptions) {
      WaterfallManager.createFormatted(
        "Couldn't find an available noteskin!",
        "error"
      )
      return
    }

    // Calculate column x positions
    let accumulatedWidth = 0

    for (let colNum = 0; colNum < this.gameType.numCols; colNum++) {
      const colWidth = this.gameType.columnWidths[colNum]
      this.columnX.push(
        accumulatedWidth - this.gameType.notefieldWidth / 2 + colWidth / 2
      )
      accumulatedWidth += colWidth
    }

    this.noteskinOptions = noteskinOptions
    this.noteskin = new NoteSkin(this.renderer, noteskinOptions)

    this.receptors = new ReceptorContainer(this)
    this.flashes = new NoteFlashContainer(this)
    this.notes = new NoteContainer(this)
    this.selectionNotes = new SelectionNoteContainer(this)

    this.holdJudges = new HoldJudgementContainer(this)
    this.addChild(
      this.receptors,
      this.notes,
      this.selectionNotes,
      this.flashes,
      this.holdJudges
    )
  }

  setGhostNote(note?: NotedataEntry): void {
    this.ghostNote?.destroy()
    this.ghostNote = undefined
    this.ghostNoteEntry = note
    if (!note) return
    this.ghostNote = this.createNote(note)
    this.addChildAt(this.ghostNote, 1)
    this.ghostNote.alpha = 0.4
    this.ghostNote.x = this.getColumnX(note.col)
    this.ghostNote.y = this.renderer.getYPosFromBeat(note.beat)
  }

  getElement(
    element: NoteSkinElementOptions,
    options: Partial<NoteSkinElementCreationOptions> = {}
  ): NoteSkinSprite {
    return this.noteskin.getElement(element, options)
  }

  update(firstBeat: number, lastBeat: number): void {
    this.noteskin.update(this.renderer)
    this.receptors.update()
    this.flashes.update()
    this.notes.update(firstBeat, lastBeat)
    this.selectionNotes.update(firstBeat, lastBeat)
    this.holdJudges.update()

    if (this.ghostNote) {
      this.ghostNote.y = this.renderer.getYPosFromBeat(
        this.ghostNoteEntry!.beat
      )
      this.ghostNote.visible =
        Options.chart.mousePlacement &&
        this.renderer.chartManager.getMode() == EditMode.Edit &&
        this.renderer.chartManager.editTimingMode == EditTimingMode.Off &&
        this.ghostNoteEntry!.beat >= firstBeat &&
        this.ghostNoteEntry!.beat <= lastBeat &&
        this.ghostNoteEntry!.beat >= 0
    }
  }

  onJudgement(col: number, judge: TimingWindow): void {
    // this.flashes.createNoteFlash(col, judge)
    this.holdJudges.addJudge(col, judge)
    if (isStandardTimingWindow(judge)) {
      this.noteskin.broadcast({
        type: "hit",
        judgement: judge,
        columnName: this.getColumnName(col),
        columnNumber: col,
      })
    }
    if (isHoldTimingWindow(judge)) {
      this.noteskin.broadcast({
        type: "held",
        columnName: this.getColumnName(col),
        columnNumber: col,
      })
    }
    if (isHoldDroppedTimingWindow(judge)) {
      this.noteskin.broadcast({
        type: "letgo",
        columnName: this.getColumnName(col),
        columnNumber: col,
      })
    }
    if (isStandardMissTimingWindow(judge)) {
      this.noteskin.broadcast({
        type: "miss",
        judgement: judge,
        columnName: this.getColumnName(col),
        columnNumber: col,
      })
    }
    if (isMineTimingWindow(judge)) {
      this.noteskin.broadcast({
        type: "hitmine",
        columnName: this.getColumnName(col),
        columnNumber: col,
      })
    }
  }

  startPlay(): void {}

  endPlay(): void {
    for (let i = 0; i < this.gameType.numCols; i++) {
      this.noteskin.broadcast({
        type: "holdoff",
        columnName: this.getColumnName(i),
        columnNumber: i,
      })
      this.noteskin.broadcast({
        type: "lift",
        columnName: this.getColumnName(i),
        columnNumber: i,
      })
    }
  }

  press(col: number): void {
    this.noteskin.broadcast({
      type: "press",
      columnName: this.getColumnName(col),
      columnNumber: col,
    })
  }

  lift(col: number): void {
    this.noteskin.broadcast({
      type: "lift",
      columnName: this.getColumnName(col),
      columnNumber: col,
    })
  }

  ghostTap(col: number): void {
    this.noteskin.broadcast({
      type: "ghosttap",
      columnName: this.getColumnName(col),
      columnNumber: col,
    })
  }

  activateHold(col: number): void {
    this.noteskin.broadcast({
      type: "holdon",
      columnName: this.getColumnName(col),
      columnNumber: col,
    })
  }

  releaseHold(col: number): void {
    this.noteskin.broadcast({
      type: "holdoff",
      columnName: this.getColumnName(col),
      columnNumber: col,
    })
  }

  getColumnX(col: number) {
    return this.columnX[col] ?? 0
  }

  getColumnWidth(col: number) {
    return this.gameType.columnWidths[col]
  }

  getColumnName(col: number) {
    return this.gameType.columnNames[col]
  }

  createNote(note: NotedataEntry): NotefieldObject {
    const ns = this.noteskin
    const col = this.getColumnName(note.col)
    const opts = { note, columnName: col, columnNumber: note.col }
    switch (note.type) {
      case "Tap":
      case "Lift":
      case "Fake":
      case "Mine": {
        const element = ns.getElement(
          { element: note.type, columnName: col, columnNumber: note.col },
          opts
        ) as NotefieldObject
        element.type = "note"
        return element
      }
      case "Hold":
      case "Roll": {
        return new HoldObject({
          Active: {
            Body: ns.getElement(
              {
                element: `${note.type} Active Body`,
                columnName: col,
                columnNumber: note.col,
              },
              opts
            ),
            TopCap: ns.getElement(
              {
                element: `${note.type} Active TopCap`,
                columnName: col,
                columnNumber: note.col,
              },
              opts
            ),
            BottomCap: ns.getElement(
              {
                element: `${note.type} Active BottomCap`,
                columnName: col,
                columnNumber: note.col,
              },
              opts
            ),
            Head: ns.getElement(
              {
                element: `${note.type} Active Head`,
                columnName: col,
                columnNumber: note.col,
              },
              opts
            ),
          },
          Inactive: {
            Body: ns.getElement(
              {
                element: `${note.type} Inactive Body`,
                columnName: col,
                columnNumber: note.col,
              },
              opts
            ),
            TopCap: ns.getElement(
              {
                element: `${note.type} Inactive TopCap`,
                columnName: col,
                columnNumber: note.col,
              },
              opts
            ),
            BottomCap: ns.getElement(
              {
                element: `${note.type} Inactive BottomCap`,
                columnName: col,
                columnNumber: note.col,
              },
              opts
            ),
            Head: ns.getElement(
              {
                element: `${note.type} Inactive Head`,
                columnName: col,
                columnNumber: note.col,
              },
              opts
            ),
          },
        })
      }
    }
  }
}
