import { describe, expect, it } from 'vitest'
import { createPlan, createItem } from '../../../shared/models'
import { analyzeLayout, getEscapeEdge, getItemBounds, isBeyondView, isCompletelyOutside, normalizeRotation, recoverItemPosition } from '../../../shared/layoutRules'

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

  it('distinguishes partially out-of-bounds items from fully escaped ones', () => {
    const margin = 160
    // 设备左半边压在桌面上：不算完全跑出桌面，但已经越界。
    const partial = { ...createItem('monitor'), x: -200, y: 100 }
    const partialBounds = getItemBounds(partial)
    expect(isCompletelyOutside(partialBounds, 1600, 800)).toBe(false)
    expect(partialBounds.left < 0).toBe(true)
    // 完全飞出右边界。
    const escaped = { ...createItem('lamp'), x: 2200, y: 100 }
    const escapedBounds = getItemBounds(escaped)
    expect(isCompletelyOutside(escapedBounds, 1600, 800)).toBe(true)
    expect(isBeyondView(escapedBounds, margin, 1600, 800)).toBe(true)
    // 只在缓冲带内时需要边缘标记的判定为否。
    expect(isBeyondView(partialBounds, margin, 1600, 800)).toBe(false)
  })

  it('reports which desk edge an escaped device ran to, including corners', () => {
    const desk = { deskWidthMm: 1600, deskHeightMm: 800 }
    expect(getEscapeEdge(getItemBounds({ ...createItem('lamp'), x: -400, y: 100 }), desk.deskWidthMm, desk.deskHeightMm)).toBe('left')
    expect(getEscapeEdge(getItemBounds({ ...createItem('lamp'), x: 1900, y: 100 }), desk.deskWidthMm, desk.deskHeightMm)).toBe('right')
    expect(getEscapeEdge(getItemBounds({ ...createItem('lamp'), x: 100, y: -400 }), desk.deskWidthMm, desk.deskHeightMm)).toBe('top')
    expect(getEscapeEdge(getItemBounds({ ...createItem('lamp'), x: 100, y: 900 }), desk.deskWidthMm, desk.deskHeightMm)).toBe('bottom')
    expect(getEscapeEdge(getItemBounds({ ...createItem('lamp'), x: -400, y: -400 }), desk.deskWidthMm, desk.deskHeightMm)).toBe('top-left')
    expect(getEscapeEdge(getItemBounds({ ...createItem('lamp'), x: 1900, y: 900 }), desk.deskWidthMm, desk.deskHeightMm)).toBe('bottom-right')
  })

  it('moves an escaped device back inside the desk with the smallest possible translation', () => {
    const desk = { deskWidthMm: 1600, deskHeightMm: 800 }
    // 只在底部越界：仅修正 y，x 保持不动。
    const escaped = { ...createItem('monitor'), x: 100, y: 700 }
    const recovered = recoverItemPosition(escaped, desk.deskWidthMm, desk.deskHeightMm)
    const bounds = getItemBounds({ ...escaped, ...recovered })
    expect(bounds.left).toBeGreaterThanOrEqual(0)
    expect(bounds.top).toBeGreaterThanOrEqual(0)
    expect(bounds.right).toBeLessThanOrEqual(desk.deskWidthMm)
    expect(bounds.bottom).toBeLessThanOrEqual(desk.deskHeightMm)
    expect(recovered.x).toBe(100)
    expect(recovered.y).toBe(590)

    const farLeft = { ...createItem('keyboard'), x: -9000, y: 300 }
    const farLeftRecovered = recoverItemPosition(farLeft, desk.deskWidthMm, desk.deskHeightMm)
    expect(farLeftRecovered.x).toBe(0)
    expect(farLeftRecovered.y).toBe(300)
  })

  it('recovers rotated devices based on their rotated projection bounds', () => {
    const desk = { deskWidthMm: 1600, deskHeightMm: 800 }
    const rotated = { ...createItem('monitor'), x: 1500, y: 600, rotation: 45 }
    const recovered = recoverItemPosition(rotated, desk.deskWidthMm, desk.deskHeightMm)
    const bounds = getItemBounds({ ...rotated, ...recovered })
    expect(bounds.right).toBeLessThanOrEqual(desk.deskWidthMm)
    expect(bounds.bottom).toBeLessThanOrEqual(desk.deskHeightMm)
  })

  it('clears the out-of-bounds issue after a device is recovered', () => {
    const plan = createPlan('test', false)
    const escaped = { ...createItem('lamp'), x: 2200, y: 100 }
    expect(analyzeLayout({ ...plan, items: [escaped] }).outOfBoundsIds).toContain(escaped.id)
    const recoveredPosition = recoverItemPosition(escaped, plan.deskWidthMm, plan.deskHeightMm)
    const after = analyzeLayout({ ...plan, items: [{ ...escaped, ...recoveredPosition }] })
    expect(after.outOfBoundsIds).not.toContain(escaped.id)
    expect(after.status).toBe('clear')
  })
})
