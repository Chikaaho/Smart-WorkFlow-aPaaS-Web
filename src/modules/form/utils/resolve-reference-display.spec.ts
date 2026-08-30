import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveReferenceDisplay } from './resolve-reference-display'

/* ── mock 模块 ── */

const mockGetFormDefinition = vi.fn()
const mockQueryFormData = vi.fn()

vi.mock('@/modules/form/api/form', () => ({
  getFormDefinition: (...args: unknown[]) => mockGetFormDefinition(...args),
  queryFormData: (...args: unknown[]) => mockQueryFormData(...args),
}))

/* ── 帮助 ── */

const SAMPLE_DEFINITION = {
  title: '请假申请',
  fields: [
    { name: 'applicant', label: '申请人', type: 'TEXT' },
    { name: 'department', label: '部门', type: 'DICT', dictType: 'dept' },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
})

/* ═══════════════════════════════════════════════════
 * resolveReferenceDisplay
 * ═══════════════════════════════════════════════════ */

describe('resolveReferenceDisplay', () => {
  it('正常解析 — 查目标表单记录返回显示字段值', async () => {
    mockGetFormDefinition.mockResolvedValue(SAMPLE_DEFINITION)
    mockQueryFormData.mockResolvedValue({
      list: [{ id: 'rec_001', applicant: '张三', department: 'TECH' }],
      total: 1,
    })

    const display = await resolveReferenceDisplay('leave-form', 'rec_001')
    expect(display).toBe('张三')
    expect(mockGetFormDefinition).toHaveBeenCalledWith('leave-form')
    expect(mockQueryFormData).toHaveBeenCalledWith('leave-form', {
      pageNum: 1,
      pageSize: 1,
      filters: [{ field: 'id', op: 'EQ', value: 'rec_001' }],
    })
  })

  it('取不到记录（记录已删／空结果）→ 回退返回 refId', async () => {
    mockGetFormDefinition.mockResolvedValue(SAMPLE_DEFINITION)
    mockQueryFormData.mockResolvedValue({ list: [], total: 0 })

    const display = await resolveReferenceDisplay('leave-form', 'rec_999')
    expect(display).toBe('rec_999')
  })

  it('目标表单 definition 加载失败 → 回退返回 refId', async () => {
    mockGetFormDefinition.mockRejectedValue(new Error('network error'))

    const display = await resolveReferenceDisplay('leave-form', 'rec_001')
    expect(display).toBe('rec_001')
  })

  it('目标表单无 TEXT 字段，回退为 id 字段值', async () => {
    const defNoText = {
      title: '数字表单',
      fields: [{ name: 'amount', label: '金额', type: 'NUMBER' }],
    }
    mockGetFormDefinition.mockResolvedValue(defNoText)
    mockQueryFormData.mockResolvedValue({
      list: [{ id: 'rec_001', amount: 1500 }],
      total: 1,
    })

    const display = await resolveReferenceDisplay('num-form', 'rec_001')
    // deriveDisplayField 返回 'id'，记录里 id='rec_001'
    expect(display).toBe('rec_001')
  })

  it('显示字段值为 null/undefined → 回退返回 refId', async () => {
    mockGetFormDefinition.mockResolvedValue(SAMPLE_DEFINITION)
    mockQueryFormData.mockResolvedValue({
      list: [{ id: 'rec_001', applicant: null }],
      total: 1,
    })

    const display = await resolveReferenceDisplay('leave-form', 'rec_001')
    expect(display).toBe('rec_001')
  })

  it('空 targetFormKey → 直接返回 refId', async () => {
    const display = await resolveReferenceDisplay('', 'rec_001')
    expect(display).toBe('rec_001')
    expect(mockGetFormDefinition).not.toHaveBeenCalled()
  })

  it('空 refId → 直接返回空字符串', async () => {
    const display = await resolveReferenceDisplay('leave-form', '')
    expect(display).toBe('')
    expect(mockGetFormDefinition).not.toHaveBeenCalled()
  })
})
