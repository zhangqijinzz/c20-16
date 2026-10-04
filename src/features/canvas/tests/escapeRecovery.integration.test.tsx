// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, beforeEach } from 'vitest'

import { App } from '../../../app/App'
import { STORAGE_KEY } from '../../workbench/storageService'
import { createInitialDocument, createItem } from '../../../shared/models'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// jsdom 25 没有实现 PointerEvent，用 MouseEvent 代替（组件只读取 clientX/clientY）。
function pointerEvent(type: string, init: { bubbles?: boolean; clientX?: number; clientY?: number } = {}) {
  return new MouseEvent(type, { bubbles: true, clientX: 100, clientY: 100, ...init })
}

describe('escaped device recovery flow', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    window.localStorage.clear()
  })

  it('keeps an edge marker for the escaped device and clears the issue after recovery', async () => {
    const initial = createInitialDocument()
    const plan = initial.plans[0]
    const escaped = createItem('lamp')
    escaped.x = 3200
    escaped.y = -900
    plan.items = [...plan.items, escaped]
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(initial))

    const container = document.createElement('div')
    document.body.appendChild(container)
    await act(async () => {
      createRoot(container).render(<App />)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const marker = container.querySelector('[aria-label*="按回车拉回桌面"]')
    expect(marker).not.toBeNull()
    expect(container.textContent).toContain('1 个问题')

    // 点击边缘标记（pointerdown 后直接 pointerup，位移小于拖拽阈值）→ 一键拉回
    await act(async () => {
      marker!.dispatchEvent(pointerEvent('pointerdown'))
      // 等待拖拽监听器在 effect 中挂载
      await new Promise((resolve) => setTimeout(resolve, 0))
      window.dispatchEvent(pointerEvent('pointerup'))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(container.textContent).toContain('布局目前很舒展')
    expect(container.textContent).not.toContain('按回车拉回桌面')

    // 拉回后的位置被持久化
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)
    const savedPlan = saved.plans[0]
    const savedItem = savedPlan.items.find((item: { id: string }) => item.id === escaped.id)
    expect(savedItem.x).toBeLessThanOrEqual(savedPlan.deskWidthMm - savedItem.widthMm)
    expect(savedItem.y).toBeGreaterThanOrEqual(0)
  })
})
