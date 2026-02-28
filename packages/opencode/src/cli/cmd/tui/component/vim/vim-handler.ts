import type { Accessor } from "solid-js"
import type { createVimState } from "./vim-state"
import type { TextareaRenderable } from "@opentui/core"
import { vimScroll, type VimScroll } from "./vim-scroll"
import { vimJump, type VimJump } from "./vim-motion-jump"
import {
  appendAfterCursor,
  appendLineEnd,
  aroundDelimiterRange,
  aroundWordRange,
  changeToLineEnd,
  deleteLineYank,
  deleteRange,
  deleteToLineEnd,
  deleteToLineEndYank,
  deleteUnderCursor,
  deleteUnderCursorYank,
  deleteWord,
  deleteWordYank,
  findCharBackward,
  findCharForward,
  innerDelimiterRange,
  innerWordRange,
  insertLineStart,
  joinLines,
  moveBigWordEnd,
  moveBigWordNext,
  moveBigWordPrev,
  moveFirstNonWhitespace,
  moveLeft,
  moveLineBeginning,
  moveLineDown,
  moveLineUp,
  moveRight,
  moveLineEnd,
  moveWordEnd,
  moveWordNext,
  moveWordPrev,
  openLineAbove,
  openLineBelow,
  putAfter,
  putBefore,
  replaceChar,
  substituteChar,
  substituteLine,
  toggleCase,
  type TextRange,
  yankLine,
  yankWord,
} from "./vim-motions"

export type VimEvent = {
  name?: string
  shift?: boolean
  ctrl?: boolean
  meta?: boolean
  super?: boolean
  preventDefault: () => void
}

