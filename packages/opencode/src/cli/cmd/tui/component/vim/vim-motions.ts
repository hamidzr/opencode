import type { TextareaRenderable } from "@opentui/core"

function lineStart(text: string, offset: number) {
  if (offset <= 0) return 0
  const index = text.lastIndexOf("\n", offset - 1)
  if (index === -1) return 0
  return index + 1
}

function lineEnd(text: string, offset: number) {
  const index = text.indexOf("\n", offset)
  if (index === -1) return text.length
  return index
}

function lineLast(text: string, offset: number) {
  const start = lineStart(text, offset)
  const end = lineEnd(text, offset)
  if (end > start) return end - 1
  return start
}

function prevLineStart(text: string, offset: number) {
  const start = lineStart(text, offset)
  if (start === 0) return undefined
  return lineStart(text, start - 1)
}

function nextLineStart(text: string, offset: number) {
  const end = lineEnd(text, offset)
  if (end >= text.length) return undefined
  return end + 1
}

function moveUp(text: string, offset: number) {
  const currentStart = lineStart(text, offset)
  const targetStart = prevLineStart(text, offset)
  if (targetStart === undefined) return offset
  const targetLast = lineLast(text, targetStart)
  const col = offset - currentStart
  return Math.min(targetStart + col, targetLast)
}

function moveDown(text: string, offset: number) {
  const currentStart = lineStart(text, offset)
  const targetStart = nextLineStart(text, offset)
  if (targetStart === undefined) return offset
  const targetLast = lineLast(text, targetStart)
  const col = offset - currentStart
  return Math.min(targetStart + col, targetLast)
}

export function moveLeft(textarea: TextareaRenderable) {
  const text = textarea.plainText
  const start = lineStart(text, textarea.cursorOffset)
  textarea.cursorOffset = Math.max(start, textarea.cursorOffset - 1)
}

export function moveLineBeginning(textarea: TextareaRenderable) {
  const text = textarea.plainText
  textarea.cursorOffset = lineStart(text, textarea.cursorOffset)
}

export function moveFirstNonWhitespace(textarea: TextareaRenderable) {
  const text = textarea.plainText
  textarea.cursorOffset = firstNonWhitespace(text, textarea.cursorOffset)
}

export function moveLineEnd(textarea: TextareaRenderable) {
  const text = textarea.plainText
  textarea.cursorOffset = lineLast(text, textarea.cursorOffset)
}

export function moveRight(textarea: TextareaRenderable) {
  const text = textarea.plainText
  const last = lineLast(text, textarea.cursorOffset)
  textarea.cursorOffset = Math.min(last, textarea.cursorOffset + 1)
}

export function moveLineUp(textarea: TextareaRenderable) {
  const text = textarea.plainText
  textarea.cursorOffset = moveUp(text, textarea.cursorOffset)
}

export function moveLineDown(textarea: TextareaRenderable) {
  const text = textarea.plainText
  textarea.cursorOffset = moveDown(text, textarea.cursorOffset)
}

function isWord(char: string) {
  return /[A-Za-z0-9_]/.test(char)
}

function isBigWord(char: string) {
  return !/\s/.test(char)
}

function nextWordStart(text: string, offset: number, big: boolean) {
  const match = big ? isBigWord : isWord
  let pos = offset
  if (pos < text.length && match(text[pos])) {
    while (pos < text.length && match(text[pos])) pos++
  }
  while (pos < text.length && !match(text[pos])) pos++
  return pos
}

function prevWordStart(text: string, offset: number, big: boolean) {
  const match = big ? isBigWord : isWord
  let pos = offset
  while (pos > 0 && !match(text[pos - 1])) pos--
  while (pos > 0 && match(text[pos - 1])) pos--
  return pos
}

function wordEnd(text: string, offset: number, big: boolean) {
  if (text.length === 0) return 0
  const match = big ? isBigWord : isWord
  let pos = offset
  if (pos >= text.length) pos = text.length - 1

  if (match(text[pos]) && (pos + 1 >= text.length || !match(text[pos + 1]))) {
    pos++
  }

  while (pos < text.length && !match(text[pos])) pos++
  if (pos >= text.length) return text.length - 1

  while (pos + 1 < text.length && match(text[pos + 1])) pos++
  return pos
}

