import { describe, expect, test } from "bun:test"
import type { TextareaRenderable } from "@opentui/core"
import { createSignal } from "solid-js"
import { createVimHandler } from "../../../src/cli/cmd/tui/component/vim/vim-handler"
import { createVimState } from "../../../src/cli/cmd/tui/component/vim/vim-state"
import type { VimScroll } from "../../../src/cli/cmd/tui/component/vim/vim-scroll"
import { vimScroll } from "../../../src/cli/cmd/tui/component/vim/vim-scroll"
import type { VimJump } from "../../../src/cli/cmd/tui/component/vim/vim-motion-jump"

function rowColToOffset(text: string, row: number, col: number) {
  let index = 0
  let current = 0
  while (current < row) {
    const next = text.indexOf("\n", index)
    if (next === -1) return text.length
    index = next + 1
    current++
  }
  return Math.min(index + col, text.length)
}

function offsetToRowCol(text: string, offset: number) {
  let row = 0
  let col = 0
  let index = 0
  while (index < offset && index < text.length) {
    if (text[index] === "\n") {
      row++
      col = 0
      index++
      continue
    }
    col++
    index++
  }
  return { row, col }
}

function createTextarea(text: string) {
  const textarea = {
    plainText: text,
    cursorOffset: 0,
    get logicalCursor() {
      return offsetToRowCol(textarea.plainText, textarea.cursorOffset)
    },
    insertText(value: string) {
      const head = textarea.plainText.slice(0, textarea.cursorOffset)
      const tail = textarea.plainText.slice(textarea.cursorOffset)
      textarea.plainText = head + value + tail
      textarea.cursorOffset += value.length
    },
    deleteRange(startRow: number, startCol: number, endRow: number, endCol: number) {
      const start = rowColToOffset(textarea.plainText, startRow, startCol)
      const end = rowColToOffset(textarea.plainText, endRow, endCol)
      textarea.plainText = textarea.plainText.slice(0, start) + textarea.plainText.slice(end)
      textarea.cursorOffset = start
    },
    undoCalled: 0,
    redoCalled: 0,
    undo() {
      textarea.undoCalled++
      return true
    },
    redo() {
      textarea.redoCalled++
      return true
    },
    setText(value: string) {
      textarea.plainText = value
      textarea.cursorOffset = 0
    },
  }
  return textarea as unknown as TextareaRenderable & { undoCalled: number; redoCalled: number }
}

function createEvent(name: string, options?: { shift?: boolean; ctrl?: boolean; meta?: boolean; super?: boolean }) {
  let prevented = false
  return {
    event: {
      name,
      shift: options?.shift,
      ctrl: options?.ctrl,
      meta: options?.meta,
      super: options?.super,
      preventDefault() {
        prevented = true
      },
    },
    prevented: () => prevented,
  }
}

function createHandler(
  text: string,
  options?: {
    enabled?: boolean
    mode?: "normal" | "insert"
    submit?: () => void
    autocomplete?: () => false | "@" | "/"
    history?: (direction: -1 | 1) => string | undefined
  },
) {
  const textarea = createTextarea(text)
  const [enabled] = createSignal(options?.enabled ?? true)
  const [mode, setMode] = createSignal<"normal" | "insert">(options?.mode ?? "normal")
  const [pending, setPending] = createSignal<
    "" | "c" | "d" | "g" | "r" | "y" | "f" | "F" | "t" | "T" | "ci" | "ca" | "di" | "da" | "yi" | "ya"
  >("")
  let register = ""
  let registerType: "char" | "line" = "char"
  let count = ""
  let lastFind: { type: "f" | "F" | "t" | "T"; char: string } | undefined
  const scrollCalls: VimScroll[] = []
  const jumpCalls: VimJump[] = []

  function clearPending() {
    setPending("")
  }

  function clearCount() {
    count = ""
  }

  function changeMode(next: "normal" | "insert") {
    clearPending()
    clearCount()
    setMode(next)
  }

  const state: ReturnType<typeof createVimState> = {
    mode,
    setMode: changeMode,
    pending,
    setPending,
    clearPending,
    reset() {
      clearPending()
      clearCount()
      setMode("insert")
    },
    isInsert: () => mode() === "insert",
    setRegister(text: string, type: "char" | "line") {
      register = text
      registerType = type
    },
    get register() {
      return register
    },
    get registerType() {
      return registerType
    },
    pushCount(digit: string) {
      count += digit
    },
    consumeCount(): number {
      const n = count ? parseInt(count, 10) : 1
      count = ""
      return Math.min(n, 999)
    },
    get hasCount() {
      return count.length > 0
    },
    clearCount,
    setLastFind(find: { type: "f" | "F" | "t" | "T"; char: string }) {
      lastFind = find
    },
    get lastFind() {
      return lastFind
    },
  }
  const handler = createVimHandler({
    enabled,
    state,
    textarea: () => textarea,
    submit: options?.submit ?? (() => {}),
    scroll(action) {
      scrollCalls.push(action)
    },
    jump(action) {
      jumpCalls.push(action)
    },
    autocomplete: options?.autocomplete,
    history: options?.history,
  })

  return { textarea, handler, state, scrollCalls, jumpCalls }
}

