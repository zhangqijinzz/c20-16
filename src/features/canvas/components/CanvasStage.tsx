import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Move, RotateCw } from 'lucide-react'
import type { DeskItem, EscapeEdge, LayoutAnalysis, WorkspacePlan } from '../../../shared/models'
import { getDeviceDefinition } from '../../../shared/models'
import { getEscapeEdge, getItemBounds, isBeyondView } from '../../../shared/layoutRules'

interface CanvasStageProps {
  plan: WorkspacePlan
  selectedItemId: string | null
  analysis: LayoutAnalysis
  readOnly?: boolean
  onSelect: (id: string | null) => void
  onMove: (id: string, x: number, y: number) => void
  onRecover?: (id: string) => void
}

interface DragState {
  id: string
  offsetX: number
  offsetY: number
  startClientX: number
  startClientY: number
  portal?: boolean
  engaged?: boolean
}

interface EscapeMarker {
  item: DeskItem
  edge: EscapeEdge
  x: number
  y: number
  angle: number
}

/** 桌面四周预留的缓冲带（mm）：越界设备会停留在这片区域，始终保持可见、可点。 */
const VIEW_MARGIN_MM = 160
/** 边缘标记相对桌面边线的内缩距离。 */
const EDGE_INSET_MM = 34
/** 多个标记挤在同一边时的排布间距。 */
const MARKER_STEP_MM = 92
/** 判定“点击”与“拖拽”的位移阈值（px）。 */
const CLICK_SLOP_PX = 5

const EDGE_ANGLES: Record<EscapeEdge, number> = {
  left: 180,
  right: 0,
  top: -90,
  bottom: 90,
  'top-left': -135,
  'top-right': -45,
  'bottom-left': 135,
  'bottom-right': 45,
}

