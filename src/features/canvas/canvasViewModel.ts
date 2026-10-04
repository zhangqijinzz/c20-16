import { getRecoveredPosition, normalizeRotation } from '../../shared/layoutRules'
import type { DeskItem, WorkspacePlan } from '../../shared/models'

function updateCanvasItem(items: DeskItem[], id: string, updater: (item: DeskItem) => DeskItem): DeskItem[] {
  return items.map((item) => item.id === id ? updater(item) : item)
}

export function moveCanvasItem(items: DeskItem[], id: string, x: number, y: number): DeskItem[] {
  return updateCanvasItem(items, id, (item) => ({ ...item, x, y }))
}

export function rotateCanvasItem(items: DeskItem[], id: string, delta: number): DeskItem[] {
  return updateCanvasItem(items, id, (item) => ({ ...item, rotation: normalizeRotation(item.rotation + delta) }))
}

export function recoverCanvasItem(items: DeskItem[], id: string, plan: WorkspacePlan): DeskItem[] {
  return updateCanvasItem(items, id, (item) => {
    const { x, y } = getRecoveredPosition(item, plan)
    return { ...item, x, y }
  })
}