describe("vim motion handler", () => {
  test("moves with h j k l and clamps to line", () => {
    const ctx = createHandler("abc\nxy")

    ctx.handler.handleKey(createEvent("l").event)
    ctx.handler.handleKey(createEvent("l").event)
    expect(ctx.textarea.cursorOffset).toBe(2)

    ctx.handler.handleKey(createEvent("j").event)
    expect(ctx.textarea.cursorOffset).toBe(5)

    ctx.handler.handleKey(createEvent("h").event)
    expect(ctx.textarea.cursorOffset).toBe(4)

    ctx.handler.handleKey(createEvent("k").event)
    expect(ctx.textarea.cursorOffset).toBe(0)
  })

  test("j/k move across leading empty first line", () => {
    const text = "\nline1\nline2\nline3\n"
    const ctx = createHandler(text)
    ctx.textarea.cursorOffset = rowColToOffset(text, 1, 0)

    ctx.handler.handleKey(createEvent("k").event)
    expect(ctx.textarea.cursorOffset).toBe(rowColToOffset(text, 0, 0))

    ctx.handler.handleKey(createEvent("j").event)
    expect(ctx.textarea.cursorOffset).toBe(rowColToOffset(text, 1, 0))
  })

  test("j/k move across trailing empty last line", () => {
    const text = "\nline1\nline2\nline3\n"
    const ctx = createHandler(text)
    ctx.textarea.cursorOffset = rowColToOffset(text, 3, 0)

    ctx.handler.handleKey(createEvent("j").event)
    expect(ctx.textarea.cursorOffset).toBe(rowColToOffset(text, 4, 0))

    ctx.handler.handleKey(createEvent("k").event)
    expect(ctx.textarea.cursorOffset).toBe(rowColToOffset(text, 3, 0))
  })

  test("supports word and big-word key shapes", () => {
    const ctx = createHandler("foo,bar baz")

    const w = createEvent("w")
    expect(ctx.handler.handleKey(w.event)).toBe(true)
    expect(w.prevented()).toBe(true)
    expect(ctx.textarea.cursorOffset).toBe(4)

    const upperW = createEvent("W")
    expect(ctx.handler.handleKey(upperW.event)).toBe(true)
    expect(upperW.prevented()).toBe(true)
    expect(ctx.textarea.cursorOffset).toBe(8)

    ctx.textarea.cursorOffset = 0
    const shiftW = createEvent("w", { shift: true })
    expect(ctx.handler.handleKey(shiftW.event)).toBe(true)
    expect(shiftW.prevented()).toBe(true)
    expect(ctx.textarea.cursorOffset).toBe(8)

    const upperE = createEvent("E")
    expect(ctx.handler.handleKey(upperE.event)).toBe(true)
    expect(upperE.prevented()).toBe(true)
    expect(ctx.textarea.cursorOffset).toBe(10)

    const upperB = createEvent("B")
    expect(ctx.handler.handleKey(upperB.event)).toBe(true)
    expect(upperB.prevented()).toBe(true)
    expect(ctx.textarea.cursorOffset).toBe(8)
  })

  test("e stays on single-char word", () => {
    const ctx = createHandler("a")
    ctx.textarea.cursorOffset = 0
    ctx.handler.handleKey(createEvent("e").event)
    expect(ctx.textarea.cursorOffset).toBe(0)
  })

  test("e from end of word moves to next word end", () => {
    const ctx = createHandler("a b")
    ctx.textarea.cursorOffset = 0
    ctx.handler.handleKey(createEvent("e").event)
    expect(ctx.textarea.cursorOffset).toBe(2)
  })

  test("e from word end moves to next word end", () => {
    const ctx = createHandler("ab cd")
    ctx.textarea.cursorOffset = 1
    ctx.handler.handleKey(createEvent("e").event)
    expect(ctx.textarea.cursorOffset).toBe(4)
  })

  test("e from whitespace moves to next word end", () => {
    const ctx = createHandler("ab  cd")
    ctx.textarea.cursorOffset = 2
    ctx.handler.handleKey(createEvent("e").event)
    expect(ctx.textarea.cursorOffset).toBe(5)
  })

  test("0 moves to line beginning", () => {
    const ctx = createHandler("  hello")
    ctx.textarea.cursorOffset = 4
    ctx.handler.handleKey(createEvent("0").event)
    expect(ctx.textarea.cursorOffset).toBe(0)
  })

  test("0 on multiline moves to current line start", () => {
    const ctx = createHandler("abc\n  def")
    ctx.textarea.cursorOffset = 7
    ctx.handler.handleKey(createEvent("0").event)
    expect(ctx.textarea.cursorOffset).toBe(4)
  })

  test("^ moves to first non-whitespace", () => {
    const ctx = createHandler("  hello")
    ctx.textarea.cursorOffset = 5
    ctx.handler.handleKey(createEvent("^").event)
    expect(ctx.textarea.cursorOffset).toBe(2)
  })

  test("^ on line with no leading whitespace goes to column 0", () => {
    const ctx = createHandler("hello")
    ctx.textarea.cursorOffset = 3
    ctx.handler.handleKey(createEvent("^").event)
    expect(ctx.textarea.cursorOffset).toBe(0)
  })

  test("$ moves to last char of line", () => {
    const ctx = createHandler("hello")
    ctx.textarea.cursorOffset = 0
    ctx.handler.handleKey(createEvent("$").event)
    expect(ctx.textarea.cursorOffset).toBe(4)
  })

  test("$ on multiline moves to last char of current line", () => {
    const ctx = createHandler("abc\ndef")
    ctx.textarea.cursorOffset = 0
    ctx.handler.handleKey(createEvent("$").event)
    expect(ctx.textarea.cursorOffset).toBe(2)
  })

  test("$ on single char stays put", () => {
    const ctx = createHandler("a")
    ctx.textarea.cursorOffset = 0
    ctx.handler.handleKey(createEvent("$").event)
    expect(ctx.textarea.cursorOffset).toBe(0)
  })

  test("supports insert transitions for A I O", () => {
    const i0 = createHandler("abc")
    i0.textarea.cursorOffset = 1
    expect(i0.handler.handleKey(createEvent("i").event)).toBe(true)
    expect(i0.state.mode()).toBe("insert")
    expect(i0.textarea.cursorOffset).toBe(1)

    const i = createHandler("  abc")
    i.textarea.cursorOffset = 1
    expect(i.handler.handleKey(createEvent("I").event)).toBe(true)
    expect(i.state.mode()).toBe("insert")
    expect(i.textarea.cursorOffset).toBe(2)

    const a = createHandler("  abc")
    a.textarea.cursorOffset = 1
    expect(a.handler.handleKey(createEvent("A").event)).toBe(true)
    expect(a.state.mode()).toBe("insert")
    expect(a.textarea.cursorOffset).toBe(5)

    const o = createHandler("abc")
    o.textarea.cursorOffset = 1
    expect(o.handler.handleKey(createEvent("o", { shift: true }).event)).toBe(true)
    expect(o.state.mode()).toBe("insert")
    expect(o.textarea.plainText).toBe("\nabc")
  })

  test("x deletes under cursor and no-ops at end", () => {
    const a = createHandler("abc")
    a.textarea.cursorOffset = 1
    const x = createEvent("x")
    expect(a.handler.handleKey(x.event)).toBe(true)
    expect(x.prevented()).toBe(true)
    expect(a.textarea.plainText).toBe("ac")

    const b = createHandler("ab\ncd")
    b.textarea.cursorOffset = 2
    expect(b.handler.handleKey(createEvent("x").event)).toBe(true)
    expect(b.textarea.plainText).toBe("ab\ncd")
  })

  test("S clears current line and enters insert", () => {
    const ctx = createHandler("one\ntwo\nthree")
    ctx.textarea.cursorOffset = 5
    const s = createEvent("S")

    expect(ctx.handler.handleKey(s.event)).toBe(true)
    expect(s.prevented()).toBe(true)
    expect(ctx.state.mode()).toBe("insert")
    expect(ctx.textarea.plainText).toBe("one\n\nthree")
    expect(ctx.textarea.cursorOffset).toBe(4)
  })

  test("S clears single line", () => {
    const ctx = createHandler("abc")
    const s = createEvent("S")

    expect(ctx.handler.handleKey(s.event)).toBe(true)
    expect(s.prevented()).toBe(true)
    expect(ctx.state.mode()).toBe("insert")
    expect(ctx.textarea.plainText).toBe("")
    expect(ctx.textarea.cursorOffset).toBe(0)
  })

  test("S keeps empty buffer", () => {
    const ctx = createHandler("")
    const s = createEvent("S")

    expect(ctx.handler.handleKey(s.event)).toBe(true)
    expect(s.prevented()).toBe(true)
    expect(ctx.state.mode()).toBe("insert")
    expect(ctx.textarea.plainText).toBe("")
    expect(ctx.textarea.cursorOffset).toBe(0)
  })

  test("cc clears current line and enters insert", () => {
    const ctx = createHandler("one\ntwo\nthree")
    ctx.textarea.cursorOffset = 5

    const c1 = createEvent("c")
    expect(ctx.handler.handleKey(c1.event)).toBe(true)
    expect(c1.prevented()).toBe(true)
    expect(ctx.state.pending()).toBe("c")

    const c2 = createEvent("c")
    expect(ctx.handler.handleKey(c2.event)).toBe(true)
    expect(c2.prevented()).toBe(true)
    expect(ctx.state.mode()).toBe("insert")
    expect(ctx.textarea.plainText).toBe("one\n\nthree")
    expect(ctx.textarea.cursorOffset).toBe(4)
    expect(ctx.state.pending()).toBe("")
  })

  test("cw deletes to next word and enters insert", () => {
    const ctx = createHandler("hello world test")
    ctx.textarea.cursorOffset = 0

    const c = createEvent("c")
    expect(ctx.handler.handleKey(c.event)).toBe(true)
    expect(ctx.state.pending()).toBe("c")

    const w = createEvent("w")
    expect(ctx.handler.handleKey(w.event)).toBe(true)
    expect(w.prevented()).toBe(true)
    expect(ctx.textarea.plainText).toBe("world test")
    expect(ctx.textarea.cursorOffset).toBe(0)
    expect(ctx.state.mode()).toBe("insert")
    expect(ctx.state.pending()).toBe("")
  })

  test("pending c clears on escape", () => {
    const ctx = createHandler("hello world")

    expect(ctx.handler.handleKey(createEvent("c").event)).toBe(true)
    expect(ctx.state.pending()).toBe("c")

    const esc = createEvent("escape")
    expect(ctx.handler.handleKey(esc.event)).toBe(true)
    expect(esc.prevented()).toBe(true)
    expect(ctx.state.pending()).toBe("")
    expect(ctx.textarea.plainText).toBe("hello world")
  })

  test("pending c clears on modifier key", () => {
    const ctx = createHandler("abc")

    expect(ctx.handler.handleKey(createEvent("c").event)).toBe(true)
    expect(ctx.state.pending()).toBe("c")

    const mod = createEvent("j", { ctrl: true })
    expect(ctx.handler.handleKey(mod.event)).toBe(false)
    expect(mod.prevented()).toBe(false)
    expect(ctx.state.pending()).toBe("")
  })

  test("insert mode only handles escape", () => {
    const ctx = createHandler("abc", { mode: "insert" })

    const w = createEvent("w")
    expect(ctx.handler.handleKey(w.event)).toBe(false)
    expect(w.prevented()).toBe(false)

    const esc = createEvent("escape")
    expect(ctx.handler.handleKey(esc.event)).toBe(true)
    expect(esc.prevented()).toBe(true)
    expect(ctx.state.mode()).toBe("normal")
  })

  test("/ and @ stay in normal mode without autocomplete", () => {
    const ctx = createHandler("abc", { mode: "normal" })

    const slash = createEvent("/")
    expect(ctx.handler.handleKey(slash.event)).toBe(true)
    expect(slash.prevented()).toBe(true)
    expect(ctx.state.mode()).toBe("normal")

    const at = createEvent("@")
    expect(ctx.handler.handleKey(at.event)).toBe(true)
    expect(at.prevented()).toBe(true)
    expect(ctx.state.mode()).toBe("normal")
  })

  test("/ enters insert on empty input with autocomplete visible", () => {
    const ctx = createHandler("", {
      mode: "normal",
      autocomplete: () => "/",
    })
    const slash = createEvent("/")

    expect(ctx.handler.handleKey(slash.event)).toBe(false)
    expect(slash.prevented()).toBe(false)
    expect(ctx.state.mode()).toBe("insert")
  })

  test("/ stays normal on non-empty input with autocomplete visible", () => {
    const ctx = createHandler("abc", {
      mode: "normal",
      autocomplete: () => "/",
    })
    const slash = createEvent("/")

    expect(ctx.handler.handleKey(slash.event)).toBe(true)
    expect(slash.prevented()).toBe(true)
    expect(ctx.state.mode()).toBe("normal")
  })

  test("submit from normal keeps mode and clears pending", () => {
    let calls = 0
    const ctx = createHandler("", {
      mode: "normal",
      submit() {
        calls++
      },
    })
    ctx.state.setPending("d")

    ctx.handler.handleKey(createEvent("return").event)

    expect(calls).toBe(1)
    expect(ctx.state.mode()).toBe("normal")
    expect(ctx.state.pending()).toBe("")
  })

  test("vim disabled does not intercept keys", () => {
    const ctx = createHandler("abc", { enabled: false })
    const keys = [
      createEvent("h"),
      createEvent("x"),
      createEvent("d"),
      createEvent("g"),
      createEvent("d", { ctrl: true }),
    ]

    for (const key of keys) {
      expect(ctx.handler.handleKey(key.event)).toBe(false)
      expect(key.prevented()).toBe(false)
    }

    expect(ctx.scrollCalls.length).toBe(0)
    expect(ctx.jumpCalls.length).toBe(0)
  })

  test("dd deletes current line", () => {
    const ctx = createHandler("one\ntwo\nthree")
    ctx.textarea.cursorOffset = 5

    const d1 = createEvent("d")
    expect(ctx.handler.handleKey(d1.event)).toBe(true)
    expect(d1.prevented()).toBe(true)
    expect(ctx.state.pending()).toBe("d")

    const d2 = createEvent("d")
    expect(ctx.handler.handleKey(d2.event)).toBe(true)
    expect(d2.prevented()).toBe(true)
    expect(ctx.textarea.plainText).toBe("one\nthree")
    expect(ctx.textarea.cursorOffset).toBe(4)
    expect(ctx.state.pending()).toBe("")
  })

  test("dd on last line lands at resulting line start", () => {
    const ctx = createHandler("one\ntwo")
    ctx.textarea.cursorOffset = 5

    expect(ctx.handler.handleKey(createEvent("d").event)).toBe(true)
    expect(ctx.handler.handleKey(createEvent("d").event)).toBe(true)
    expect(ctx.textarea.plainText).toBe("one")
    expect(ctx.textarea.cursorOffset).toBe(0)
  })

  test("dw deletes to next word and clears pending", () => {
    const ctx = createHandler("hello world test")
    ctx.textarea.cursorOffset = 0

    const d = createEvent("d")
    expect(ctx.handler.handleKey(d.event)).toBe(true)
    expect(ctx.state.pending()).toBe("d")

    const w = createEvent("w")
    expect(ctx.handler.handleKey(w.event)).toBe(true)
    expect(w.prevented()).toBe(true)
    expect(ctx.textarea.plainText).toBe("world test")
    expect(ctx.textarea.cursorOffset).toBe(0)
    expect(ctx.state.pending()).toBe("")
  })

  test("pending d clears on escape", () => {
    const ctx = createHandler("hello world")

    expect(ctx.handler.handleKey(createEvent("d").event)).toBe(true)
    expect(ctx.state.pending()).toBe("d")

    const esc = createEvent("escape")
    expect(ctx.handler.handleKey(esc.event)).toBe(true)
    expect(esc.prevented()).toBe(true)
    expect(ctx.state.pending()).toBe("")
    expect(ctx.textarea.plainText).toBe("hello world")
  })

  test("d then i enters text object pending (di)", () => {
    const ctx = createHandler("abc")

    expect(ctx.handler.handleKey(createEvent("d").event)).toBe(true)
    expect(ctx.state.pending()).toBe("d")

    const i = createEvent("i")
    expect(ctx.handler.handleKey(i.event)).toBe(true)
    expect(i.prevented()).toBe(true)
    expect(ctx.state.pending()).toBe("di")
  })

  test("mode switch clears pending state", () => {
    const ctx = createHandler("abc")
    expect(ctx.handler.handleKey(createEvent("d").event)).toBe(true)
    expect(ctx.state.pending()).toBe("d")

    // d then l clears pending and moves (not a text object key)
    expect(ctx.handler.handleKey(createEvent("l").event)).toBe(true)
    expect(ctx.state.pending()).toBe("")

    expect(ctx.handler.handleKey(createEvent("i").event)).toBe(true)
    expect(ctx.state.mode()).toBe("insert")
    expect(ctx.state.pending()).toBe("")

    expect(ctx.handler.handleKey(createEvent("escape").event)).toBe(true)
    expect(ctx.state.mode()).toBe("normal")
    expect(ctx.state.pending()).toBe("")

    const h = createEvent("h")
    expect(ctx.handler.handleKey(h.event)).toBe(true)
    expect(h.prevented()).toBe(true)
  })

  test("pending d clears on modifier key and event is not consumed", () => {
    const ctx = createHandler("abc")

    expect(ctx.handler.handleKey(createEvent("d").event)).toBe(true)
    expect(ctx.state.pending()).toBe("d")

    const mod = createEvent("j", { ctrl: true })
    expect(ctx.handler.handleKey(mod.event)).toBe(false)
    expect(mod.prevented()).toBe(false)
    expect(ctx.state.pending()).toBe("")
  })

  test("ctrl scroll keys trigger actions", () => {
    const ctx = createHandler("abc")
    const keys: Array<[string, VimScroll]> = [
      ["e", "line-down"],
      ["y", "line-up"],
      ["f", "page-down"],
      ["b", "page-up"],
    ]

    for (const [key, action] of keys) {
      const evt = createEvent(key, { ctrl: true })
      expect(ctx.handler.handleKey(evt.event)).toBe(true)
      expect(evt.prevented()).toBe(true)
      expect(ctx.scrollCalls.at(-1)).toBe(action)
    }
  })

  test("ctrl-d and ctrl-u are not intercepted", () => {
    const ctx = createHandler("abc")
    const d = createEvent("d", { ctrl: true })
    expect(ctx.handler.handleKey(d.event)).toBe(false)
    expect(d.prevented()).toBe(false)

    const u = createEvent("u", { ctrl: true })
    expect(ctx.handler.handleKey(u.event)).toBe(false)
    expect(u.prevented()).toBe(false)
  })

  test("ctrl scroll clears pending operator", () => {
    const ctx = createHandler("abc")
    expect(ctx.handler.handleKey(createEvent("d").event)).toBe(true)
    expect(ctx.state.pending()).toBe("d")

    const evt = createEvent("f", { ctrl: true })
    expect(ctx.handler.handleKey(evt.event)).toBe(true)
    expect(evt.prevented()).toBe(true)
    expect(ctx.scrollCalls.at(-1)).toBe("page-down")
    expect(ctx.state.pending()).toBe("")
  })

  test("ctrl scroll not handled in insert mode", () => {
    const ctx = createHandler("abc", { mode: "insert" })
    const evt = createEvent("e", { ctrl: true })
    expect(ctx.handler.handleKey(evt.event)).toBe(false)
    expect(evt.prevented()).toBe(false)
    expect(ctx.scrollCalls.length).toBe(0)
  })

  test("ctrl scroll not handled when vim disabled", () => {
    const ctx = createHandler("abc", { enabled: false })
    const evt = createEvent("e", { ctrl: true })
    expect(ctx.handler.handleKey(evt.event)).toBe(false)
    expect(evt.prevented()).toBe(false)
    expect(ctx.scrollCalls.length).toBe(0)
  })

  test("g and G jump to top or bottom", () => {
    const ctx = createHandler("abc")

    const g = createEvent("g")
    expect(ctx.handler.handleKey(g.event)).toBe(true)
    expect(g.prevented()).toBe(true)
    expect(ctx.jumpCalls.length).toBe(0)
    expect(ctx.state.pending()).toBe("g")

    const g2 = createEvent("g")
    expect(ctx.handler.handleKey(g2.event)).toBe(true)
    expect(g2.prevented()).toBe(true)
    expect(ctx.jumpCalls.at(-1)).toBe("top")
    expect(ctx.state.pending()).toBe("")

    const G = createEvent("G")
    expect(ctx.handler.handleKey(G.event)).toBe(true)
    expect(G.prevented()).toBe(true)
    expect(ctx.jumpCalls.at(-1)).toBe("bottom")
  })

  test("pending g cancels on other keys", () => {
    const ctx = createHandler("abc")
    expect(ctx.handler.handleKey(createEvent("g").event)).toBe(true)
    expect(ctx.state.pending()).toBe("g")

    const w = createEvent("w")
    expect(ctx.handler.handleKey(w.event)).toBe(true)
    expect(w.prevented()).toBe(true)
    expect(ctx.state.pending()).toBe("")
  })

  test("pending transition d to g", () => {
    const ctx = createHandler("abc")
    expect(ctx.handler.handleKey(createEvent("d").event)).toBe(true)
    expect(ctx.state.pending()).toBe("d")

    const g = createEvent("g")
    expect(ctx.handler.handleKey(g.event)).toBe(true)
    expect(g.prevented()).toBe(true)
    expect(ctx.state.pending()).toBe("g")

    const g2 = createEvent("g")
    expect(ctx.handler.handleKey(g2.event)).toBe(true)
    expect(g2.prevented()).toBe(true)
    expect(ctx.jumpCalls.at(-1)).toBe("top")
    expect(ctx.scrollCalls.length).toBe(0)
    expect(ctx.state.pending()).toBe("")
  })

  test("pending d then G clears and jumps", () => {
    const ctx = createHandler("abc")
    expect(ctx.handler.handleKey(createEvent("d").event)).toBe(true)
    expect(ctx.state.pending()).toBe("d")

    const G = createEvent("G")
    expect(ctx.handler.handleKey(G.event)).toBe(true)
    expect(G.prevented()).toBe(true)
    expect(ctx.jumpCalls.at(-1)).toBe("bottom")
    expect(ctx.state.pending()).toBe("")
  })

  test("g not handled in insert mode", () => {
    const ctx = createHandler("abc", { mode: "insert" })
    const g = createEvent("g")
    expect(ctx.handler.handleKey(g.event)).toBe(false)
    expect(g.prevented()).toBe(false)
    expect(ctx.jumpCalls.length).toBe(0)
  })

  test("g not handled when vim disabled", () => {
    const ctx = createHandler("abc", { enabled: false })
    const g = createEvent("g")
    expect(ctx.handler.handleKey(g.event)).toBe(false)
    expect(g.prevented()).toBe(false)
    expect(ctx.jumpCalls.length).toBe(0)
  })

  test("repeated ctrl scroll keeps pending clear", () => {
    const ctx = createHandler("abc")
    expect(ctx.handler.handleKey(createEvent("d").event)).toBe(true)
    expect(ctx.state.pending()).toBe("d")

    const first = createEvent("f", { ctrl: true })
    expect(ctx.handler.handleKey(first.event)).toBe(true)
    expect(first.prevented()).toBe(true)
    expect(ctx.state.pending()).toBe("")

    const second = createEvent("f", { ctrl: true })
    expect(ctx.handler.handleKey(second.event)).toBe(true)
    expect(second.prevented()).toBe(true)
    expect(ctx.state.pending()).toBe("")

    expect(ctx.scrollCalls).toEqual(["page-down", "page-down"])
  })

  test("repeated G does not create pending", () => {
    const ctx = createHandler("abc")

    const first = createEvent("G")
    expect(ctx.handler.handleKey(first.event)).toBe(true)
    expect(first.prevented()).toBe(true)
    expect(ctx.state.pending()).toBe("")

    const second = createEvent("G")
    expect(ctx.handler.handleKey(second.event)).toBe(true)
    expect(second.prevented()).toBe(true)
    expect(ctx.state.pending()).toBe("")

    expect(ctx.jumpCalls).toEqual(["bottom", "bottom"])
  })

  test("u calls undo", () => {
    const ctx = createHandler("abc")
    const u = createEvent("u")
    expect(ctx.handler.handleKey(u.event)).toBe(true)
    expect(u.prevented()).toBe(true)
    expect((ctx.textarea as any).undoCalled).toBe(1)
  })

  test("Ctrl-r calls redo", () => {
    const ctx = createHandler("abc")
    const r = createEvent("r", { ctrl: true })
    expect(ctx.handler.handleKey(r.event)).toBe(true)
    expect(r.prevented()).toBe(true)
    expect((ctx.textarea as any).redoCalled).toBe(1)
  })

  test("D deletes to end of line", () => {
    const ctx = createHandler("hello world")
    ctx.textarea.cursorOffset = 5
    const d = createEvent("D")
    expect(ctx.handler.handleKey(d.event)).toBe(true)
    expect(d.prevented()).toBe(true)
    expect(ctx.textarea.plainText).toBe("hello")
    expect(ctx.textarea.cursorOffset).toBe(5)
  })

  test("D on multiline deletes to end of current line", () => {
    const ctx = createHandler("abc\ndef")
    ctx.textarea.cursorOffset = 1
    ctx.handler.handleKey(createEvent("D").event)
    expect(ctx.textarea.plainText).toBe("a\ndef")
  })

  test("C changes to end of line and enters insert", () => {
    const ctx = createHandler("hello world")
    ctx.textarea.cursorOffset = 5
    const c = createEvent("C")
    expect(ctx.handler.handleKey(c.event)).toBe(true)
    expect(c.prevented()).toBe(true)
    expect(ctx.textarea.plainText).toBe("hello")
    expect(ctx.state.mode()).toBe("insert")
  })

  test("s deletes char and enters insert", () => {
    const ctx = createHandler("abc")
    ctx.textarea.cursorOffset = 1
    const s = createEvent("s")
    expect(ctx.handler.handleKey(s.event)).toBe(true)
    expect(s.prevented()).toBe(true)
    expect(ctx.textarea.plainText).toBe("ac")
    expect(ctx.state.mode()).toBe("insert")
  })

  test("r replaces char under cursor", () => {
    const ctx = createHandler("abc")
    ctx.textarea.cursorOffset = 1

    const r = createEvent("r")
    expect(ctx.handler.handleKey(r.event)).toBe(true)
    expect(ctx.state.pending()).toBe("r")

    const x = createEvent("x")
    expect(ctx.handler.handleKey(x.event)).toBe(true)
    expect(x.prevented()).toBe(true)
    expect(ctx.textarea.plainText).toBe("axc")
    expect(ctx.textarea.cursorOffset).toBe(1)
    expect(ctx.state.pending()).toBe("")
    expect(ctx.state.mode()).toBe("normal")
  })

  test("r cancelled by escape", () => {
    const ctx = createHandler("abc")
    ctx.handler.handleKey(createEvent("r").event)
    expect(ctx.state.pending()).toBe("r")

    ctx.handler.handleKey(createEvent("escape").event)
    expect(ctx.state.pending()).toBe("")
    expect(ctx.textarea.plainText).toBe("abc")
  })

  test("J joins current line with next", () => {
    const ctx = createHandler("abc\ndef")
    ctx.textarea.cursorOffset = 1
    const j = createEvent("J")
    expect(ctx.handler.handleKey(j.event)).toBe(true)
    expect(j.prevented()).toBe(true)
    expect(ctx.textarea.plainText).toBe("abc def")
    expect(ctx.textarea.cursorOffset).toBe(3)
  })

  test("J on last line is a no-op", () => {
    const ctx = createHandler("abc")
    ctx.textarea.cursorOffset = 1
    ctx.handler.handleKey(createEvent("J").event)
    expect(ctx.textarea.plainText).toBe("abc")
  })

  test("~ toggles case and advances cursor", () => {
    const ctx = createHandler("aBc")
    ctx.textarea.cursorOffset = 0

    ctx.handler.handleKey(createEvent("~").event)
    expect(ctx.textarea.plainText).toBe("ABc")
    expect(ctx.textarea.cursorOffset).toBe(1)

    ctx.handler.handleKey(createEvent("~").event)
    expect(ctx.textarea.plainText).toBe("Abc")
    expect(ctx.textarea.cursorOffset).toBe(2)
  })

  test("yy yanks current line", () => {
    const ctx = createHandler("one\ntwo\nthree")
    ctx.textarea.cursorOffset = 5

    ctx.handler.handleKey(createEvent("y").event)
    expect(ctx.state.pending()).toBe("y")
    ctx.handler.handleKey(createEvent("y").event)
    expect(ctx.state.pending()).toBe("")
    expect(ctx.state.register).toBe("two")
    expect(ctx.state.registerType).toBe("line")
    // cursor unchanged
    expect(ctx.textarea.cursorOffset).toBe(5)
    expect(ctx.textarea.plainText).toBe("one\ntwo\nthree")
  })

  test("yw yanks word", () => {
    const ctx = createHandler("hello world")
    ctx.textarea.cursorOffset = 0

    ctx.handler.handleKey(createEvent("y").event)
    ctx.handler.handleKey(createEvent("w").event)
    expect(ctx.state.register).toBe("hello ")
    expect(ctx.state.registerType).toBe("char")
    expect(ctx.textarea.plainText).toBe("hello world")
  })

  test("dd saves to register", () => {
    const ctx = createHandler("one\ntwo\nthree")
    ctx.textarea.cursorOffset = 5

    ctx.handler.handleKey(createEvent("d").event)
    ctx.handler.handleKey(createEvent("d").event)
    expect(ctx.state.register).toBe("two")
    expect(ctx.state.registerType).toBe("line")
  })

  test("dw saves to register", () => {
    const ctx = createHandler("hello world")
    ctx.textarea.cursorOffset = 0

    ctx.handler.handleKey(createEvent("d").event)
    ctx.handler.handleKey(createEvent("w").event)
    expect(ctx.state.register).toBe("hello ")
    expect(ctx.state.registerType).toBe("char")
  })

  test("x saves to register", () => {
    const ctx = createHandler("abc")
    ctx.textarea.cursorOffset = 1
    ctx.handler.handleKey(createEvent("x").event)
    expect(ctx.state.register).toBe("b")
    expect(ctx.state.registerType).toBe("char")
  })

  test("p pastes after cursor (charwise)", () => {
    const ctx = createHandler("abc")
    ctx.textarea.cursorOffset = 0
    ctx.state.setRegister("XY", "char")

    ctx.handler.handleKey(createEvent("p").event)
    expect(ctx.textarea.plainText).toBe("aXYbc")
    expect(ctx.textarea.cursorOffset).toBe(2)
  })

  test("P pastes before cursor (charwise)", () => {
    const ctx = createHandler("abc")
    ctx.textarea.cursorOffset = 1
    ctx.state.setRegister("XY", "char")

    ctx.handler.handleKey(createEvent("P").event)
    expect(ctx.textarea.plainText).toBe("aXYbc")
    expect(ctx.textarea.cursorOffset).toBe(2)
  })

  test("p pastes after cursor (linewise)", () => {
    const ctx = createHandler("one\ntwo")
    ctx.textarea.cursorOffset = 1
    ctx.state.setRegister("NEW", "line")

    ctx.handler.handleKey(createEvent("p").event)
    expect(ctx.textarea.plainText).toBe("one\nNEW\ntwo")
    expect(ctx.textarea.cursorOffset).toBe(4)
  })

  test("P pastes before cursor (linewise)", () => {
    const ctx = createHandler("one\ntwo")
    ctx.textarea.cursorOffset = 5
    ctx.state.setRegister("NEW", "line")

    ctx.handler.handleKey(createEvent("P").event)
    expect(ctx.textarea.plainText).toBe("one\nNEW\ntwo")
    expect(ctx.textarea.cursorOffset).toBe(4)
  })

  test("dd then p reinserts deleted line below", () => {
    const ctx = createHandler("one\ntwo\nthree")
    ctx.textarea.cursorOffset = 5

    // dd
    ctx.handler.handleKey(createEvent("d").event)
    ctx.handler.handleKey(createEvent("d").event)
    expect(ctx.textarea.plainText).toBe("one\nthree")

    // p pastes below current line (now "three")
    ctx.handler.handleKey(createEvent("p").event)
    expect(ctx.textarea.plainText).toBe("one\nthree\ntwo")
  })

  test("3w moves three words forward", () => {
    const ctx = createHandler("one two three four five")
    ctx.textarea.cursorOffset = 0

    ctx.handler.handleKey(createEvent("3").event)
    ctx.handler.handleKey(createEvent("w").event)
    expect(ctx.textarea.cursorOffset).toBe(14) // "four"
  })

  test("2j moves two lines down", () => {
    const ctx = createHandler("a\nb\nc\nd")
    ctx.textarea.cursorOffset = 0

    ctx.handler.handleKey(createEvent("2").event)
    ctx.handler.handleKey(createEvent("j").event)
    expect(ctx.textarea.cursorOffset).toBe(4) // "c"
  })

  test("3x deletes three chars", () => {
    const ctx = createHandler("abcdef")
    ctx.textarea.cursorOffset = 1

    ctx.handler.handleKey(createEvent("3").event)
    ctx.handler.handleKey(createEvent("x").event)
    expect(ctx.textarea.plainText).toBe("aef")
    expect(ctx.state.register).toBe("bcd")
  })

  test("2dd deletes two lines", () => {
    const ctx = createHandler("one\ntwo\nthree\nfour")
    ctx.textarea.cursorOffset = 0

    ctx.handler.handleKey(createEvent("2").event)
    ctx.handler.handleKey(createEvent("d").event)
    ctx.handler.handleKey(createEvent("d").event)
    expect(ctx.textarea.plainText).toBe("three\nfour")
    expect(ctx.state.register).toBe("one\ntwo")
    expect(ctx.state.registerType).toBe("line")
  })

  test("0 without count goes to line beginning", () => {
    const ctx = createHandler("hello")
    ctx.textarea.cursorOffset = 3
    ctx.handler.handleKey(createEvent("0").event)
    expect(ctx.textarea.cursorOffset).toBe(0)
  })

  test("10l moves 10 chars right (clamped)", () => {
    const ctx = createHandler("abc")
    ctx.textarea.cursorOffset = 0

    ctx.handler.handleKey(createEvent("1").event)
    ctx.handler.handleKey(createEvent("0").event)
    ctx.handler.handleKey(createEvent("l").event)
    expect(ctx.textarea.cursorOffset).toBe(2) // clamped to last char
  })

  test("escape clears count", () => {
    const ctx = createHandler("abc")
    ctx.handler.handleKey(createEvent("3").event)
    const esc = createEvent("escape")
    expect(ctx.handler.handleKey(esc.event)).toBe(true)
    // subsequent w should move once
    ctx.handler.handleKey(createEvent("w").event)
    // "abc" has no next word, stays at end
    expect(ctx.textarea.cursorOffset).toBe(3)
  })

  test("fx moves to next occurrence of x on line", () => {
    const ctx = createHandler("hello world")
    ctx.textarea.cursorOffset = 0

    ctx.handler.handleKey(createEvent("f").event)
    expect(ctx.state.pending()).toBe("f")
    ctx.handler.handleKey(createEvent("o").event)
    expect(ctx.textarea.cursorOffset).toBe(4) // first 'o' in "hello"
    expect(ctx.state.pending()).toBe("")
  })

  test("Fx moves backward to x on line", () => {
    const ctx = createHandler("hello world")
    ctx.textarea.cursorOffset = 8

    ctx.handler.handleKey(createEvent("F").event)
    ctx.handler.handleKey(createEvent("o").event)
    expect(ctx.textarea.cursorOffset).toBe(7) // 'o' in "world"
  })

  test("tx stops before target", () => {
    const ctx = createHandler("hello world")
    ctx.textarea.cursorOffset = 0

    ctx.handler.handleKey(createEvent("t").event)
    ctx.handler.handleKey(createEvent("o").event)
    expect(ctx.textarea.cursorOffset).toBe(3) // one before 'o' in "hello"
  })

  test("Tx stops after target going backward", () => {
    const ctx = createHandler("hello world")
    ctx.textarea.cursorOffset = 8

    ctx.handler.handleKey(createEvent("T").event)
    ctx.handler.handleKey(createEvent("o").event)
    expect(ctx.textarea.cursorOffset).toBe(8) // one after 'o' in "world"
  })

  test("; repeats last find forward", () => {
    const ctx = createHandler("abcabc")
    ctx.textarea.cursorOffset = 0

    ctx.handler.handleKey(createEvent("f").event)
    ctx.handler.handleKey(createEvent("b").event)
    expect(ctx.textarea.cursorOffset).toBe(1)

    ctx.handler.handleKey(createEvent(";").event)
    expect(ctx.textarea.cursorOffset).toBe(4)
  })

  test(", repeats last find in reverse", () => {
    const ctx = createHandler("abcabc")
    ctx.textarea.cursorOffset = 0

    ctx.handler.handleKey(createEvent("f").event)
    ctx.handler.handleKey(createEvent("b").event)
    expect(ctx.textarea.cursorOffset).toBe(1)

    ctx.handler.handleKey(createEvent(";").event)
    expect(ctx.textarea.cursorOffset).toBe(4)

    ctx.handler.handleKey(createEvent(",").event)
    expect(ctx.textarea.cursorOffset).toBe(1)
  })

  test("k cycles history backward on single-line input", () => {
    const items = ["previous prompt", "older prompt"]
    let idx = 0
    const ctx = createHandler("current", {
      history(direction) {
        if (direction === -1 && idx < items.length) return items[idx++]
        return undefined
      },
    })
    ctx.textarea.cursorOffset = 3

    ctx.handler.handleKey(createEvent("k").event)
    expect(ctx.textarea.plainText).toBe("previous prompt")
    expect(ctx.textarea.cursorOffset).toBe(0)
  })

  test("j cycles history forward on single-line input", () => {
    let called = false
    const ctx = createHandler("current", {
      history(direction) {
        if (direction === 1) {
          called = true
          return "next prompt"
        }
        return undefined
      },
    })
    ctx.textarea.cursorOffset = 3

    ctx.handler.handleKey(createEvent("j").event)
    expect(called).toBe(true)
    expect(ctx.textarea.plainText).toBe("next prompt")
  })

  test("j moves down normally on multiline when not on last line", () => {
    const ctx = createHandler("line1\nline2", {
      history() {
        return "should not be called"
      },
    })
    ctx.textarea.cursorOffset = 0

    ctx.handler.handleKey(createEvent("j").event)
    // should move to second line, not cycle history
    expect(ctx.textarea.cursorOffset).toBe(6)
    expect(ctx.textarea.plainText).toBe("line1\nline2")
  })

  test("k on first line of multiline cycles history", () => {
    let called = false
    const ctx = createHandler("line1\nline2", {
      history(direction) {
        if (direction === -1) {
          called = true
          return "previous"
        }
        return undefined
      },
    })
    ctx.textarea.cursorOffset = 2 // on first line

    ctx.handler.handleKey(createEvent("k").event)
    expect(called).toBe(true)
    expect(ctx.textarea.plainText).toBe("previous")
  })

  test("j/k without history callback just moves cursor", () => {
    const ctx = createHandler("abc")
    ctx.textarea.cursorOffset = 0

    ctx.handler.handleKey(createEvent("j").event)
    // single line, no history, just stays
    expect(ctx.textarea.cursorOffset).toBe(0)
    expect(ctx.textarea.plainText).toBe("abc")
  })

  test("f escape cancels without moving", () => {
    const ctx = createHandler("hello")
    ctx.textarea.cursorOffset = 0

    ctx.handler.handleKey(createEvent("f").event)
    expect(ctx.state.pending()).toBe("f")
    ctx.handler.handleKey(createEvent("escape").event)
    expect(ctx.state.pending()).toBe("")
    expect(ctx.textarea.cursorOffset).toBe(0)
  })

  test("dd then P reinserts deleted line above", () => {
    const ctx = createHandler("one\ntwo\nthree")
    ctx.textarea.cursorOffset = 5

    ctx.handler.handleKey(createEvent("d").event)
    ctx.handler.handleKey(createEvent("d").event)
    expect(ctx.textarea.plainText).toBe("one\nthree")

    // P pastes above current line
    ctx.handler.handleKey(createEvent("P").event)
    expect(ctx.textarea.plainText).toBe("one\ntwo\nthree")
  })

  test("ciw changes inner word", () => {
    const ctx = createHandler("hello world test")
    ctx.textarea.cursorOffset = 7 // on 'o' in "world"

    ctx.handler.handleKey(createEvent("c").event)
    ctx.handler.handleKey(createEvent("i").event)
    expect(ctx.state.pending()).toBe("ci")
    ctx.handler.handleKey(createEvent("w").event)
    expect(ctx.textarea.plainText).toBe("hello  test")
    expect(ctx.state.mode()).toBe("insert")
    expect(ctx.state.register).toBe("world")
  })

  test("diw deletes inner word", () => {
    const ctx = createHandler("hello world test")
    ctx.textarea.cursorOffset = 7

    ctx.handler.handleKey(createEvent("d").event)
    ctx.handler.handleKey(createEvent("i").event)
    ctx.handler.handleKey(createEvent("w").event)
    expect(ctx.textarea.plainText).toBe("hello  test")
    expect(ctx.state.mode()).toBe("normal")
    expect(ctx.state.register).toBe("world")
  })

  test("daw deletes around word (including trailing space)", () => {
    const ctx = createHandler("hello world test")
    ctx.textarea.cursorOffset = 7

    ctx.handler.handleKey(createEvent("d").event)
    ctx.handler.handleKey(createEvent("a").event)
    ctx.handler.handleKey(createEvent("w").event)
    expect(ctx.textarea.plainText).toBe("hello test")
    expect(ctx.state.register).toBe("world ")
  })

  test("yiw yanks inner word without deleting", () => {
    const ctx = createHandler("hello world")
    ctx.textarea.cursorOffset = 7

    ctx.handler.handleKey(createEvent("y").event)
    ctx.handler.handleKey(createEvent("i").event)
    ctx.handler.handleKey(createEvent("w").event)
    expect(ctx.textarea.plainText).toBe("hello world")
    expect(ctx.state.register).toBe("world")
  })

  test('ci" changes inside quotes', () => {
    const ctx = createHandler('say "hello world" end')
    ctx.textarea.cursorOffset = 8 // inside quotes

    ctx.handler.handleKey(createEvent("c").event)
    ctx.handler.handleKey(createEvent("i").event)
    ctx.handler.handleKey(createEvent('"').event)
    expect(ctx.textarea.plainText).toBe('say "" end')
    expect(ctx.state.mode()).toBe("insert")
    expect(ctx.state.register).toBe("hello world")
  })

  test("di( deletes inside parens", () => {
    const ctx = createHandler("foo(bar, baz)end")
    ctx.textarea.cursorOffset = 5 // inside parens

    ctx.handler.handleKey(createEvent("d").event)
    ctx.handler.handleKey(createEvent("i").event)
    ctx.handler.handleKey(createEvent("(").event)
    expect(ctx.textarea.plainText).toBe("foo()end")
    expect(ctx.state.register).toBe("bar, baz")
  })

  test("da( deletes including parens", () => {
    const ctx = createHandler("foo(bar)end")
    ctx.textarea.cursorOffset = 5

    ctx.handler.handleKey(createEvent("d").event)
    ctx.handler.handleKey(createEvent("a").event)
    ctx.handler.handleKey(createEvent("(").event)
    expect(ctx.textarea.plainText).toBe("fooend")
    expect(ctx.state.register).toBe("(bar)")
  })

  test("text object escape cancels", () => {
    const ctx = createHandler("hello world")
    ctx.handler.handleKey(createEvent("c").event)
    ctx.handler.handleKey(createEvent("i").event)
    expect(ctx.state.pending()).toBe("ci")
    ctx.handler.handleKey(createEvent("escape").event)
    expect(ctx.state.pending()).toBe("")
    expect(ctx.textarea.plainText).toBe("hello world")
  })

  test("text object with no match is no-op", () => {
    const ctx = createHandler("hello world")
    ctx.textarea.cursorOffset = 3

    ctx.handler.handleKey(createEvent("c").event)
    ctx.handler.handleKey(createEvent("i").event)
    ctx.handler.handleKey(createEvent('"').event)
    // no quotes in text, should be no-op except clearing pending
    expect(ctx.textarea.plainText).toBe("hello world")
    expect(ctx.state.pending()).toBe("")
    expect(ctx.state.mode()).toBe("normal")
  })
})

describe("vim scroll mapping", () => {
  test("vimScroll maps ctrl keys to actions", () => {
    expect(vimScroll(createEvent("e", { ctrl: true }).event)).toBe("line-down")
    expect(vimScroll(createEvent("y", { ctrl: true }).event)).toBe("line-up")
    expect(vimScroll(createEvent("f", { ctrl: true }).event)).toBe("page-down")
    expect(vimScroll(createEvent("b", { ctrl: true }).event)).toBe("page-up")
    // ctrl-d and ctrl-u are not intercepted (left for system use)
    expect(vimScroll(createEvent("d", { ctrl: true }).event)).toBe(undefined)
    expect(vimScroll(createEvent("u", { ctrl: true }).event)).toBe(undefined)
    expect(vimScroll(createEvent("b", { ctrl: true, meta: true }).event)).toBe(undefined)
    expect(vimScroll(createEvent("b", { ctrl: false }).event)).toBe(undefined)
  })
})