function deleteOffsets(textarea: TextareaRenderable, startOffset: number, endOffset: number): string {
  if (endOffset <= startOffset) return ""
  const deleted = textarea.plainText.slice(startOffset, endOffset)
  textarea.cursorOffset = startOffset
  const start = textarea.logicalCursor
  textarea.cursorOffset = endOffset
  const end = textarea.logicalCursor
  textarea.deleteRange(start.row, start.col, end.row, end.col)
  textarea.cursorOffset = startOffset
  return deleted
}

export function moveWordNext(textarea: TextareaRenderable) {
  const text = textarea.plainText
  textarea.cursorOffset = nextWordStart(text, textarea.cursorOffset, false)
}

export function moveWordPrev(textarea: TextareaRenderable) {
  const text = textarea.plainText
  textarea.cursorOffset = prevWordStart(text, textarea.cursorOffset, false)
}

export function moveWordEnd(textarea: TextareaRenderable) {
  const text = textarea.plainText
  textarea.cursorOffset = wordEnd(text, textarea.cursorOffset, false)
}

export function moveBigWordNext(textarea: TextareaRenderable) {
  const text = textarea.plainText
  textarea.cursorOffset = nextWordStart(text, textarea.cursorOffset, true)
}

export function moveBigWordPrev(textarea: TextareaRenderable) {
  const text = textarea.plainText
  textarea.cursorOffset = prevWordStart(text, textarea.cursorOffset, true)
}

export function moveBigWordEnd(textarea: TextareaRenderable) {
  const text = textarea.plainText
  textarea.cursorOffset = wordEnd(text, textarea.cursorOffset, true)
}

function firstNonWhitespace(text: string, offset: number) {
  const start = lineStart(text, offset)
  const end = lineEnd(text, offset)
  let pos = start
  while (pos < end && /\s/.test(text[pos])) pos++
  return pos
}

export function appendAfterCursor(textarea: TextareaRenderable) {
  const text = textarea.plainText
  const end = lineEnd(text, textarea.cursorOffset)
  textarea.cursorOffset = Math.min(textarea.cursorOffset + 1, end)
}

export function appendLineEnd(textarea: TextareaRenderable) {
  const text = textarea.plainText
  textarea.cursorOffset = lineEnd(text, textarea.cursorOffset)
}

export function insertLineStart(textarea: TextareaRenderable) {
  const text = textarea.plainText
  textarea.cursorOffset = firstNonWhitespace(text, textarea.cursorOffset)
}

export function openLineBelow(textarea: TextareaRenderable) {
  const text = textarea.plainText
  const end = lineEnd(text, textarea.cursorOffset)
  textarea.cursorOffset = end
  textarea.insertText("\n")
}

export function openLineAbove(textarea: TextareaRenderable) {
  const text = textarea.plainText
  const start = lineStart(text, textarea.cursorOffset)
  textarea.cursorOffset = start
  textarea.insertText("\n")
  textarea.cursorOffset = start
}

export function deleteUnderCursor(textarea: TextareaRenderable) {
  const text = textarea.plainText
  const startOffset = textarea.cursorOffset
  const end = lineEnd(text, startOffset)
  if (startOffset >= end) return
  deleteOffsets(textarea, startOffset, startOffset + 1)
}

export function deleteWord(textarea: TextareaRenderable) {
  const text = textarea.plainText
  const startOffset = textarea.cursorOffset
  const endOffset = nextWordStart(text, startOffset, false)
  deleteOffsets(textarea, startOffset, endOffset)
}

export function deleteLine(textarea: TextareaRenderable) {
  const text = textarea.plainText
  if (!text.length) return

  const offset = textarea.cursorOffset
  const start = lineStart(text, offset)
  const end = lineEnd(text, offset)

  if (end < text.length) {
    deleteOffsets(textarea, start, end + 1)
    return
  }

  if (start > 0) {
    deleteOffsets(textarea, start - 1, end)
    textarea.cursorOffset = lineStart(textarea.plainText, textarea.cursorOffset)
    return
  }

  deleteOffsets(textarea, start, end)
}

export function substituteLine(textarea: TextareaRenderable) {
  const text = textarea.plainText
  const start = lineStart(text, textarea.cursorOffset)
  const end = lineEnd(text, textarea.cursorOffset)
  deleteOffsets(textarea, start, end)
}

