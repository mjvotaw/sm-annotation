import { ActionHistory } from "../../util/ActionHistory"
import { EventHandler } from "../../util/EventHandler"
import { bsearch, clamp, roundDigit } from "../../util/Util"
import { Chart } from "./Chart"
import {
  AttackTimingEvent,
  BeatTimingCache,
  BeatTimingEvent,
  BeatTimingEventProperty,
  BPMTimingEvent,
  ScrollCacheTimingEvent,
  SpeedTimingEvent,
  StopTimingEvent,
  TimingEvent,
  TimingEventBase,
  TimingEventProperty,
  TimingProperty,
  TIMING_EVENT_NAMES,
  WarpTimingEvent,
} from "./TimingTypes"

type TimingPropertyCollection = {
  [key in TimingEvent["type"]]?: Extract<TimingEvent, { type: key }>[]
}

type TimingCache = {
  events: TimingPropertyCollection
  beatTiming?: BeatTimingCache[]
  effectiveBeatTiming?: ScrollCacheTimingEvent[]
  speeds?: SpeedTimingEvent[]
  sortedEvents?: TimingEvent[]
  warpedBeats: Record<number, boolean>
}

export class TimingData {
  private _fallback?: TimingData
  private _cache: TimingCache = {
    events: {},
    warpedBeats: {},
  }
  private _chart?: Chart
  events: TimingPropertyCollection = {}
  offset?: number

  constructor(fallbackTimingData?: TimingData, chart?: Chart) {
    this._fallback = fallbackTimingData
    this._chart = chart
  }

  parse(type: TimingProperty, data: string) {
    if (type == "OFFSET") {
      this.offset = parseFloat(data)
      return
    }

    this.events[type] ||= []

    let entries = data.replaceAll(/[\n\r\t]/g, "").split(",")
    if (type == "ATTACKS") entries = [data.replaceAll(/[\n\r\t]/g, "")]
    for (const str of entries) {
      if (type == "ATTACKS") {
        let match
        const regex = /TIME=([\d.]+):(END|LEN)=([\d.]+):MODS=([^:]+)/g
        while ((match = regex.exec(str)) != null) {
          const event: AttackTimingEvent = {
            type: "ATTACKS",
            second: parseFloat(match[1]),
            endType: match[2] as "END" | "LEN",
            value: parseFloat(match[3]),
            mods: match[4],
          }
          this._insert("ATTACKS", event, false)
        }
        return
      }
      const temp = str.split("=")
      if (temp.length < 2) continue

      let event: TimingEvent | undefined
      switch (type) {
        case "BPMS":
        case "STOPS":
        case "WARPS":
        case "DELAYS":
        case "SCROLLS":
        case "TICKCOUNTS":
        case "FAKES":
          event = {
            type: type,
            beat: parseFloat(temp[0]),
            value: parseFloat(temp[1]),
          }
          break
        case "LABELS":
          event = {
            type: type,
            beat: parseFloat(temp[0]),
            value: temp[1],
          }
          break
        case "SPEEDS":
          event = {
            type: type,
            beat: parseFloat(temp[0]),
            value: parseFloat(temp[1]),
            delay: parseFloat(temp[2]),
            unit: temp[3] == "0" ? "B" : "T",
          }
          break
        case "TIMESIGNATURES":
          event = {
            type: type,
            beat: parseFloat(temp[0]),
            upper: parseInt(temp[1]),
            lower: parseInt(temp[2]),
          }
          break
        case "COMBOS":
          event = {
            type: type,
            beat: parseFloat(temp[0]),
            hitMult: parseInt(temp[1]),
            missMult: parseInt(temp[2] ?? temp[1]),
          }
          break
        case "BGCHANGES":
        case "FGCHANGES":
          event = {
            type: type,
            beat: parseFloat(temp[0]),
            file: temp[1],
            updateRate: parseFloat(temp[2]),
            crossFade: temp[3] == "1",
            stretchRewind: temp[4] == "1",
            stretchNoLoop: temp[5] == "1",
            effect: temp[6],
            file2: temp[7],
            transition: temp[8],
            color1: temp[9],
            color2: temp[10],
          }
      }
      this._insert(type, event!, false)
    }
  }

