import { normalizeRotation, recoverItemPosition } from '../../shared/layoutRules'
import type { DeskItem } from '../../shared/models'

function updateCanvasItem(items: DeskItem[], id: string, updater: (item: DeskItem) => DeskItem): DeskItem[] {
  return items.map((item) => item.id === id ? updater(item) : item)
}

function safeCoordinate(value: number, fallback: number): number {
  // 数字输入框被清空或手滑时会产生 NaN / Infinity，这种坐标会让设备从画布上彻底消失。
  return Number.isFinite(value) ? value : fallback
}

export function moveCanvasItem(items: DeskItem[], id: string, x: number, y: number): DeskItem[] {
  return updateCanvasItem(items, id, (item) => ({
    ...item,
    x: safeCoordinate(x, item.x),
    y: safeCoordinate(y, item.y),
  }))
}

export function rotateCanvasItem(items: DeskItem[], id: string, delta: number): DeskItem[] {
  return updateCanvasItem(items, id, (item) => ({ ...item, rotation: normalizeRotation(item.rotation + delta) }))
}

/**
 * 把越界设备平移回桌面内，尺寸、旋转保持不变。
 */
export function recoverCanvasItem(items: DeskItem[], id: string, deskWidthMm: number, deskHeightMm: number): DeskItem[] {
  return updateCanvasItem(items, id, (item) => ({ ...item, ...recoverItemPosition(item, deskWidthMm, deskHeightMm) }))
}
