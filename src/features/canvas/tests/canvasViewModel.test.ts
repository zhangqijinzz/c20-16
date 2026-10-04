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

  it('ignores NaN coordinates from cleared number inputs so devices never vanish', () => {
    const item = createItem('lamp')
    const moved = moveCanvasItem([item], item.id, Number.NaN, 240)
    expect(moved[0].x).toBe(item.x)
    expect(moved[0].y).toBe(240)
  })

  it('recovers an escaped item back inside the desk and leaves the others untouched', () => {
    const plan = createPlan('test', false)
    const escaped = { ...createItem('lamp'), x: 2200, y: -400 }
    const keeper = createItem('keyboard')
    const recovered = recoverCanvasItem([escaped, keeper], escaped.id, plan.deskWidthMm, plan.deskHeightMm)
    expect(recovered[0].x).toBe(plan.deskWidthMm - escaped.widthMm)
    expect(recovered[0].y).toBe(0)
    expect(recovered[1]).toEqual(keeper)
  })
})