  private _insert(
    type: TimingEventProperty,
    event: TimingEvent,
    doCache?: boolean
  ) {
    this.binsert(type, event)
    if (doCache ?? true) this.reloadCache(type)
  }

  delete(songTiming: boolean, type: TimingEventProperty, time: number) {
    const target = songTiming ? this : this._fallback!
    if (!target.events[type]) return
    time = roundDigit(time, 3)
    const i = target.bindex(type, { type, beat: time, second: time })
    if (i == -1) return
    if (i == 0 && type == "BPMS") return
    const event = target.events[type]![i]
    ActionHistory.instance.run({
      action: () => {
        target._delete(true, event)
        target.reloadCache(type)
        if (this != target) this.reloadCache(type)
        EventHandler.emit("timingModified")
      },
      undo: () => {
        target._insert(event.type, event)
        target.reloadCache(type)
        if (this != target) this.reloadCache(type)
        EventHandler.emit("timingModified")
      },
    })
  }

  private _delete(songTiming: boolean, event: TimingEvent, doCache?: boolean) {
    if (!songTiming) {
      this._fallback!._delete(true, event, doCache)
      if (doCache ?? true) this.reloadCache(event.type)
      return
    }
    if (!this.events[event.type]) return
    const i = this.bindex(event.type, event)
    if (i > -1) {
      this.events[event.type]!.splice(i, 1)
      if (doCache ?? true) this.reloadCache(event.type)
    }
  }

  private isDuplicate<Event extends TimingEvent>(
    event: Event,
    properties: Event
  ): boolean {
    if (
      ["STOPS", "WARPS", "DELAYS", "FAKES", "BGCHANGES", "FGCHANGES"].includes(
        event.type
      )
    )
      return false
    if (properties.type != event.type) return false
    switch (event.type) {
      case "BPMS":
      case "SCROLLS":
      case "TICKCOUNTS":
      case "LABELS":
      case "SPEEDS":
        return properties.type == event.type && event.value == properties.value
      case "TIMESIGNATURES":
        return (
          properties.type == event.type &&
          event.upper == properties.upper &&
          event.lower == properties.lower
        )
      case "COMBOS":
        return (
          properties.type == event.type &&
          event.hitMult == properties.hitMult &&
          event.missMult == properties.missMult
        )
      default:
        return false
    }
  }

