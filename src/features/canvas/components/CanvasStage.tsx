import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Move, RotateCw, Undo2 } from 'lucide-react'
import type { DeskItem, LayoutAnalysis, WorkspacePlan } from '../../../shared/models'
import { getDeviceDefinition } from '../../../shared/models'
import { getItemBounds } from '../../../shared/layoutRules'

interface CanvasStageProps {
  plan: WorkspacePlan
  selectedItemId: string | null
  analysis: LayoutAnalysis
  onSelect: (id: string | null) => void
  onMove: (id: string, x: number, y: number) => void
  onRecover?: (id: string) => void
}

interface DragState { id: string; offsetX: number; offsetY: number }

type EscapeEdge = 'left' | 'right' | 'top' | 'bottom'

const EDGE_META: Record<EscapeEdge, { label: string; Icon: typeof ArrowRight }> = {
  left: { label: '在左侧', Icon: ArrowLeft },
  right: { label: '在右侧', Icon: ArrowRight },
  top: { label: '在上方', Icon: ArrowUp },
  bottom: { label: '在下方', Icon: ArrowDown },
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** 设备中心完全跑出桌面时，定位它主要逃向的那条边 */
function getEscapeEdge(item: DeskItem, plan: WorkspacePlan): EscapeEdge {
  const bounds = getItemBounds(item)
  if (bounds.right <= 0) return 'left'
  if (bounds.left >= plan.deskWidthMm) return 'right'
  if (bounds.bottom <= 0) return 'top'
  return 'bottom'
}

export function CanvasStage({ plan, selectedItemId, analysis, onSelect, onMove, onRecover }: CanvasStageProps) {
  const stageRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const scaleToMm = useCallback((clientX: number, clientY: number) => {
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect) return null
    return { x: ((clientX - rect.left) / rect.width) * plan.deskWidthMm, y: ((clientY - rect.top) / rect.height) * plan.deskHeightMm }
  }, [plan.deskHeightMm, plan.deskWidthMm])

  useEffect(() => {
    if (!drag) return
    const handleMove = (event: PointerEvent) => {
      const point = scaleToMm(event.clientX, event.clientY)
      if (!point) return
      onMove(drag.id, point.x - drag.offsetX, point.y - drag.offsetY)
    }
    const handleUp = () => setDrag(null)
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => { window.removeEventListener('pointermove', handleMove); window.removeEventListener('pointerup', handleUp) }
  }, [drag, onMove, scaleToMm])

  const startDrag = (event: ReactPointerEvent<SVGGElement>, item: DeskItem) => {
    event.stopPropagation()
    const point = scaleToMm(event.clientX, event.clientY)
    if (!point) return
    onSelect(item.id)
    setDrag({ id: item.id, offsetX: point.x - item.x, offsetY: point.y - item.y })
  }

  const escapedItems = plan.items
    .map((item) => {
      if (!analysis.outOfBoundsIds.includes(item.id)) return null
      const bounds = getItemBounds(item)
      const fullyOutside = bounds.right <= 0 || bounds.left >= plan.deskWidthMm || bounds.bottom <= 0 || bounds.top >= plan.deskHeightMm
      if (!fullyOutside) return null
      const edge = getEscapeEdge(item, plan)
      const cx = item.x + item.widthMm / 2
      const cy = item.y + item.heightMm / 2
      const margin = 4
      const leftPct = edge === 'left'
        ? margin
        : edge === 'right'
          ? 100 - margin
          : clamp((cx / plan.deskWidthMm) * 100, 12, 88)
      const topPct = edge === 'top'
        ? margin
        : edge === 'bottom'
          ? 100 - margin
          : clamp((cy / plan.deskHeightMm) * 100, 8, 92)
      return { item, edge, leftPct, topPct }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

  // 同一侧有多件设备时沿边缘错开，避免标记互相遮挡
  const edgeCounts = escapedItems.reduce<Record<string, number>>((counts, entry) => {
    counts[entry.edge] = (counts[entry.edge] ?? 0) + 1
    return counts
  }, {})
  const edgeSeen: Record<string, number> = {}
  const markers = escapedItems.map((entry) => {
    const rank = edgeSeen[entry.edge] ?? 0
    edgeSeen[entry.edge] = rank + 1
    const stackSize = edgeCounts[entry.edge]
    if (stackSize <= 1) return entry
    const offsetPct = (rank - (stackSize - 1) / 2) * 9
    return entry.edge === 'left' || entry.edge === 'right'
      ? { ...entry, topPct: clamp(entry.topPct + offsetPct, 9, 91) }
      : { ...entry, leftPct: clamp(entry.leftPct + offsetPct, 13, 87) }
  })

  return (
    <div className="canvas-wrap">
      <div className="canvas-toolbar"><span><Move size={14} /> 拖动设备调整位置</span><span><RotateCw size={14} /> 旋转请在右侧操作</span></div>
      <div className="canvas-stage">
        <svg ref={stageRef} className="desk-canvas" viewBox={`0 0 ${plan.deskWidthMm} ${plan.deskHeightMm}`} overflow="visible" role="img" aria-label={`桌面布局画布，${plan.deskWidthMm}乘${plan.deskHeightMm}毫米`} onPointerDown={() => onSelect(null)}>
          <defs>
            <pattern id="desk-grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M 50 0 L 0 0 0 50" fill="none" stroke="#d8e1ed" strokeWidth="1" /></pattern>
            <filter id="item-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#20304a" floodOpacity=".12" /></filter>
          </defs>
          <rect width={plan.deskWidthMm} height={plan.deskHeightMm} rx="22" fill="#f8fafc" />
          <rect width={plan.deskWidthMm} height={plan.deskHeightMm} rx="22" fill="url(#desk-grid)" />
          <text x="34" y="48" fill="#a0aec0" fontSize="20" letterSpacing="3">FOCUS ZONE / {plan.deskWidthMm} × {plan.deskHeightMm} MM</text>
          {plan.items.map((item) => {
            const definition = getDeviceDefinition(item.type)
            const isSelected = selectedItemId === item.id
            const isOutOfBounds = analysis.outOfBoundsIds.includes(item.id)
            const hasIssue = analysis.overlapIds.includes(item.id) || isOutOfBounds
            const cx = item.x + item.widthMm / 2
            const cy = item.y + item.heightMm / 2
            const itemBounds = getItemBounds(item)
            const fullyOutside = itemBounds.right <= 0 || itemBounds.left >= plan.deskWidthMm || itemBounds.bottom <= 0 || itemBounds.top >= plan.deskHeightMm
            const badgeX = clamp(itemBounds.right - 4, 26, plan.deskWidthMm - 26)
            const badgeY = clamp(itemBounds.top - 4, 26, plan.deskHeightMm - 26)
            return <g className={`desk-item ${isSelected ? 'is-selected' : ''} ${hasIssue ? 'has-issue' : ''} ${isOutOfBounds ? 'is-out-of-bounds' : ''}`} key={item.id} onPointerDown={(event) => startDrag(event, item)} role="button" tabIndex={0} aria-label={`${definition.label}，${item.widthMm}乘${item.heightMm}毫米${isOutOfBounds ? '，已超出桌面边界' : ''}`}>
              <g transform={`translate(${cx} ${cy}) rotate(${item.rotation})`}>
                <rect x={-item.widthMm / 2} y={-item.heightMm / 2} width={item.widthMm} height={item.heightMm} rx={Math.min(24, item.heightMm / 5)} fill={definition.color} filter="url(#item-shadow)" />
                <rect className="item-inner-line" x={-item.widthMm / 2 + 12} y={-item.heightMm / 2 + 12} width={Math.max(0, item.widthMm - 24)} height={Math.max(0, item.heightMm - 24)} rx={12} fill="none" />
                <text x="0" y="5" textAnchor="middle" fill="#1f2e44" fontWeight="700" fontSize={Math.max(18, Math.min(32, item.widthMm / 16))}>{definition.shortLabel}</text>
                <text x="0" y="30" textAnchor="middle" fill="#44546b" fontSize="16">{item.widthMm} × {item.heightMm}</text>
              </g>
              {isSelected && <rect className="selection-box" x={itemBounds.left - 8} y={itemBounds.top - 8} width={itemBounds.width + 16} height={itemBounds.height + 16} rx="12" fill="none" />}
              {hasIssue && !fullyOutside && <g transform={`translate(${badgeX} ${badgeY})`}><circle r="18" fill="#ef6a6a" /><text textAnchor="middle" y="7" fill="white" fontSize="22" fontWeight="700">!</text></g>}
            </g>
          })}
          {plan.items.length === 0 && <g><circle cx={plan.deskWidthMm / 2} cy={plan.deskHeightMm / 2 - 12} r="32" fill="#e8eef6" /><text x={plan.deskWidthMm / 2} y={plan.deskHeightMm / 2 + 2} textAnchor="middle" fill="#8493a8" fontSize="22">+</text><text x={plan.deskWidthMm / 2} y={plan.deskHeightMm / 2 + 48} textAnchor="middle" fill="#8493a8" fontSize="22">从左侧添加第一件设备</text></g>}
        </svg>
        {markers.map(({ item, edge, leftPct, topPct }) => {
          const definition = getDeviceDefinition(item.type)
          const { label, Icon } = EDGE_META[edge]
          const isSelected = selectedItemId === item.id
          return <div key={`marker-${item.id}`} className={`escape-marker marker-${edge} ${isSelected ? 'is-selected' : ''}`} style={{ left: `${leftPct}%`, top: `${topPct}%` }}>
            <button className="escape-marker-chip" type="button" onClick={() => onSelect(item.id)} aria-label={`${definition.label}已跑出桌面${label}，点击选中`} title={`${definition.label}${label}`}>
              <Icon size={13} />
              <span>{definition.label}{label}</span>
            </button>
            {onRecover && <button className="escape-marker-recover" type="button" onClick={() => onRecover(item.id)} aria-label={`把${definition.label}拉回桌面`} title="拉回桌面内"><Undo2 size={12} /></button>}
          </div>
        })}
      </div>
      <div className="canvas-legend"><span><i className="legend-dot clear-dot" /> 可用空间</span><span><i className="legend-dot issue-dot" /> 冲突 / 越界</span><span className="canvas-scale">网格：50 mm</span></div>
    </div>
  )
}