function clampToView(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function CanvasStage({ plan, selectedItemId, analysis, readOnly = false, onSelect, onMove, onRecover }: CanvasStageProps) {
  const stageRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)

  const viewX = -VIEW_MARGIN_MM
  const viewY = -VIEW_MARGIN_MM
  const viewWidth = plan.deskWidthMm + VIEW_MARGIN_MM * 2
  const viewHeight = plan.deskHeightMm + VIEW_MARGIN_MM * 2

  const scaleToMm = useCallback((clientX: number, clientY: number) => {
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect) return null
    // SVG 使用 xMidYMid meet，内容会等比缩放并居中，需要扣除留白后再换算。
    const scale = Math.min(rect.width / viewWidth, rect.height / viewHeight)
    const renderedWidth = viewWidth * scale
    const renderedHeight = viewHeight * scale
    const originX = rect.left + (rect.width - renderedWidth) / 2
    const originY = rect.top + (rect.height - renderedHeight) / 2
    return {
      x: ((clientX - originX) / renderedWidth) * viewWidth + viewX,
      y: ((clientY - originY) / renderedHeight) * viewHeight + viewY,
    }
  }, [viewHeight, viewWidth, viewX, viewY])

  useEffect(() => {
    if (!drag) return
    const handleMove = (event: PointerEvent) => {
      const point = scaleToMm(event.clientX, event.clientY)
      if (!point) return
      if (drag.portal && !drag.engaged) {
        if (Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY) < CLICK_SLOP_PX) return
        // 第一次真正拖动边缘标记：先把设备从屏幕外“吸附”到光标下，再跟随光标移动。
        const target = plan.items.find((item) => item.id === drag.id)
        if (!target) return
        onMove(target.id, point.x - target.widthMm / 2, point.y - target.heightMm / 2)
        setDrag({ ...drag, engaged: true, offsetX: target.widthMm / 2, offsetY: target.heightMm / 2 })
        return
      }
      onMove(drag.id, point.x - drag.offsetX, point.y - drag.offsetY)
    }
    const handleUp = () => {
      // 点了标记但没有拖动：直接把设备拉回桌面内。
      if (drag.portal && !drag.engaged) onRecover?.(drag.id)
      setDrag(null)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => { window.removeEventListener('pointermove', handleMove); window.removeEventListener('pointerup', handleUp) }
  }, [drag, onMove, onRecover, plan.items, scaleToMm])

  const startDrag = (event: ReactPointerEvent<SVGGElement>, item: DeskItem) => {
    event.stopPropagation()
    const point = scaleToMm(event.clientX, event.clientY)
    if (!point) return
    onSelect(item.id)
    setDrag({ id: item.id, offsetX: point.x - item.x, offsetY: point.y - item.y, startClientX: event.clientX, startClientY: event.clientY })
  }

  const startPortalDrag = (event: ReactPointerEvent<SVGGElement>, item: DeskItem) => {
    event.stopPropagation()
    onSelect(item.id)
    setDrag({ id: item.id, offsetX: 0, offsetY: 0, startClientX: event.clientX, startClientY: event.clientY, portal: true })
  }

  const recoverFromKeyboard = (item: DeskItem) => {
    onSelect(item.id)
    onRecover?.(item.id)
  }

  // 完全跑出可见区域的设备：在最近的桌面边缘生成方向标记。
  const escapeMarkers = useMemo<EscapeMarker[]>(() => {
    const groups = new Map<EscapeEdge, DeskItem[]>()
    plan.items.forEach((item) => {
      const bounds = getItemBounds(item)
      if (!isBeyondView(bounds, VIEW_MARGIN_MM, plan.deskWidthMm, plan.deskHeightMm)) return
      const edge = getEscapeEdge(bounds, plan.deskWidthMm, plan.deskHeightMm)
      const list = groups.get(edge) ?? []
      list.push(item)
      groups.set(edge, list)
    })

    const markers: EscapeMarker[] = []
    groups.forEach((items, edge) => {
      items.forEach((item, index) => {
        const offset = (index - (items.length - 1) / 2) * MARKER_STEP_MM
        let x = plan.deskWidthMm / 2
        let y = plan.deskHeightMm / 2
        if (edge === 'left' || edge === 'right') {
          x = edge === 'left' ? EDGE_INSET_MM : plan.deskWidthMm - EDGE_INSET_MM
          y = plan.deskHeightMm / 2 + offset
        } else if (edge === 'top' || edge === 'bottom') {
          x = plan.deskWidthMm / 2 + offset
          y = edge === 'top' ? EDGE_INSET_MM : plan.deskHeightMm - EDGE_INSET_MM
        } else {
          // 四个角：沿对角线向内排布。
          const shift = offset * Math.SQRT1_2
          x = (edge.includes('left') ? EDGE_INSET_MM : plan.deskWidthMm - EDGE_INSET_MM) + (edge.includes('left') ? shift : -shift)
          y = (edge.includes('top') ? EDGE_INSET_MM : plan.deskHeightMm - EDGE_INSET_MM) + (edge.includes('top') ? shift : -shift)
        }
        markers.push({
          item,
          edge,
          angle: EDGE_ANGLES[edge],
          x: clampToView(x, EDGE_INSET_MM, plan.deskWidthMm - EDGE_INSET_MM),
          y: clampToView(y, EDGE_INSET_MM, plan.deskHeightMm - EDGE_INSET_MM),
        })
      })
    })
    return markers
  }, [plan])

  const selectedItem = plan.items.find((item) => item.id === selectedItemId) ?? null
  const selectedIsOutOfBounds = selectedItem ? analysis.outOfBoundsIds.includes(selectedItem.id) : false

  return (
    <div className="canvas-wrap">
      <div className="canvas-toolbar">
        <span><Move size={14} /> 拖动设备调整位置</span>
        <span><RotateCw size={14} /> 旋转请在右侧操作</span>
        {escapeMarkers.length > 0 && <span className="escape-hint">边缘红点指向跑丢的设备，点击即可拉回</span>}
      </div>
      <div className="canvas-stage">
        {!readOnly && selectedIsOutOfBounds && selectedItem && (
          <div className="recover-overlay">
            <button type="button" className="recover-overlay-button" onPointerDown={(event) => event.stopPropagation()} onClick={() => onRecover?.(selectedItem.id)}>
              把{getDeviceDefinition(selectedItem.type).label}拉回桌面
            </button>
          </div>
        )}
        <svg
          ref={stageRef}
          className="desk-canvas"
          viewBox={`${viewX} ${viewY} ${viewWidth} ${viewHeight}`}
          role="img"
          aria-label={`桌面布局画布，${plan.deskWidthMm}乘${plan.deskHeightMm}毫米，外围为越界缓冲区域`}
          onPointerDown={() => onSelect(null)}
        >
          <defs>
            <pattern id="desk-grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M 50 0 L 0 0 0 50" fill="none" stroke="#d8e1ed" strokeWidth="1" /></pattern>
            <pattern id="outside-stripes" width="26" height="26" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="26" height="26" fill="#f3f0f4" /><rect width="13" height="26" fill="#efe7ea" /></pattern>
            <filter id="item-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#20304a" floodOpacity=".12" /></filter>
          </defs>

          {/* 桌面外的缓冲区域：始终可见，越界设备停在这里而不是从画布消失 */}
          <rect x={viewX} y={viewY} width={viewWidth} height={viewHeight} fill="url(#outside-stripes)" />
          <text x={viewX + 20} y={viewY + 36} fill={analysis.outOfBoundsIds.length > 0 ? '#c08a8a' : '#a9b4c4'} fontSize="17" letterSpacing="2">桌面外区域 · 越界设备会在这里待命</text>
          {analysis.outOfBoundsIds.length > 0 && (
            <rect className="desk-danger-border" x={0} y={0} width={plan.deskWidthMm} height={plan.deskHeightMm} rx="22" fill="none" />
          )}

          {/* 桌面本体 */}
          <rect width={plan.deskWidthMm} height={plan.deskHeightMm} rx="22" fill="#f8fafc" />
          <rect width={plan.deskWidthMm} height={plan.deskHeightMm} rx="22" fill="url(#desk-grid)" />
          <text x="34" y="48" fill="#a0aec0" fontSize="20" letterSpacing="3">FOCUS ZONE / {plan.deskWidthMm} × {plan.deskHeightMm} MM</text>

          {plan.items.map((item) => {
            const definition = getDeviceDefinition(item.type)
            const isSelected = selectedItemId === item.id
            const hasIssue = analysis.overlapIds.includes(item.id) || analysis.outOfBoundsIds.includes(item.id)
            const bounds = getItemBounds(item)
            const beyondView = isBeyondView(bounds, VIEW_MARGIN_MM, plan.deskWidthMm, plan.deskHeightMm)
            const cx = item.x + item.widthMm / 2
            const cy = item.y + item.heightMm / 2
            // 问题角标也要限制在可见区域内，避免设备半越界时角标跟着跑出屏幕。
            const badgeX = clampToView(bounds.right - 4, -VIEW_MARGIN_MM + 24, plan.deskWidthMm + VIEW_MARGIN_MM - 24)
            const badgeY = clampToView(bounds.top - 4, -VIEW_MARGIN_MM + 24, plan.deskHeightMm + VIEW_MARGIN_MM - 24)
            return <g className={`desk-item ${isSelected ? 'is-selected' : ''} ${hasIssue ? 'has-issue' : ''}`} key={item.id} onPointerDown={(event) => !readOnly && startDrag(event, item)} role="button" tabIndex={readOnly || beyondView ? -1 : 0} aria-label={`${definition.label}，${item.widthMm}乘${item.heightMm}毫米${analysis.outOfBoundsIds.includes(item.id) ? '，已越界' : ''}`}>
              <g transform={`translate(${cx} ${cy}) rotate(${item.rotation})`}>
                <rect x={-item.widthMm / 2} y={-item.heightMm / 2} width={item.widthMm} height={item.heightMm} rx={Math.min(24, item.heightMm / 5)} fill={definition.color} filter="url(#item-shadow)" />
                <rect className="item-inner-line" x={-item.widthMm / 2 + 12} y={-item.heightMm / 2 + 12} width={Math.max(0, item.widthMm - 24)} height={Math.max(0, item.heightMm - 24)} rx={12} fill="none" />
                <text x="0" y="5" textAnchor="middle" fill="#1f2e44" fontWeight="700" fontSize={Math.max(18, Math.min(32, item.widthMm / 16))}>{definition.shortLabel}</text>
                <text x="0" y="30" textAnchor="middle" fill="#44546b" fontSize="16">{item.widthMm} × {item.heightMm}</text>
              </g>
              {isSelected && <rect className="selection-box" x={bounds.left - 8} y={bounds.top - 8} width={bounds.width + 16} height={bounds.height + 16} rx="12" fill="none" />}
              {hasIssue && !beyondView && <g transform={`translate(${badgeX} ${badgeY})`}><circle r="18" fill="#ef6a6a" /><text textAnchor="middle" y="7" fill="white" fontSize="22" fontWeight="700">!</text></g>}
            </g>
          })}

          {/* 完全跑出画布的设备：桌面边缘的方向标记，点击/拖动都能把它找回来 */}
          {escapeMarkers.map(({ item, edge, x, y, angle }) => {
            const definition = getDeviceDefinition(item.type)
            const isSelected = selectedItemId === item.id
            const pillWidth = definition.shortLabel.length * 17 + 28
            return (
              <g
                key={`marker-${item.id}`}
                className={`escape-marker ${isSelected ? 'is-selected' : ''} ${readOnly ? 'is-readonly' : ''}`}
                transform={`translate(${x} ${y})`}
                role={readOnly ? undefined : 'button'}
                tabIndex={readOnly ? undefined : 0}
                aria-label={readOnly ? `${definition.label}位于桌面${edgeLabel(edge)}` : `${definition.label}跑到了桌面${edgeLabel(edge)}，点击或按回车拉回桌面`}
                onPointerDown={readOnly ? undefined : (event) => startPortalDrag(event, item)}
                onKeyDown={readOnly ? undefined : (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); recoverFromKeyboard(item) } }}
              >
                <circle className="escape-marker-halo" r="27" />
                <circle r="20" fill="#ef6a6a" stroke="#ffffff" strokeWidth="3" />
                <g transform={`rotate(${angle})`} stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" fill="none">
                  <line x1="-9" y1="0" x2="8" y2="0" />
                  <polyline points="2,-6 8,0 2,6" />
                </g>
                <g className="escape-recover-button" onPointerDown={readOnly ? undefined : (event) => { event.stopPropagation(); onSelect(item.id); onRecover?.(item.id) }}>
                  <circle cx="19" cy="-19" r="11" fill="#ffffff" stroke="#ef6a6a" strokeWidth="2" />
                  <line x1="19" y1="-24" x2="19" y2="-14" stroke="#ef6a6a" strokeWidth="2.4" strokeLinecap="round" />
                  <line x1="14" y1="-19" x2="24" y2="-19" stroke="#ef6a6a" strokeWidth="2.4" strokeLinecap="round" />
                </g>
                <g>
                  <rect x={-pillWidth / 2} y="28" width={pillWidth} height="26" rx="13" fill="#ffffff" stroke="#f0caca" />
                  <text x="0" y="46" textAnchor="middle" fill="#b35454" fontSize="15" fontWeight="700">{definition.shortLabel}</text>
                </g>
              </g>
            )
          })}

          {plan.items.length === 0 && <g><circle cx={plan.deskWidthMm / 2} cy={plan.deskHeightMm / 2 - 12} r="32" fill="#e8eef6" /><text x={plan.deskWidthMm / 2} y={plan.deskHeightMm / 2 + 2} textAnchor="middle" fill="#8493a8" fontSize="22">+</text><text x={plan.deskWidthMm / 2} y={plan.deskHeightMm / 2 + 48} textAnchor="middle" fill="#8493a8" fontSize="22">从左侧添加第一件设备</text></g>}
        </svg>
      </div>
      <div className="canvas-legend"><span><i className="legend-dot clear-dot" /> 可用空间</span><span><i className="legend-dot issue-dot" /> 冲突 / 越界</span><span className="canvas-scale">网格：50 mm · 虚线外为越界缓冲区</span></div>
    </div>
  )
}

function edgeLabel(edge: EscapeEdge): string {
  const labels: Record<EscapeEdge, string> = {
    left: '左侧外',
    right: '右侧外',
    top: '上方外',
    bottom: '下方外',
    'top-left': '左上角外',
    'top-right': '右上角外',
    'bottom-left': '左下角外',
    'bottom-right': '右下角外',
  }
  return labels[edge]
}
