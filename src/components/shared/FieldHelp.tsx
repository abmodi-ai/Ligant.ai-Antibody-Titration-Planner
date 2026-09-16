/**
 * The guidance trigger beside a field label, and the panel it opens.
 *
 * WHY A BUTTON AND NOT A HOVER TARGET. Hover is unavailable on touch and
 * invisible to a keyboard, and the guidance this opens is the difference
 * between a staining volume entered as the final volume and one entered as
 * the volume before antibody. A control carrying that has to be reachable by
 * every reader, so the trigger is a real `<button>`: it takes focus, it
 * responds to Enter and to Space natively (no key handler here, which would
 * double-fire), and it toggles rather than only opening, so the same key that
 * opened it closes it.
 *
 * WHY `position: fixed`. `.panel` sets `overflow: hidden` for its rounded
 * corners, so a popover positioned within the panel's own flow is clipped by
 * it. Fixed coordinates computed from the trigger's own rect escape every
 * ancestor's clipping and make the viewport arithmetic direct, which is what
 * acceptance T6 measures.
 *
 * WHY IT OPENS TO THE SIDE. The trigger sits on the label line and the
 * control sits directly beneath it, so a panel dropped below the trigger
 * would cover the field it is explaining. It opens to the right of the
 * trigger where there is room and to the left where there is not, and is
 * clamped vertically into the viewport rather than allowed to run off the
 * bottom.
 *
 * ONE AT A TIME is owned by `FieldHelpProvider`, a single piece of state at
 * the top of the page rather than per-tooltip local state plus a document
 * listener. Two tooltips cannot both believe they are open, and clicking from
 * one trigger straight to another cannot race.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { FIELD_GUIDANCE } from '../../lib/guidance'

interface FieldHelpState {
  openId: string | null
  setOpenId: (id: string | null) => void
}

const FieldHelpContext = createContext<FieldHelpState>({ openId: null, setOpenId: () => {} })

export function FieldHelpProvider({ children }: { children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null)
  return (
    <FieldHelpContext.Provider value={{ openId, setOpenId }}>{children}</FieldHelpContext.Provider>
  )
}

const PANEL_WIDTH = 320
const VIEWPORT_MARGIN = 12
const GAP = 8

interface Props {
  /** The `id` of the control this explains, and the key into FIELD_GUIDANCE. */
  id: string
  /** The field's own name, for the trigger's accessible name. */
  label: string
  /** Copy override, for the marker triggers, which are not form fields. */
  text?: string
}

export function FieldHelp({ id, label, text }: Props) {
  const { openId, setOpenId } = useContext(FieldHelpContext)
  const open = openId === id
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

  const body = text ?? FIELD_GUIDANCE[id] ?? ''

  /** Close, and put focus back where the reader left it. T5. */
  const close = useCallback(() => {
    setOpenId(null)
    triggerRef.current?.focus()
  }, [setOpenId])

  // Placement, measured after the panel exists so its real height is known
  // rather than assumed. Runs before paint, so the panel is never briefly
  // visible in the wrong place.
  useLayoutEffect(() => {
    if (!open) {
      setPosition(null)
      return
    }
    const trigger = triggerRef.current
    const panel = panelRef.current
    if (trigger === null || panel === null) return
    const rect = trigger.getBoundingClientRect()
    const height = panel.offsetHeight

    let left = rect.right + GAP
    if (left + PANEL_WIDTH + VIEWPORT_MARGIN > window.innerWidth) {
      left = rect.left - PANEL_WIDTH - GAP
    }
    if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN

    let top = rect.top - 4
    if (top + height + VIEWPORT_MARGIN > window.innerHeight) {
      top = window.innerHeight - height - VIEWPORT_MARGIN
    }
    if (top < VIEWPORT_MARGIN) top = VIEWPORT_MARGIN

    setPosition({ top, left })
  }, [open, body])

  /*
   * Focus into the panel on open. T5.
   *
   * Keyed on the POSITION being known, not just on `open`: until it is, the
   * panel is still `visibility: hidden` (so it cannot be seen in the wrong
   * place for a frame), and a hidden element cannot take focus. Focusing on
   * `open` alone silently did nothing, which the acceptance check caught.
   */
  useLayoutEffect(() => {
    if (open && position !== null) panelRef.current?.focus()
  }, [open, position !== null])

  // Escape from anywhere, and a pointer press outside. Both return focus to
  // the trigger, which is the path most often missed: closing by clicking
  // away must not strand focus on the document body.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        close()
      }
    }
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (panelRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      close()
    }
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('mousedown', onPointerDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('mousedown', onPointerDown, true)
    }
  }, [open, close])

  if (body === '') return null

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        className="field-help-trigger"
        /* So the acceptance check can address one field's trigger exactly,
           rather than matching on a label that is also prose. */
        data-help-for={id}
        aria-label={`What goes in this field: ${label}`}
        aria-expanded={open}
        onClick={() => setOpenId(open ? null : id)}
      >
        <span aria-hidden="true">?</span>
      </button>
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={label}
          tabIndex={-1}
          className="field-help-panel"
          style={{
            top: position?.top ?? -9999,
            left: position?.left ?? -9999,
            width: PANEL_WIDTH,
            visibility: position === null ? 'hidden' : 'visible',
          }}
        >
          {body}
        </div>
      )}
    </>
  )
}
