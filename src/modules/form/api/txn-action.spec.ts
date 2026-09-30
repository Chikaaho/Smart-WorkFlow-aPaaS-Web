import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * txn-action API 模块单测。
 *
 * 策略：mock foundation/request，验证各函数构造正确的请求 config；
 * 不测真实 HTTP 往返（由后端行为测试与浏览器验收覆盖）。
 */

const mockRequest = vi.fn()

vi.mock('@/foundation/request', () => ({
  request: <T>(config: unknown): Promise<T> => mockRequest(config),
}))

const api = await import('./txn-action')

describe('modules/form/api/txn-action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('listTxnActions 请求 GET /form/action/list 且带 formId', async () => {
    mockRequest.mockResolvedValueOnce([])
    await api.listTxnActions('form-1')
    expect(mockRequest).toHaveBeenCalledWith({
      url: '/form/action/list',
      method: 'get',
      params: { formId: 'form-1' },
    })
  })

  it('createTxnAction 以 query formId + body 保存草稿', async () => {
    mockRequest.mockResolvedValueOnce({ id: 'a1' })
    const body = {
      actionKey: 'stock_reserve',
      name: '库存预占',
      actionType: 'RESERVE' as const,
      config: {
        balanceField: 'qty_available',
        reservedField: 'qty_reserved',
        expiresInSeconds: 900,
      },
    }
    await api.createTxnAction('form-1', body)
    expect(mockRequest).toHaveBeenCalledWith({
      url: '/form/action',
      method: 'post',
      params: { formId: 'form-1' },
      data: body,
    })
  })

  it('validateTxnAction 返回结构化错误列表', async () => {
    const errors = [{ field: 'config.balanceField', message: '余额字段必填', code: 1603 }]
    mockRequest.mockResolvedValueOnce(errors)
    const result = await api.validateTxnAction('a1')
    expect(result).toEqual(errors)
    expect(mockRequest).toHaveBeenCalledWith({ url: '/form/action/a1/validate', method: 'post' })
  })

  it('invokeTxnAction 调用端点与请求体', async () => {
    mockRequest.mockResolvedValueOnce({ status: 'SUCCEEDED' })
    await api.invokeTxnAction('a1', { recordId: 'r1', quantity: '5', invocationKey: 'K1' })
    expect(mockRequest).toHaveBeenCalledWith({
      url: '/form/action/a1/invoke',
      method: 'post',
      data: { recordId: 'r1', quantity: '5', invocationKey: 'K1' },
    })
  })

  it('pageTxnInvocations 将后端 records 适配为 list', async () => {
    mockRequest.mockResolvedValueOnce({
      records: [{ id: 'i1' }],
      total: 1,
      current: 2,
      size: 20,
    })
    const page = await api.pageTxnInvocations('a1', { page: 2, size: 20 })
    expect(page.list).toHaveLength(1)
    expect(page.total).toBe(1)
    expect(page.pageNum).toBe(2)
    expect(mockRequest).toHaveBeenCalledWith({
      url: '/form/action/a1/invocations',
      method: 'get',
      params: { page: 2, size: 20 },
    })
  })

  it('saveC1Policy 以 query formId 提交策略', async () => {
    mockRequest.mockResolvedValueOnce({ enabled: true })
    await api.saveC1Policy('form-1', { enabled: true, protectedFields: ['qty_available'] })
    expect(mockRequest).toHaveBeenCalledWith({
      url: '/form/action/c1-policy',
      method: 'put',
      params: { formId: 'form-1' },
      data: { policy: { enabled: true, protectedFields: ['qty_available'] } },
    })
  })
})