export function createVimHandler(input: {
  enabled: Accessor<boolean>
  state: ReturnType<typeof createVimState>
  textarea: Accessor<TextareaRenderable>
  submit: () => void
  scroll: (action: VimScroll) => void
  jump: (action: VimJump) => void
  autocomplete?: () => false | "@" | "/"
  history?: (direction: -1 | 1) => string | undefined
}) {
  function hasModifier(event: VimEvent) {
    return !!event.ctrl || !!event.meta || !!event.super
  }

  function isPrintable(event: VimEvent) {
    return !!event.name && event.name.length === 1
  }

  function isShifted(event: VimEvent, key: string) {
    return event.name === key.toUpperCase() || (event.name === key && !!event.shift)
  }

  function repeat(n: number, fn: () => void) {
    for (let i = 0; i < n; i++) fn()
  }

  const delimPairs: Record<string, [string, string]> = {
    "(": ["(", ")"],
    ")": ["(", ")"],
    "[": ["[", "]"],
    "]": ["[", "]"],
    "{": ["{", "}"],
    "}": ["{", "}"],
    "<": ["<", ">"],
    ">": ["<", ">"],
    '"': ['"', '"'],
    "'": ["'", "'"],
    "`": ["`", "`"],
  }

  function textObjectRange(key: string, inner: boolean, text: string, offset: number): TextRange | undefined {
    if (key === "w") return inner ? innerWordRange(text, offset, false) : aroundWordRange(text, offset, false)
    if (key === "W") return inner ? innerWordRange(text, offset, true) : aroundWordRange(text, offset, true)
    const pair = delimPairs[key]
    if (pair)
      return inner
        ? innerDelimiterRange(text, offset, pair[0], pair[1])
        : aroundDelimiterRange(text, offset, pair[0], pair[1])
    return undefined
  }

  return {
    handleKey(event: VimEvent) {
      if (!input.enabled()) return false

      if (input.state.isInsert()) {
        if (event.name !== "escape") return false
        input.state.setMode("normal")
        event.preventDefault()
        return true
      }

      const key = event.name ?? ""

      // accumulate count digits (1-9 start, 0-9 continue)
      // 0 without prior count is line-beginning motion, not a count
      if (!hasModifier(event) && !event.shift && /^[0-9]$/.test(key) && !input.state.pending()) {
        if (key !== "0" || input.state.hasCount) {
          input.state.pushCount(key)
          event.preventDefault()
          return true
        }
      }

      const scroll = vimScroll(event)
      if (scroll) {
        input.state.clearPending()
        input.state.clearCount()
        input.scroll(scroll)
        event.preventDefault()
        return true
      }

      const jump = vimJump(event, input.state)
      if (jump.handled) {
        if (jump.action) {
          input.state.clearPending()
          input.state.clearCount()
          input.jump(jump.action)
        }
        event.preventDefault()
        return true
      }

      if (key === "escape") {
        if (!input.state.pending() && !input.state.hasCount) return false
        input.state.clearPending()
        input.state.clearCount()
        event.preventDefault()
        return true
      }

      if (input.state.pending() === "c") {
        const n = input.state.consumeCount()
        if (key === "c" && !event.shift && !hasModifier(event)) {
          substituteLine(input.textarea())
          input.state.clearPending()
          input.state.setMode("insert")
          event.preventDefault()
          return true
        }

        if (key === "i" && !event.shift && !hasModifier(event)) {
          input.state.setPending("ci")
          event.preventDefault()
          return true
        }

        if (key === "a" && !event.shift && !hasModifier(event)) {
          input.state.setPending("ca")
          event.preventDefault()
          return true
        }

        if (key === "w" && !event.shift && !hasModifier(event)) {
          repeat(n, () => deleteWord(input.textarea()))
          input.state.clearPending()
          input.state.setMode("insert")
          event.preventDefault()
          return true
        }

        if (hasModifier(event)) {
          input.state.clearPending()
          return false
        }

        input.state.clearPending()
      }

      if (input.state.pending() === "d") {
        const n = input.state.consumeCount()
        if (key === "d" && !event.shift && !hasModifier(event)) {
          let text = ""
          repeat(n, () => {
            text += (text ? "\n" : "") + deleteLineYank(input.textarea())
          })
          input.state.setRegister(text, "line")
          input.state.clearPending()
          event.preventDefault()
          return true
        }

        if (key === "i" && !event.shift && !hasModifier(event)) {
          input.state.setPending("di")
          event.preventDefault()
          return true
        }

        if (key === "a" && !event.shift && !hasModifier(event)) {
          input.state.setPending("da")
          event.preventDefault()
          return true
        }

        if (key === "w" && !event.shift && !hasModifier(event)) {
          let text = ""
          repeat(n, () => {
            text += deleteWordYank(input.textarea())
          })
          input.state.setRegister(text, "char")
          input.state.clearPending()
          event.preventDefault()
          return true
        }

        if (hasModifier(event)) {
          input.state.clearPending()
          return false
        }

        input.state.clearPending()
      }

      if (input.state.pending() === "r") {
        input.state.clearCount()
        if (isPrintable(event) && !hasModifier(event)) {
          replaceChar(input.textarea(), key)
          input.state.clearPending()
          event.preventDefault()
          return true
        }
        input.state.clearPending()
        if (key === "escape") {
          event.preventDefault()
          return true
        }
        return false
      }

      if (input.state.pending() === "y") {
        input.state.clearCount()
        if (key === "y" && !event.shift && !hasModifier(event)) {
          input.state.setRegister(yankLine(input.textarea()), "line")
          input.state.clearPending()
          event.preventDefault()
          return true
        }

        if (key === "i" && !event.shift && !hasModifier(event)) {
          input.state.setPending("yi")
          event.preventDefault()
          return true
        }

        if (key === "a" && !event.shift && !hasModifier(event)) {
          input.state.setPending("ya")
          event.preventDefault()
          return true
        }

        if (key === "w" && !event.shift && !hasModifier(event)) {
          input.state.setRegister(yankWord(input.textarea()), "char")
          input.state.clearPending()
          event.preventDefault()
          return true
        }

        if (hasModifier(event)) {
          input.state.clearPending()
          return false
        }

        input.state.clearPending()
      }

      // text object pending: ci/ca/di/da/yi/ya + object key
      const compound = input.state.pending()
      if (
        compound === "ci" ||
        compound === "ca" ||
        compound === "di" ||
        compound === "da" ||
        compound === "yi" ||
        compound === "ya"
      ) {
        input.state.clearCount()
        const inner = compound[1] === "i"
        const op = compound[0]

        if (!hasModifier(event) && isPrintable(event)) {
          const ta = input.textarea()
          const range = textObjectRange(key, inner, ta.plainText, ta.cursorOffset)
          if (range) {
            if (op === "y") {
              input.state.setRegister(ta.plainText.slice(range.start, range.end), "char")
            } else {
              const text = deleteRange(ta, range)
              input.state.setRegister(text, "char")
            }
            if (op === "c") input.state.setMode("insert")
          }
          input.state.clearPending()
          event.preventDefault()
          return true
        }

        input.state.clearPending()
        if (key === "escape") {
          event.preventDefault()
          return true
        }
        return false
      }

      const pendingFind = input.state.pending()
      if (pendingFind === "f" || pendingFind === "F" || pendingFind === "t" || pendingFind === "T") {
        const n = input.state.consumeCount()
        if (isPrintable(event) && !hasModifier(event)) {
          input.state.setLastFind({ type: pendingFind, char: key })
          const forward = pendingFind === "f" || pendingFind === "t"
          const stop = pendingFind === "t" || pendingFind === "T"
          repeat(n, () => {
            if (forward) findCharForward(input.textarea(), key, stop)
            else findCharBackward(input.textarea(), key, stop)
          })
          input.state.clearPending()
          event.preventDefault()
          return true
        }
        input.state.clearPending()
        if (key === "escape") {
          event.preventDefault()
          return true
        }
        return false
      }

      if (key === "return" && !hasModifier(event)) {
        input.submit()
        input.state.clearPending()
        event.preventDefault()
        return true
      }

      if ((key === "/" || key === "@") && !hasModifier(event)) {
        if (input.autocomplete?.() && input.textarea().cursorOffset === 0 && input.textarea().plainText.length === 0) {
          input.state.setMode("insert")
          return false
        }
        event.preventDefault()
        return true
      }

      if (key === "c" && !event.shift && !hasModifier(event)) {
        input.state.setPending("c")
        event.preventDefault()
        return true
      }

      if (key === "d" && !event.shift && !hasModifier(event)) {
        input.state.setPending("d")
        event.preventDefault()
        return true
      }

      if (key === "y" && !event.shift && !hasModifier(event)) {
        input.state.setPending("y")
        event.preventDefault()
        return true
      }

      if (key === "p" && !event.shift && !hasModifier(event)) {
        if (input.state.register) {
          putAfter(input.textarea(), input.state.register, input.state.registerType === "line")
        }
        event.preventDefault()
        return true
      }

      if (isShifted(event, "p") && !hasModifier(event)) {
        if (input.state.register) {
          putBefore(input.textarea(), input.state.register, input.state.registerType === "line")
        }
        event.preventDefault()
        return true
      }

      if (isShifted(event, "s") && !hasModifier(event)) {
        input.state.clearPending()
        substituteLine(input.textarea())
        input.state.setMode("insert")
        event.preventDefault()
        return true
      }

      if (key === "i" && !event.shift && !hasModifier(event)) {
        input.state.setMode("insert")
        event.preventDefault()
        return true
      }

      if (isShifted(event, "i") && !hasModifier(event)) {
        insertLineStart(input.textarea())
        input.state.setMode("insert")
        event.preventDefault()
        return true
      }

      if (key === "a" && !event.shift && !hasModifier(event)) {
        appendAfterCursor(input.textarea())
        input.state.setMode("insert")
        event.preventDefault()
        return true
      }

      if (isShifted(event, "a") && !hasModifier(event)) {
        appendLineEnd(input.textarea())
        input.state.setMode("insert")
        event.preventDefault()
        return true
      }

      if (key === "o" && !event.shift && !hasModifier(event)) {
        openLineBelow(input.textarea())
        input.state.setMode("insert")
        event.preventDefault()
        return true
      }

      if (isShifted(event, "o") && !hasModifier(event)) {
        openLineAbove(input.textarea())
        input.state.setMode("insert")
        event.preventDefault()
        return true
      }

      if (key === "h" && !event.shift && !hasModifier(event)) {
        repeat(input.state.consumeCount(), () => moveLeft(input.textarea()))
        event.preventDefault()
        return true
      }

      if (key === "l" && !event.shift && !hasModifier(event)) {
        repeat(input.state.consumeCount(), () => moveRight(input.textarea()))
        event.preventDefault()
        return true
      }

      if (key === "j" && !event.shift && !hasModifier(event)) {
        const n = input.state.consumeCount()
        const ta = input.textarea()
        const atLastLine = ta.plainText.indexOf("\n", ta.cursorOffset) === -1
        if (atLastLine && input.history) {
          const text = input.history(1)
          if (text !== undefined) {
            ta.setText(text)
            ta.cursorOffset = ta.plainText.length
            event.preventDefault()
            return true
          }
        }
        repeat(n, () => moveLineDown(ta))
        event.preventDefault()
        return true
      }

      if (key === "k" && !event.shift && !hasModifier(event)) {
        const n = input.state.consumeCount()
        const ta = input.textarea()
        const atFirstLine = ta.plainText.lastIndexOf("\n", ta.cursorOffset - 1) === -1
        if (atFirstLine && input.history) {
          const text = input.history(-1)
          if (text !== undefined) {
            ta.setText(text)
            ta.cursorOffset = 0
            event.preventDefault()
            return true
          }
        }
        repeat(n, () => moveLineUp(ta))
        event.preventDefault()
        return true
      }

      if (key === "0" && !event.shift && !hasModifier(event)) {
        moveLineBeginning(input.textarea())
        event.preventDefault()
        return true
      }

      if (key === "^" && !hasModifier(event)) {
        moveFirstNonWhitespace(input.textarea())
        event.preventDefault()
        return true
      }

      if (key === "$" && !hasModifier(event)) {
        moveLineEnd(input.textarea())
        event.preventDefault()
        return true
      }

      if (key === "x" && !event.shift && !hasModifier(event)) {
        const n = input.state.consumeCount()
        let text = ""
        repeat(n, () => {
          text += deleteUnderCursorYank(input.textarea())
        })
        if (text) input.state.setRegister(text, "char")
        event.preventDefault()
        return true
      }

      if (key === "s" && !event.shift && !hasModifier(event)) {
        substituteChar(input.textarea())
        input.state.setMode("insert")
        event.preventDefault()
        return true
      }

      if (key === "r" && !event.shift && !hasModifier(event)) {
        input.state.setPending("r")
        event.preventDefault()
        return true
      }

      if (key === "f" && !event.shift && !hasModifier(event)) {
        input.state.setPending("f")
        event.preventDefault()
        return true
      }

      if (isShifted(event, "f") && !hasModifier(event)) {
        input.state.setPending("F")
        event.preventDefault()
        return true
      }

      if (key === "t" && !event.shift && !hasModifier(event)) {
        input.state.setPending("t")
        event.preventDefault()
        return true
      }

      if (isShifted(event, "t") && !hasModifier(event)) {
        input.state.setPending("T")
        event.preventDefault()
        return true
      }

      if (key === ";" && !hasModifier(event)) {
        const last = input.state.lastFind
        if (last) {
          const n = input.state.consumeCount()
          const forward = last.type === "f" || last.type === "t"
          const before = last.type === "t" || last.type === "T"
          repeat(n, () => {
            if (forward) findCharForward(input.textarea(), last.char, before)
            else findCharBackward(input.textarea(), last.char, before)
          })
        }
        event.preventDefault()
        return true
      }

      if (key === "," && !hasModifier(event)) {
        const last = input.state.lastFind
        if (last) {
          const n = input.state.consumeCount()
          const forward = last.type === "f" || last.type === "t"
          const before = last.type === "t" || last.type === "T"
          // reverse direction
          repeat(n, () => {
            if (forward) findCharBackward(input.textarea(), last.char, before)
            else findCharForward(input.textarea(), last.char, before)
          })
        }
        event.preventDefault()
        return true
      }

      if (key === "u" && !event.shift && !hasModifier(event)) {
        input.textarea().undo()
        event.preventDefault()
        return true
      }

      if (key === "r" && event.ctrl && !event.meta) {
        input.textarea().redo()
        event.preventDefault()
        return true
      }

      if (isShifted(event, "d") && !hasModifier(event)) {
        const text = deleteToLineEndYank(input.textarea())
        if (text) input.state.setRegister(text, "char")
        event.preventDefault()
        return true
      }

      if (isShifted(event, "c") && !hasModifier(event)) {
        changeToLineEnd(input.textarea())
        input.state.setMode("insert")
        event.preventDefault()
        return true
      }

      if (isShifted(event, "j") && !hasModifier(event)) {
        joinLines(input.textarea())
        event.preventDefault()
        return true
      }

      if (key === "~" && !hasModifier(event)) {
        repeat(input.state.consumeCount(), () => toggleCase(input.textarea()))
        event.preventDefault()
        return true
      }

      if (key === "w" && !event.shift && !hasModifier(event)) {
        repeat(input.state.consumeCount(), () => moveWordNext(input.textarea()))
        event.preventDefault()
        return true
      }

      if (key === "b" && !event.shift && !hasModifier(event)) {
        repeat(input.state.consumeCount(), () => moveWordPrev(input.textarea()))
        event.preventDefault()
        return true
      }

      if (key === "e" && !event.shift && !hasModifier(event)) {
        repeat(input.state.consumeCount(), () => moveWordEnd(input.textarea()))
        event.preventDefault()
        return true
      }

      if (isShifted(event, "w") && !hasModifier(event)) {
        repeat(input.state.consumeCount(), () => moveBigWordNext(input.textarea()))
        event.preventDefault()
        return true
      }

      if (isShifted(event, "b") && !hasModifier(event)) {
        repeat(input.state.consumeCount(), () => moveBigWordPrev(input.textarea()))
        event.preventDefault()
        return true
      }

      if (isShifted(event, "e") && !hasModifier(event)) {
        repeat(input.state.consumeCount(), () => moveBigWordEnd(input.textarea()))
        event.preventDefault()
        return true
      }

      if (key === "backspace" || key === "delete") {
        event.preventDefault()
        return true
      }

      if (isPrintable(event) && !hasModifier(event)) {
        input.state.clearCount()
        event.preventDefault()
        return true
      }

      input.state.clearCount()
      return false
    },
  }
}