export function deleteToLineEnd(textarea: TextareaRenderable) {
  const text = textarea.plainText
  const offset = textarea.cursorOffset
  const end = lineEnd(text, offset)
  if (offset >= end) return
  deleteOffsets(textarea, offset, end)
}

export function changeToLineEnd(textarea: TextareaRenderable) {
  deleteToLineEnd(textarea)
}

export function substituteChar(textarea: TextareaRenderable) {
  deleteUnderCursor(textarea)
}

export function replaceChar(textarea: TextareaRenderable, char: string) {
  const text = textarea.plainText
  const offset = textarea.cursorOffset
  const end = lineEnd(text, offset)
  if (offset >= end) return
  deleteOffsets(textarea, offset, offset + 1)
  textarea.insertText(char)
  textarea.cursorOffset = offset
}

export function joinLines(textarea: TextareaRenderable) {
  const text = textarea.plainText
  const offset = textarea.cursorOffset
  const end = lineEnd(text, offset)
  if (end >= text.length) return
  // delete the newline and any leading whitespace on next line
  let pos = end + 1
  while (pos < text.length && text[pos] === " ") pos++
  deleteOffsets(textarea, end, pos)
  textarea.insertText(" ")
  textarea.cursorOffset = end
}

export function toggleCase(textarea: TextareaRenderable) {
  const text = textarea.plainText
  const offset = textarea.cursorOffset
  const end = lineEnd(text, offset)
  if (offset >= end) return
  const char = text[offset]
  const toggled = char === char.toLowerCase() ? char.toUpperCase() : char.toLowerCase()
  deleteOffsets(textarea, offset, offset + 1)
  textarea.insertText(toggled)
  // move cursor right like vim
  const newEnd = lineEnd(textarea.plainText, textarea.cursorOffset)
  textarea.cursorOffset = Math.min(offset + 1, newEnd - 1)
}

// text object range helpers
export type TextRange = { start: number; end: number }

export function innerWordRange(text: string, offset: number, big: boolean): TextRange | undefined {
  if (!text.length) return undefined
  const match = big ? isBigWord : isWord
  const pos = Math.min(offset, text.length - 1)
  if (match(text[pos])) {
    let start = pos
    let end = pos
    while (start > 0 && match(text[start - 1])) start--
    while (end + 1 < text.length && match(text[end + 1])) end++
    return { start, end: end + 1 }
  }
  // on whitespace, select the whitespace
  let start = pos
  let end = pos
  while (start > 0 && !match(text[start - 1]) && text[start - 1] !== "\n") start--
  while (end + 1 < text.length && !match(text[end + 1]) && text[end + 1] !== "\n") end++
  return { start, end: end + 1 }
}

export function aroundWordRange(text: string, offset: number, big: boolean): TextRange | undefined {
  if (!text.length) return undefined
  const match = big ? isBigWord : isWord
  const pos = Math.min(offset, text.length - 1)
  if (match(text[pos])) {
    let start = pos
    let end = pos
    while (start > 0 && match(text[start - 1])) start--
    while (end + 1 < text.length && match(text[end + 1])) end++
    // include trailing whitespace
    while (end + 1 < text.length && text[end + 1] === " ") end++
    if (end + 1 === text.length || text[end + 1] === "\n") {
      // no trailing space, try leading
      while (start > 0 && text[start - 1] === " ") start--
    }
    return { start, end: end + 1 }
  }
  return innerWordRange(text, offset, big)
}

export function innerDelimiterRange(text: string, offset: number, open: string, close: string): TextRange | undefined {
  if (open === close) {
    // for same-char delimiters (quotes), find nearest pair around offset
    let start = -1
    for (let i = offset - 1; i >= 0; i--) {
      if (text[i] === open) {
        start = i
        break
      }
    }
    // also check if cursor is on the opening delimiter
    if (start === -1 && text[offset] === open) start = offset
    if (start === -1) return undefined
    for (let i = Math.max(start + 1, offset); i < text.length; i++) {
      if (text[i] === close) return { start: start + 1, end: i }
    }
    return undefined
  }
  let depth = 0
  let start = -1
  // search backward for opening
  for (let i = offset; i >= 0; i--) {
    if (text[i] === close && i !== offset) depth++
    if (text[i] === open) {
      if (depth === 0) {
        start = i + 1
        break
      }
      depth--
    }
  }
  if (start === -1) return undefined
  // search forward for closing
  depth = 0
  for (let i = offset; i < text.length; i++) {
    if (text[i] === open && i !== start - 1) depth++
    if (text[i] === close) {
      if (depth === 0) return { start, end: i }
      depth--
    }
  }
  return undefined
}