  insert<Type extends TimingProperty>(
    songTiming: boolean,
    type: Type,
    properties: Partial<Extract<TimingEvent, { type: Type }>>,
    beat: number
  ): void
  insert(
    songTiming: boolean,
    type: "OFFSET",
    properties: number,
    beat?: number
  ): void
  insert<Type extends TimingProperty>(
    songTiming: boolean,
    type: Type,
    properties: Partial<Extract<TimingEvent, { type: Type }>> | number,
    beat?: number
  ) {
    if (Object.keys(properties).length == 0) return
    const target = songTiming ? this : this._fallback!
    if (type == "OFFSET") {
      target.offset = properties as number
      this.reloadCache("OFFSET")

      return
    }
    if (!target.events[type satisfies TimingEventProperty]) {
      if (songTiming) {
        target.events[type satisfies TimingEventProperty] = JSON.parse(
          JSON.stringify(
            this._fallback!.events[type satisfies TimingEventProperty]
          )
        )
      } else {
        target.events[type satisfies TimingEventProperty] = []
      }
    }

    beat = roundDigit(beat!, 3)
    const eventOnBeat = target.getTimingEventAtBeat(type, beat)
    const newEvent: Partial<TimingEvent> = { type: type, beat: beat }
    const toDelete: TimingEvent[] = []
    const toAdd: TimingEvent[] = []
    // Remove old event if same beat
    if (eventOnBeat?.beat == beat) {
      toDelete.push(eventOnBeat)
    }
    //Add new event if it doesn't match the previous one
    const previousEvent = target.getTimingEventAtBeat(type, beat - 0.001)
    Object.assign(newEvent, properties)
    if (
      !previousEvent ||
      !this.isDuplicate(previousEvent, newEvent as TimingEvent)
    ) {
      toAdd.push(newEvent as TimingEvent)
    }
    //Remove the next event if it matches the new event
    const events = this.getTimingData(type)
    const nextEvent = events[target.searchCache(events, "beat", beat) + 1]
    console.log(nextEvent)
    if (nextEvent) {
      if (this.isDuplicate(newEvent as TimingEvent, nextEvent)) {
        toDelete.push(nextEvent)
      }
    }
    ActionHistory.instance.run({
      action: () => {
        for (const event of toDelete) {
          this._delete(songTiming, event)
        }
        for (const event of toAdd) {
          target._insert(type, event)
        }
        this.reloadCache(type)
        EventHandler.emit("timingModified")
        EventHandler.emit("chartModified")
      },
      undo: () => {
        for (const event of toAdd) {
          this._delete(songTiming, event)
        }
        for (const event of toDelete) {
          target._insert(type, event)
        }
        this.reloadCache(type)
        EventHandler.emit("timingModified")
        EventHandler.emit("chartModified")
      },
    })
  }

  private buildBeatTimingDataCache() {
    const cache: BeatTimingCache[] = []
    let events: BeatTimingEvent[] = this.getTimingData(
      "BPMS",
      "STOPS",
      "WARPS",
      "DELAYS"
    )
    events = events.concat(
      this.getTimingData("WARPS").map((event: WarpTimingEvent) => ({
        type: "WARP_DEST",
        beat: event.beat + event.value,
        value: event.value,
      }))
    )

    const ordering = ["WARP_DEST", "BPMS", "STOPS", "WARPS", "DELAYS"]
    events.sort((a, b) => {
      if (a.beat == b.beat) {
        return ordering.indexOf(a.type) - ordering.indexOf(b.type)
      }
      return a.beat - b.beat
    })

    const offset = this.getTimingData("OFFSET")

    cache.push({
      beat: 0,
      secondBefore: -offset,
      secondOf: -offset,
      secondAfter: -offset,
      secondClamp: -offset,
      bpm: this.getTimingData("BPMS")[0]?.value ?? 120,
      warped: false,
    })
    for (const event of events) {
      if (cache.at(-1)?.beat != event.beat) {
        cache.at(-1)!.secondClamp = Math.max(
          Math.max(
            cache.at(-2)?.secondClamp ?? -offset,
            cache.at(-2)?.secondAfter ?? -offset
          ),
          cache.at(-1)!.secondBefore
        )

        let timeElapsed =
          ((event.beat - cache.at(-1)!.beat) * 60) / cache.at(-1)!.bpm
        if (cache.at(-1)!.warped) timeElapsed = 0

        cache.push({
          beat: event.beat,
          secondBefore: cache.at(-1)!.secondAfter + timeElapsed,
          secondOf: cache.at(-1)!.secondAfter + timeElapsed,
          secondAfter: cache.at(-1)!.secondAfter + timeElapsed,
          secondClamp: 0,
          bpm: cache.at(-1)!.bpm,
          warped: cache.at(-1)!.warped,
        })
      }
      if (event.type == "WARPS") cache.at(-1)!.warped = true
      if (event.type == "WARP_DEST") cache.at(-1)!.warped = false
      if (event.type == "BPMS") cache.at(-1)!.bpm = event.value
      if (event.type == "STOPS") {
        cache.at(-1)!.secondAfter += event.value
      }
      if (event.type == "DELAYS") {
        cache.at(-1)!.secondOf += event.value
        cache.at(-1)!.secondAfter += event.value
      }
    }

    cache.at(-1)!.secondClamp = Math.max(
      cache.at(-2)?.secondClamp ?? -offset,
      cache.at(-1)!.secondBefore
    )

    this._cache.beatTiming = cache
    this._cache.warpedBeats = {}
  }

