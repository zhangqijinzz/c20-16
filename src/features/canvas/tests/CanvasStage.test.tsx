import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createItem, createPlan } from '../../../shared/models'
import { analyzeLayout } from '../../../shared/layoutRules'
import { CanvasStage } from '../components/CanvasStage'

function render(plan: ReturnType<typeof createPlan>, onRecover?: (id: string) => void) {
  return renderToString(
    <CanvasStage
      plan={plan}
      selectedItemId={null}
      analysis={analyzeLayout(plan)}
      onSelect={() => undefined}
      onMove={() => undefined}
      onRecover={onRecover}
    />,
  )
}

describe('CanvasStage escape markers', () => {
  it('renders an edge marker with a recover action for a fully escaped item', () => {
    const plan = createPlan('test', false)
    const escaped = { ...createItem('speaker'), x: 2000, y: 100 }
    const html = render({ ...plan, items: [escaped] }, () => undefined)
    expect(html).toContain('marker-right')
    expect(html).toContain('音箱在右侧')
    expect(html).toContain('escape-marker-recover')
  })

  it('keeps the in-canvas warning badge for partially out items and shows no marker', () => {
    const plan = createPlan('test', false)
    const partial = { ...createItem('lamp'), x: 1500, y: 300 }
    const html = render({ ...plan, items: [partial] }, () => undefined)
    expect(html).not.toContain('escape-marker-chip')
    expect(html).toContain('is-out-of-bounds')
  })

  it('hides the recover action in read-only preview mode', () => {
    const plan = createPlan('test', false)
    const escaped = { ...createItem('lamp'), x: -600, y: 100 }
    const html = render({ ...plan, items: [escaped] })
    expect(html).toContain('marker-left')
    expect(html).not.toContain('escape-marker-recover')
  })
})
