import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.stubEnv('TZ', 'Asia/Shanghai')

const mockGetPrintContext = vi.fn()
const mockGetFormData = vi.fn()
vi.mock('@/modules/workflow/api', () => ({
  getPrintContext: (...args: unknown[]) => mockGetPrintContext(...args),
}))
vi.mock('@/adapters/form-runtime', () => ({
  getFormData: (...args: unknown[]) => mockGetFormData(...args),
  resolvePartyNames: vi.fn(async () => ({})),
  resolveReferenceDisplay: vi.fn(async () => ''),
}))
vi.mock('@/adapters/instance-relation', () => ({
  getInstanceRelation: vi.fn(async () => ({ approvalHistory: [] })),
}))
vi.mock('@/adapters/form-designer', () => ({
  parseDefinition: (definition: string) => JSON.parse(definition),
}))

import PrintSheet from './PrintSheet.vue'

const schema = {
  title: '打印验收表单',
  fields: [
    { name: 'applyDate', label: '申请日期', type: 'DATE', format: 'datetime' },
    { name: 'due', label: '到货时间', type: 'DATE', format: 'datetime' },
    { name: 'arriveDay', label: '到达日期', type: 'DATE' },
  ],
  tables: [],
}

async function sheet(record: Record<string, unknown>) {
  mockGetPrintContext.mockResolvedValue({
    formName: '打印验收表单',
    definition: JSON.stringify(schema),
    formVersion: 2,
    versionPinned: true,
  })
  mockGetFormData.mockResolvedValue(record)
  const wrapper = mount(PrintSheet, {
    props: { formKey: 'v100_print_demo', recordId: 'r1' },
  })
  await flushPromises()
  await flushPromises()
  return wrapper
}

describe('PrintSheet 浏览器打印日期（与页面/PDF 同一时区口径）', () => {
  beforeEach(() => {
    mockGetPrintContext.mockReset()
    mockGetFormData.mockReset()
  })
  afterEach(() => vi.unstubAllEnvs())

  it('记录 API 返回的 UTC 时间戳按本地时间打印：01:30Z 打成 09:30（U1 案例）', async () => {
    const wrapper = await sheet({
      applyDate: '2026-11-11T02:00:00.000+00:00',
      due: '2026-11-10T01:30:00.000+00:00',
    })
    const text = wrapper.find('.sw-print-sheet__content').text()
    expect(text).toContain('2026-11-10 09:30')
    expect(text).not.toContain('2026-11-10 01:30')
    expect(text).toContain('2026-11-11 10:00')
    expect(text).not.toContain('2026-11-11 02:00')
  })

  it('无时区历史值保持原义，不额外偏移', async () => {
    const wrapper = await sheet({ applyDate: '2026-11-10 09:30:00' })
    expect(wrapper.find('.sw-print-sheet__content').text()).toContain('2026-11-10 09:30')
  })

  it('日期字段（format 非 datetime）只打印到日；跨日 UTC 值按本地日期', async () => {
    const wrapper = await sheet({ arriveDay: '2026-11-11T17:00:00.000+00:00' })
    const text = wrapper.find('.sw-print-sheet__content').text()
    expect(text).toContain('2026-11-12')
    expect(text).not.toContain('2026-11-12 01:00')
    expect(text).not.toContain('2026-11-11 17:00')
  })
})