  private buildEffectiveBeatTimingDataCache() {
    const cache: ScrollCacheTimingEvent[] = this.getTimingData("SCROLLS")
    let effBeat = 0
    if (cache.length == 0) {
      this._cache.effectiveBeatTiming = []
      return
    }
    effBeat = cache[0].beat
    for (let i = 0; i < cache.length - 1; i++) {
      const event = cache[i]
      const beats = cache[i + 1].beat - event.beat
      event.effectiveBeat = effBeat
      effBeat += event.value * beats
    }
    cache[cache.length - 1].effectiveBeat = effBeat
    this._cache.effectiveBeatTiming = cache
  }

  private buildSpeedsTimingDataCache() {
    const cache: SpeedTimingEvent[] = this.getTimingData("SPEEDS").map(e => ({
      type: e.type,
      beat: e.beat,
      value: e.value,
      delay: e.delay,
      unit: e.unit,
      second: this.getSeconds(e.beat),
    }))
    this._cache.speeds = cache
  }

  private buildTimingDataCache() {
    TIMING_EVENT_NAMES.forEach(type => {
      this._cache.events[type] = (this.events[type] ??
        this._fallback?.events[type] ??
        []) as any
    })
    this._cache.sortedEvents = TIMING_EVENT_NAMES.map(
      type => this._cache.events[type]!
    )
      .flat()
      .sort((a, b) => a.beat! - b.beat!)
    for (const event of this._cache.sortedEvents) {
      if (event.type == "DELAYS")
        event.second = this.getSeconds(event.beat, "before")
      else event.second = this.getSeconds(event.beat!)
      if (event.type == "ATTACKS") event.beat = this.getBeat(event.second)
    }
  }

  private searchCache<Type, Prop extends keyof Type>(
    cache: Type[],
    property: Prop,
    value: number
  ) {
    return bsearch(cache, value, a => a[property] as number)
  }

  getBeat(seconds: number): number {
    if (!isFinite(seconds)) return 0
    if (this._cache.beatTiming == undefined) this.buildBeatTimingDataCache()
    if (seconds + this.getTimingData("OFFSET") < 0) {
      return (
        ((seconds + this.getTimingData("OFFSET")) *
          this._cache.beatTiming![0].bpm) /
        60
      )
    }
    const cache = this._cache.beatTiming!
    const i = this.searchCache(cache, "secondClamp", seconds)
    const event = cache[i]
    const timeElapsed = Math.max(0, seconds - event.secondAfter)
    return event.beat + (timeElapsed * event.bpm) / 60
  }

  getSeconds(
    beat: number,
    option?: "noclamp" | "before" | "after" | ""
  ): number {
    option ||= ""
    if (!isFinite(beat)) return 0
    if (this._cache.beatTiming == undefined) this.buildBeatTimingDataCache()
    const flooredBeat = Math.floor(beat * 1000) / 1000
    if (beat <= 0) {
      const curbpm = this._cache.beatTiming![0].bpm
      return -this.getTimingData("OFFSET") + (beat * 60) / curbpm
    }
    const cache = this._cache.beatTiming!
    const i = this.searchCache(cache, "beat", flooredBeat)
    const event = cache[i]
    if (event.beat == flooredBeat) {
      if (option == "noclamp" || option == "") return event.secondOf
      if (option == "before") return event.secondBefore
      if (option == "after") return event.secondAfter
    }
    const beatsElapsed = beat - event.beat
    let timeElapsed = (beatsElapsed * 60) / event.bpm
    if (event.warped) timeElapsed = 0
    if (option == "noclamp") return event.secondAfter + timeElapsed
    return Math.max(event.secondClamp, event.secondAfter + timeElapsed)
  }

