import { createEffect, createMemo, createSignal, type Accessor } from "solid-js"

export type VimMode = "normal" | "insert"
export type VimPending =
  | ""
  | "c"
  | "d"
  | "g"
  | "r"
  | "y"
  | "f"
  | "F"
  | "t"
  | "T"
  | "ci"
  | "ca"
  | "di"
  | "da"
  | "yi"
  | "ya"
export type RegisterType = "char" | "line"
export type FindChar = { type: "f" | "F" | "t" | "T"; char: string }

export function createVimState(input: { enabled: Accessor<boolean>; initial?: Accessor<VimMode | undefined> }) {
  const [mode, setMode] = createSignal<VimMode>(input.initial?.() ?? "insert")
  const [pending, setPending] = createSignal<VimPending>("")
  let register = ""
  let registerType: RegisterType = "char"
  let count = ""
  let lastFind: FindChar | undefined

  function clearPending() {
    if (pending()) setPending("")
  }

  function clearCount() {
    count = ""
  }

  function changeMode(next: VimMode) {
    clearPending()
    clearCount()
    setMode(next)
  }

  createEffect(() => {
    const enabled = input.enabled()

    if (!enabled) {
      if (mode() !== "insert") setMode("insert")
      clearPending()
      return
    }
  })

  return {
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
    isInsert: createMemo(() => mode() === "insert"),
    setRegister(text: string, type: RegisterType) {
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
    setLastFind(find: FindChar) {
      lastFind = find
    },
    get lastFind() {
      return lastFind
    },
  }
}
