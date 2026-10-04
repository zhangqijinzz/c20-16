import type { DeskItem, ItemBounds, LayoutAnalysis, WorkspacePlan } from './models'

export function normalizeRotation(rotation: number): number {
  const normalized = rotation % 360
  return normalized < 0 ? normalized + 360 : normalized
}

export function getItemBounds(item: DeskItem): ItemBounds {
  const radians = (normalizeRotation(item.rotation) * Math.PI) / 180
  const width = Math.abs(item.widthMm * Math.cos(radians)) + Math.abs(item.heightMm * Math.sin(radians))
  const height = Math.abs(item.widthMm * Math.sin(radians)) + Math.abs(item.heightMm * Math.cos(radians))
  const centerX = item.x + item.widthMm / 2
  const centerY = item.y + item.heightMm / 2
  return {
    left: centerX - width / 2,
    top: centerY - height / 2,
    right: centerX + width / 2,
    bottom: centerY + height / 2,
    width,
    height,
  }
}

export function rectanglesOverlap(first: ItemBounds, second: ItemBounds): boolean {
  const horizontal = Math.min(first.right, second.right) - Math.max(first.left, second.left)
  const vertical = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top)
  return horizontal > 1 && vertical > 1
}

export function analyzeLayout(plan: WorkspacePlan): LayoutAnalysis {
  const overlapIds = new Set<string>()
  const outOfBoundsIds = new Set<string>()
  const bounds = new Map(plan.items.map((item) => [item.id, getItemBounds(item)]))

  plan.items.forEach((item) => {
    const itemBounds = bounds.get(item.id)
    if (!itemBounds) return
    if (itemBounds.left < 0 || itemBounds.top < 0 || itemBounds.right > plan.deskWidthMm || itemBounds.bottom > plan.deskHeightMm) {
      outOfBoundsIds.add(item.id)
    }
  })

  for (let index = 0; index < plan.items.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < plan.items.length; nextIndex += 1) {
      const first = plan.items[index]
      const second = plan.items[nextIndex]
      const firstBounds = bounds.get(first.id)
      const secondBounds = bounds.get(second.id)
      if (firstBounds && secondBounds && rectanglesOverlap(firstBounds, secondBounds)) {
        overlapIds.add(first.id)
        overlapIds.add(second.id)
      }
    }
  }

  const occupiedArea = plan.items.reduce((total, item) => total + item.widthMm * item.heightMm, 0)
  const deskArea = plan.deskWidthMm * plan.deskHeightMm
  const coveragePercent = Math.min(100, Math.round((occupiedArea / deskArea) * 100))
  const hasIssue = overlapIds.size > 0 || outOfBoundsIds.size > 0
  return {
    overlapIds: [...overlapIds],
    outOfBoundsIds: [...outOfBoundsIds],
    coveragePercent,
    status: hasIssue ? 'attention' : 'clear',
  }
}

export function isItemOutOfBounds(item: DeskItem, plan: WorkspacePlan): boolean {
  const bounds = getItemBounds(item)
  return bounds.left < 0 || bounds.top < 0 || bounds.right > plan.deskWidthMm || bounds.bottom > plan.deskHeightMm
}

/**
 * 计算把设备移回桌面内所需的最小位移。
 * 设备比桌面还大时沿该轴居中；位置本身是合法数值时保持原样。
 */
export function getRecoveredPosition(item: DeskItem, plan: WorkspacePlan): { x: number; y: number } {
  const bounds = getItemBounds(item)
  let x = item.x
  let y = item.y

  if (bounds.width <= plan.deskWidthMm) {
    if (bounds.left < 0) x += -bounds.left
    else if (bounds.right > plan.deskWidthMm) x -= bounds.right - plan.deskWidthMm
  } else {
    x = (plan.deskWidthMm - item.widthMm) / 2
  }

  if (bounds.height <= plan.deskHeightMm) {
    if (bounds.top < 0) y += -bounds.top
    else if (bounds.bottom > plan.deskHeightMm) y -= bounds.bottom - plan.deskHeightMm
  } else {
    y = (plan.deskHeightMm - item.heightMm) / 2
  }

  return { x, y }
}

export function clampDeskSize(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(4000, Math.max(600, Math.round(value)))
}

export function clampItemDimension(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(2000, Math.max(40, Math.round(value)))
}