  isBeatWarped(beat: number): boolean {
    if (!isFinite(beat)) return false
    const flooredBeat = Math.floor(beat * 1000) / 1000
    if (this._cache.warpedBeats[flooredBeat])
      return this._cache.warpedBeats[flooredBeat]
    if (this._cache.beatTiming == undefined) this.buildBeatTimingDataCache()
    const cache = this._cache.beatTiming!
    const i = this.searchCache(cache, "beat", flooredBeat)
    const event = cache[i]
    const secondLimit =
      event.beat == flooredBeat
        ? event.secondClamp
        : Math.max(event.secondAfter, event.secondClamp)
    if (event.secondOf < event.secondAfter) {
      this._cache.warpedBeats[flooredBeat] = false
      return false
    }
    if (event.warped || this.getSeconds(beat, "noclamp") < secondLimit) {
      this._cache.warpedBeats[flooredBeat] = true
      return true
    }
    this._cache.warpedBeats[flooredBeat] = false
    return false
  }

  isBeatFaked(beat: number): boolean {
    if (!isFinite(beat)) return false
    const flooredBeat = Math.floor(beat * 1000) / 1000
    if (this.isBeatWarped(beat)) return true
    const fakes = this.getTimingData("FAKES")
    if (fakes == undefined) return false
    for (const event of fakes) {
      if (flooredBeat >= event.beat && flooredBeat < event.beat + event.value)
        return true
    }
    return false
  }

  getEffectiveBeat(beat: number): number {
    if (!isFinite(beat)) return 0
    if (this._cache.effectiveBeatTiming == undefined)
      this.buildEffectiveBeatTimingDataCache()
    const cache = this._cache.effectiveBeatTiming!
    if (cache.length == 0) return beat
    const i = this.searchCache(cache, "beat", beat)
    const event = cache[i]
    // if (event.beat > beat) return beat
    let effBeat = event.effectiveBeat!
    const beats_left_over = beat - event.beat
    effBeat += beats_left_over * event.value
    return effBeat
  }

  getBeatFromEffectiveBeat(effBeat: number): number {
    if (!isFinite(effBeat)) return 0
    if (this._cache.effectiveBeatTiming == undefined)
      this.buildEffectiveBeatTimingDataCache()
    const cache = this._cache.effectiveBeatTiming!
    if (cache.length == 0) return effBeat
    let i = 0
    while (
      cache[i + 1] &&
      (cache[i].value <= 0 || cache[i + 1].effectiveBeat! <= effBeat)
    )
      i++
    const leftOverEffBeats = effBeat - cache[i].effectiveBeat!
    let additionalBeats = leftOverEffBeats / cache[i].value
    if (!isFinite(additionalBeats)) additionalBeats = 0
    return cache[i].beat + additionalBeats
  }

  getSpeedMult(beat: number, seconds: number): number {
    if (!isFinite(beat) || !isFinite(seconds)) return 0
    if (this._cache.speeds == undefined) this.buildSpeedsTimingDataCache()
    const cache = this._cache.speeds!
    if (cache.length == 0) return 1
    const i = this.searchCache(cache, "beat", beat)
    const event = cache[i]
    if (event == undefined) return 1
    let time = beat - event.beat
    if (event.unit == "T") time = seconds - event.second!
    let progress = clamp(time / event.delay, 0, 1)
    if (event.delay == 0) progress = 1
    const prev = cache[i - 1]?.value ?? 1
    return progress * (event.value - prev) + prev
  }

  getBPM(beat: number): number {
    return this.getBPMEvent(beat)?.value ?? 120
  }

