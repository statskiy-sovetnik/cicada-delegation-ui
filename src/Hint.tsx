import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

/** Сколько окошко держится после того, как курсор ушёл. */
const CLOSE_DELAY_MS = 500

/**
 * Открытой может быть только одна подсказка.
 *
 * Своё состояние у каждой этого не обеспечивает: из-за задержки закрытия при
 * переходе с одной на соседнюю обе остаются открытыми и перекрывают друг друга.
 * Реестр на модуле, а не контекст: провайдер ничего бы не дал, подсказки
 * разбросаны по дереву и общего родителя у них нет.
 */
const listeners = new Set<(active: string) => void>()

function claim(id: string): void {
  for (const listener of listeners) listener(id)
}

/**
 * Подсказка по наведению.
 *
 * Своим компонентом, а не атрибутом title: внутрь окошка нужна кнопка
 * копирования, значит до него надо успеть доехать курсором.
 *
 * Два условия, чтобы это работало. Первое — окошко закрывается с задержкой, а
 * возврат курсора её отменяет. Второе — между триггером и видимой рамкой нет
 * мёртвой зоны: отступ лежит внутри обёртки окошка, а не задан смещением.
 * Иначе курсор на полпути оказывается над карточкой, а она окошку не родитель —
 * `mouseleave` срабатывает, и подсказка исчезает.
 */
export function Hint({ trigger, children }: { trigger: ReactNode; children: ReactNode }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancel = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }

  useEffect(() => {
    // Открылась другая — эта закрывается сразу, не дожидаясь своей задержки.
    const listener = (active: string) => {
      if (active === id) return
      cancel()
      setOpen(false)
    }
    listeners.add(listener)
    // Таймер и подписка переживут размонтирование, если их не снять.
    return () => {
      listeners.delete(listener)
      cancel()
    }
  }, [id])

  return (
    <span
      className="hint"
      onMouseEnter={() => {
        cancel()
        claim(id)
        setOpen(true)
      }}
      onMouseLeave={() => {
        cancel()
        timer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS)
      }}
    >
      <span className="hint-trigger">{trigger}</span>
      {open && (
        <span className="hint-bubble">
          <span className="hint-bubble-inner">{children}</span>
        </span>
      )}
    </span>
  )
}

/** Кнопка копирования: подтверждение показывается на ней самой, без диалогов. */
export function Copy({ value }: { value: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className="link copy"
      onClick={() => {
        void navigator.clipboard
          .writeText(value)
          .then(() => {
            setDone(true)
            setTimeout(() => setDone(false), 1500)
          })
          .catch(() => setDone(false))
      }}
    >
      {done ? '✓ скопировано' : '⧉ копировать'}
    </button>
  )
}
