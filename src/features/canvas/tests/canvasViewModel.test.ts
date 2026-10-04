import { describe, expect, it } from 'vitest'
import { createItem, createPlan } from '../../../shared/models'
import { moveCanvasItem, recoverCanvasItem, rotateCanvasItem } from '../canvasViewModel'

describe('canvas module', () => {
  it('moves and rotates the requested item without changing other items', () => {
    const first = createItem('monitor')
    const second = createItem('keyboard')
    const moved = moveCanvasItem([first, second], first.id, 320, 180)
    const rotated = rotateCanvasItem(moved, first.id, -15)
    expect(rotated[0]).toMatchObject({ x: 320, y: 180, rotation: 345 })
    expect(rotated[1]).toEqual(second)
  })

  it('recovers the escaped item and leaves the other items untouched', () => {
    const plan = createPlan('test', false)
    const escaped = { ...createItem('lamp'), x: 1900, y: 100 }
    const other = createItem('keyboard')
    const recovered = recoverCanvasItem([escaped, other], escaped.id, plan)
    expect(recovered[0].x + escaped.widthMm).toBeLessThanOrEqual(plan.deskWidthMm)
    expect(recovered[0].x).toBeGreaterThanOrEqual(0)
    expect(recovered[1]).toEqual(other)
  })

  it('does not move an item that is already inside the desk', () => {
    const plan = createPlan('test', false)
    const inside = { ...createItem('monitor'), x: 200, y: 150 }
    const [result] = recoverCanvasItem([inside], inside.id, plan)
    expect(result).toEqual(inside)
  })
})