export function aroundDelimiterRange(text: string, offset: number, open: string, close: string): TextRange | undefined {
  const inner = innerDelimiterRange(text, offset, open, close)
  if (!inner) return undefined
  return { start: inner.start - 1, end: inner.end + 1 }
}

export function deleteRange(textarea: TextareaRenderable, range: TextRange): string {
  return deleteOffsets(textarea, range.start, range.end)
}

export function findCharForward(textarea: TextareaRenderable, char: string, before: boolean) {
  const text = textarea.plainText
  const offset = textarea.cursorOffset
  const end = lineEnd(text, offset)
  for (let i = offset + 1; i < end; i++) {
    if (text[i] === char) {
      textarea.cursorOffset = before ? i - 1 : i
      return
    }
  }
}

export function findCharBackward(textarea: TextareaRenderable, char: string, after: boolean) {
  const text = textarea.plainText
  const offset = textarea.cursorOffset
  const start = lineStart(text, offset)
  for (let i = offset - 1; i >= start; i--) {
    if (text[i] === char) {
      textarea.cursorOffset = after ? i + 1 : i
      return
    }
  }
}

export function yankLine(textarea: TextareaRenderable): string {
  const text = textarea.plainText
  const start = lineStart(text, textarea.cursorOffset)
  const end = lineEnd(text, textarea.cursorOffset)
  return text.slice(start, end)
}

export function yankWord(textarea: TextareaRenderable): string {
  const text = textarea.plainText
  const start = textarea.cursorOffset
  const end = nextWordStart(text, start, false)
  return text.slice(start, end)
}

export function deleteLineYank(textarea: TextareaRenderable): string {
  const text = textarea.plainText
  if (!text.length) return ""
  const offset = textarea.cursorOffset
  const start = lineStart(text, offset)
  const end = lineEnd(text, offset)
  const content = text.slice(start, end)
  if (end < text.length) {
    deleteOffsets(textarea, start, end + 1)
    return content
  }
  if (start > 0) {
    deleteOffsets(textarea, start - 1, end)
    textarea.cursorOffset = lineStart(textarea.plainText, textarea.cursorOffset)
    return content
  }
  deleteOffsets(textarea, start, end)
  return content
}

export function deleteWordYank(textarea: TextareaRenderable): string {
  const text = textarea.plainText
  const start = textarea.cursorOffset
  const end = nextWordStart(text, start, false)
  return deleteOffsets(textarea, start, end)
}

export function deleteToLineEndYank(textarea: TextareaRenderable): string {
  const text = textarea.plainText
  const offset = textarea.cursorOffset
  const end = lineEnd(text, offset)
  if (offset >= end) return ""
  return deleteOffsets(textarea, offset, end)
}

export function deleteUnderCursorYank(textarea: TextareaRenderable): string {
  const text = textarea.plainText
  const offset = textarea.cursorOffset
  const end = lineEnd(text, offset)
  if (offset >= end) return ""
  return deleteOffsets(textarea, offset, offset + 1)
}

export function putAfter(textarea: TextareaRenderable, text: string, linewise: boolean) {
  if (linewise) {
    const end = lineEnd(textarea.plainText, textarea.cursorOffset)
    textarea.cursorOffset = end
    textarea.insertText("\n" + text)
    textarea.cursorOffset = end + 1
    return
  }
  const end = lineEnd(textarea.plainText, textarea.cursorOffset)
  textarea.cursorOffset = Math.min(textarea.cursorOffset + 1, end)
  textarea.insertText(text)
  textarea.cursorOffset = textarea.cursorOffset - 1
}

export function putBefore(textarea: TextareaRenderable, text: string, linewise: boolean) {
  if (linewise) {
    const start = lineStart(textarea.plainText, textarea.cursorOffset)
    textarea.cursorOffset = start
    textarea.insertText(text + "\n")
    textarea.cursorOffset = start
    return
  }
  textarea.insertText(text)
  textarea.cursorOffset = textarea.cursorOffset - 1
}
