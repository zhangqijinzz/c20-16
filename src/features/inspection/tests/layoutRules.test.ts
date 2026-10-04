import { describe, expect, it } from 'vitest'
import { createPlan, createItem } from '../../../shared/models'
import { analyzeLayout, getItemBounds, getRecoveredPosition, isItemOutOfBounds, normalizeRotation } from '../../../shared/layoutRules'

describe('workspace rules', () => {
  it('normalizes rotation and calculates rotated bounds around the item center', () => {
    const item = { ...createItem('monitor'), x: 100, y: 100, widthMm: 400, heightMm: 200, rotation: 90 }
    const bounds = getItemBounds(item)
    expect(normalizeRotation(-15)).toBe(345)
    expect(Math.round(bounds.width)).toBe(200)
    expect(Math.round(bounds.height)).toBe(400)
    expect(Math.round(bounds.left)).toBe(200)
  })

  it('detects overlap and out-of-bounds items', () => {
    const plan = createPlan('test', false)
    const first = { ...createItem('monitor'), x: 100, y: 100, widthMm: 400, heightMm: 200 }
    const second = { ...createItem('keyboard'), x: 300, y: 150, widthMm: 400, heightMm: 200 }
    const outside = { ...createItem('lamp'), x: 1500, y: 700 }
    const analysis = analyzeLayout({ ...plan, items: [first, second, outside] })
    expect(analysis.overlapIds).toEqual(expect.arrayContaining([first.id, second.id]))
    expect(analysis.outOfBoundsIds).toContain(outside.id)
    expect(analysis.status).toBe('attention')
  })

  it('returns a healthy state for separated items', () => {
    const plan = createPlan('test', false)
    const first = { ...createItem('monitor'), x: 100, y: 100 }
    const second = { ...createItem('keyboard'), x: 800, y: 500 }
    const analysis = analyzeLayout({ ...plan, items: [first, second] })
    expect(analysis.status).toBe('clear')
    expect(analysis.coveragePercent).toBeGreaterThan(0)
  })

  it('detects an item that has escaped the desk', () => {
    const plan = createPlan('test', false)
    const inside = { ...createItem('monitor'), x: 100, y: 100 }
    const escaped = { ...createItem('lamp'), x: 2000, y: 100 }
    expect(isItemOutOfBounds(inside, plan)).toBe(false)
    expect(isItemOutOfBounds(escaped, plan)).toBe(true)
  })

  it('recovers an escaped item with the smallest possible move', () => {
    const plan = createPlan('test', false)
    const item = { ...createItem('lamp'), x: 1500, y: 300, widthMm: 180, heightMm: 180 }
    const recovered = getRecoveredPosition(item, plan)
    expect(recovered.x).toBe(plan.deskWidthMm - item.widthMm)
    expect(recovered.y).toBe(item.y)
    expect(isItemOutOfBounds({ ...item, ...recovered }, plan)).toBe(false)
  })

  it('recovers an item past the top-left corner and centers oversized items', () => {
    const plan = createPlan('test', false)
    const negative = { ...createItem('monitor'), x: -120, y: -80, widthMm: 400, heightMm: 200 }
    const topLeft = getRecoveredPosition(negative, plan)
    expect(topLeft).toEqual({ x: 0, y: 0 })

    const oversized = { ...createItem('monitor'), x: -400, y: -200, widthMm: 2000, heightMm: 900 }
    const centered = getRecoveredPosition(oversized, plan)
    expect(centered.x).toBeCloseTo(-200)
    expect(centered.y).toBeCloseTo(-50)
  })
})
