import type { DeskItem, EscapeEdge, ItemBounds, LayoutAnalysis, WorkspacePlan } from './models'

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

/**
 * 判断设备包围盒是否完全落在桌面矩形之外。
 * 部分越界（仍有一部分压在桌面上）时返回 false，设备本身仍能在画布上点到。
 */
export function isCompletelyOutside(bounds: ItemBounds, deskWidthMm: number, deskHeightMm: number): boolean {
  return bounds.right <= 0 || bounds.left >= deskWidthMm || bounds.bottom <= 0 || bounds.top >= deskHeightMm
}

/**
 * 判断设备包围盒是否完全跑出了“画布可见区域”（桌面 + 四周缓冲带）。
 * 只有完全跑出可见区域时，才需要在桌面边缘给出方向标记。
 */
export function isBeyondView(bounds: ItemBounds, marginMm: number, deskWidthMm: number, deskHeightMm: number): boolean {
  return bounds.right <= -marginMm
    || bounds.left >= deskWidthMm + marginMm
    || bounds.bottom <= -marginMm
    || bounds.top >= deskHeightMm + marginMm
}

/**
 * 对完全跑到桌面外的设备，判断它落在哪一侧（含四个角），用于在最近的桌面边缘放置提示标记。
 */
export function getEscapeEdge(bounds: ItemBounds, deskWidthMm: number, deskHeightMm: number): EscapeEdge {
  const centerX = (bounds.left + bounds.right) / 2
  const centerY = (bounds.top + bounds.bottom) / 2
  const outsideLeft = bounds.right <= 0
  const outsideRight = bounds.left >= deskWidthMm
  const outsideTop = bounds.bottom <= 0
  const outsideBottom = bounds.top >= deskHeightMm

  if (outsideLeft && outsideTop) return 'top-left'
  if (outsideRight && outsideTop) return 'top-right'
  if (outsideLeft && outsideBottom) return 'bottom-left'
  if (outsideRight && outsideBottom) return 'bottom-right'
  if (outsideLeft) return 'left'
  if (outsideRight) return 'right'
  if (outsideTop) return 'top'
  if (outsideBottom) return 'bottom'

  // 极端情况下设备跨度过大（如尺寸超过桌面），退化为按中心落点判断方向。
  const verticalEdge: EscapeEdge = centerX < deskWidthMm / 2 ? 'left' : 'right'
  const horizontalEdge: EscapeEdge = centerY < deskHeightMm / 2 ? 'top' : 'bottom'
  if (centerX < 0 && centerY < 0) return 'top-left'
  if (centerX > deskWidthMm && centerY < 0) return 'top-right'
  if (centerX < 0 && centerY > deskHeightMm) return 'bottom-left'
  if (centerX > deskWidthMm && centerY > deskHeightMm) return 'bottom-right'
  return centerX < 0 || centerX > deskWidthMm ? verticalEdge : horizontalEdge
}

/**
 * 把设备平移回桌面内：保持旋转与尺寸不变，仅做最小幅度的平移，
 * 使设备包围盒完整落在桌面边界以内（比桌面大的设备居中放置）。
 */
export function recoverItemPosition(item: DeskItem, deskWidthMm: number, deskHeightMm: number): Pick<DeskItem, 'x' | 'y'> {
  const bounds = getItemBounds(item)
  let deltaX = 0
  let deltaY = 0
  if (bounds.width > deskWidthMm) {
    // 设备比桌面还宽时无法完整放入，直接居中。
    deltaX = deskWidthMm / 2 - (bounds.left + bounds.right) / 2
  } else if (bounds.left < 0) {
    deltaX = -bounds.left
  } else if (bounds.right > deskWidthMm) {
    deltaX = deskWidthMm - bounds.right
  }
  if (bounds.height > deskHeightMm) {
    deltaY = deskHeightMm / 2 - (bounds.top + bounds.bottom) / 2
  } else if (bounds.top < 0) {
    deltaY = -bounds.top
  } else if (bounds.bottom > deskHeightMm) {
    deltaY = deskHeightMm - bounds.bottom
  }
  return { x: item.x + deltaX, y: item.y + deltaY }
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

export function clampDeskSize(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(4000, Math.max(600, Math.round(value)))
}

export function clampItemDimension(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(2000, Math.max(40, Math.round(value)))
}