  getBPMEvent(beat: number): BPMTimingEvent | undefined {
    if (!isFinite(beat)) return
    if (this._cache.beatTiming == undefined) this.buildBeatTimingDataCache()
    const bpms = this.getTimingData("BPMS")
    if (bpms.length == 0) return
    return bpms[this.searchCache(bpms, "beat", beat)]
  }

  getTimingEventAtBeat<Type extends TimingEventProperty>(
    prop: Type,
    beat: number
  ): Extract<TimingEvent, { type: Type }> | undefined {
    const entries = this.getTimingData(prop)
    if (!Array.isArray(entries)) return undefined
    const entry = entries[this.searchCache(entries, "beat", beat)]
    if (entry?.beat && entry.beat > beat) return undefined
    return entry
  }

  reloadCache(prop?: TimingProperty) {
    this.buildTimingDataCache()
    if (
      prop == undefined ||
      prop == "OFFSET" ||
      ["WARPS", "STOPS", "DELAYS", "BPMS"].includes(
        prop as BeatTimingEventProperty
      )
    )
      this.buildBeatTimingDataCache()
    if (prop == undefined || prop == "SCROLLS")
      this.buildEffectiveBeatTimingDataCache()
    if (prop == undefined || prop == "SPEEDS") this.buildSpeedsTimingDataCache()
    this._chart?.recalculateNotes()
  }

  private binsert<Type extends TimingEventProperty>(
    type: Type,
    event: Extract<TimingEvent, { type: Type }>
  ) {
    let key = "beat" as keyof TimingEventBase
    const arr = this.events[type]!
    if (type == "ATTACKS") key = "second" as keyof TimingEventBase
    let low = 0,
      high = arr.length
    while (low < high) {
      const mid = (low + high) >>> 1
      if (arr[mid][key]! < event[key]!) low = mid + 1
      else high = mid
    }
    arr.splice(low, 0, event)
  }

  private bindex(type: TimingEventProperty, event: TimingEventBase): number {
    let key = "beat" as keyof TimingEventBase
    const arr = this.events[type]!
    if (type == "ATTACKS") key = "second" as keyof TimingEventBase
    let low = 0,
      high = arr.length
    while (low <= high && low < arr.length) {
      const mid = (low + high) >>> 1
      if (arr[mid][key] == event[key]) return mid
      if (arr[mid][key]! < event[key]!) low = mid + 1
      if (arr[mid][key]! > event[key]!) high = mid - 1
    }
    return -1
  }

  getBeatTiming(): BeatTimingCache[] {
    return [...this._cache.beatTiming!]
  }

  getTimingData(): TimingEvent[]
  getTimingData(...props: ["OFFSET"]): number
  getTimingData<Type extends TimingProperty>(
    ...props: Type[]
  ): Extract<TimingEvent, { type: Type }>[]
  getTimingData(...props: TimingProperty[]) {
    if (props.length == 0) return this._cache.sortedEvents
    if (props.includes("OFFSET"))
      return this.offset ?? this._fallback?.offset ?? 0
    if (props.length == 1 && props[0] in this._cache.events)
      return this._cache.events[props[0] as TimingEventProperty]
    if (this._cache.sortedEvents == undefined) this.buildTimingDataCache()
    const events = this._cache.sortedEvents!.filter(event =>
      props.includes(event.type)
    )
    return events
  }

  isEmpty(): boolean {
    for (const value of Object.values(this.events)) {
      if (value) return false
    }
    return true
  }

  serialize(type: "sm" | "ssc"): string {
    let str = ""
    if (this.offset) str += "#OFFSET:" + this.offset + ";\n"
    let props = [
      "BPMS",
      "STOPS",
      "WARPS",
      "DELAYS",
      "SPEEDS",
      "SCROLLS",
      "TICKCOUNTS",
      "TIMESIGNATURES",
      "LABELS",
      "COMBOS",
      "FAKES",
      "BGCHANGES",
      "FGCHANGES",
      "ATTACKS",
    ] satisfies TimingEventProperty[]
    if (type == "sm") {
      props = [
        "BPMS",
        "STOPS",
        "TIMESIGNATURES",
        "BGCHANGES",
        "FGCHANGES",
        "ATTACKS",
      ]
    }
    for (const prop of props) {
      str += this.formatProperty(type, prop)
    }
    return str
  }

  private formatProperty(
    type: "sm" | "ssc",
    prop: TimingEventProperty
  ): string {
    const precision = 3
    if (!this._fallback && !this.events[prop]) return ""
    let str = ""
    switch (prop) {
      case "ATTACKS": {
        const events = this.getTimingData(prop)
        str = events
          .map(
            event =>
              `TIME=${event.second}${event.endType}=${event.value}:MODS=${event.mods}`
          )
          .join(":\n")
        break
      }
      case "BGCHANGES":
      case "FGCHANGES": {
        const events = this.getTimingData(prop)
        str = events
          .map(
            event =>
              `${event.beat}=${event.file}=${roundDigit(
                event.updateRate,
                precision
              ).toFixed(precision)}=${Number(event.crossFade)}=${Number(
                event.stretchRewind
              )}=${Number(event.stretchNoLoop)}=${event.effect}=${
                event.file2
              }=${event.transition}=${event.color1}=${event.color2}`
          )
          .join(",\n")
        break
      }
      case "BPMS":
      case "DELAYS":
      case "FAKES":
      case "SCROLLS":
      case "WARPS": {
        const events = this.getTimingData(prop)
        str = events
          .map(
            event =>
              `${roundDigit(event.beat, precision).toFixed(
                precision
              )}=${roundDigit(event.value, precision).toFixed(precision)}`
          )
          .join(",\n")
        break
      }
      case "STOPS": {
        let events = this.getTimingData(prop)
        if (type == "sm") {
          const warps = this.getTimingData("WARPS")
          const stopWarps: StopTimingEvent[] = warps.map(warp => {
            const bpm = this.getBPM(warp.beat)
            return {
              type: "STOPS",
              beat: warp.beat,
              value: (-60 / bpm) * warp.value,
            }
          })
          events = events.concat(stopWarps)
        }
        str = events
          .map(
            event =>
              `${roundDigit(event.beat, precision).toFixed(
                precision
              )}=${roundDigit(event.value, precision).toFixed(precision)}`
          )
          .join(",\n")
        break
      }
      case "COMBOS": {
        const events = this.getTimingData(prop)
        str = events
          .map(event => {
            if (event.hitMult == event.missMult) {
              return `${roundDigit(event.beat, precision).toFixed(precision)}=${
                event.hitMult
              }`
            }
            return `${roundDigit(event.beat, precision).toFixed(precision)}=${
              event.hitMult
            }=${event.missMult}`
          })
          .join(",\n")
        break
      }
      case "LABELS":
      case "TICKCOUNTS": {
        const events = this.getTimingData(prop)
        str = events
          .map(
            event =>
              `${roundDigit(event.beat, precision).toFixed(precision)}=${
                event.value
              }`
          )
          .join(",\n")
        break
      }
      case "SPEEDS": {
        const events = this.getTimingData(prop)
        str = events
          .map(
            event =>
              `${roundDigit(event.beat, precision).toFixed(
                precision
              )}=${roundDigit(event.value, precision).toFixed(
                precision
              )}=${roundDigit(event.delay, precision).toFixed(precision)}=${
                event.unit == "B" ? 0 : 1
              }`
          )
          .join(",\n")
        break
      }
      case "TIMESIGNATURES": {
        const events = this.getTimingData(prop)
        str = events
          .map(
            event =>
              `${roundDigit(event.beat, precision).toFixed(precision)}=${
                event.upper
              }=${event.lower}`
          )
          .join(",\n")
        break
      }
    }
    if (str.includes(",")) str += "\n"
    return "#" + prop + ":" + str + ";\n"
  }
}
