import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { FormSchema } from '@/contracts/form-schema'

/**
 * form-def API 模块单测。
 *
 * 策略：mock foundation/request，验证各函数构造正确的请求 config，
 * 不测试真实 HTTP 往返（那是集成测试覆盖的范围）。
 */

const mockRequest = vi.fn()

vi.mock('@/foundation/request', () => ({
  request: <T>(config: unknown): Promise<T> => mockRequest(config),
}))

// 在 mock 之后动态导入，确保模块使用 mocked request。
const formDefApi = await import('./form-def')

// A helper parseDefinition mock: the real parseDefinition 在 adapters 层已有单测覆盖，
// 这里只验证 getFormDefinitionById 调用了它并返回其解析结果。
vi.mock('@/adapters/form-designer', () => ({
  parseDefinition: vi.fn((raw: string) => JSON.parse(raw) as FormSchema),
}))

describe('modules/form/api/form-def', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /* ---- createFormDef ---- */

  it('createFormDef sends POST /form/def with FormCreateReq body', async () => {
    const dto = { id: 'uuid-1', formKey: 'my-form', status: 'DRAFT' as const }
    mockRequest.mockResolvedValueOnce(dto)

    const result = await formDefApi.createFormDef({ formKey: 'my-form', name: '我的表单' })

    expect(mockRequest).toHaveBeenCalledTimes(1)
    expect(mockRequest).toHaveBeenCalledWith({
      method: 'POST',
      url: '/form/def',
      data: { formKey: 'my-form', name: '我的表单' },
    })
    expect(result).toEqual(dto)
    expect(result.status).toBe('DRAFT')
  })

  /* ---- saveFormConfig ---- */

  it('saveFormConfig sends POST /form/def/{id}/config with definition string', async () => {
    mockRequest.mockResolvedValueOnce(undefined)

    const definition = JSON.stringify({ title: 'F', fields: [] })
    await formDefApi.saveFormConfig('uuid-1', definition)

    expect(mockRequest).toHaveBeenCalledTimes(1)
    expect(mockRequest).toHaveBeenCalledWith({
      method: 'POST',
      url: '/form/def/uuid-1/config',
      data: { definition },
    })
  })

  /* ---- getFormDefinitionById ---- */

  it('getFormDefinitionById sends GET /form/def/{id}/definition and parses result', async () => {
    const rawDef = { title: 'Test Form', fields: [{ name: 'f1', type: 'TEXT' }] }
    mockRequest.mockResolvedValueOnce(JSON.stringify(rawDef))

    const schema = await formDefApi.getFormDefinitionById('uuid-1')

    expect(mockRequest).toHaveBeenCalledTimes(1)
    expect(mockRequest).toHaveBeenCalledWith({
      method: 'GET',
      url: '/form/def/uuid-1/definition',
    })
    expect(schema.title).toBe('Test Form')
    expect(schema.fields).toHaveLength(1)
    expect(schema.fields[0]).toEqual({ name: 'f1', type: 'TEXT' })
  })

  /* ---- publishFormDef ---- */

  it('publishFormDef sends POST /form/def/{id}/publish with no body', async () => {
    const dto = { id: 'uuid-1', formKey: 'my-form', status: 'PUBLISHED' as const }
    mockRequest.mockResolvedValueOnce(dto)

    const result = await formDefApi.publishFormDef('uuid-1')

    expect(mockRequest).toHaveBeenCalledTimes(1)
    expect(mockRequest).toHaveBeenCalledWith({
      method: 'POST',
      url: '/form/def/uuid-1/publish',
    })
    expect(result.status).toBe('PUBLISHED')
  })

  /* ---- pageFormDefs ---- */

  it('pageFormDefs sends GET /form/def/page with pageNum+pageSize params', async () => {
    const pageResult = { records: [], total: 0, pageNum: 1, pageSize: 10 }
    mockRequest.mockResolvedValueOnce(pageResult)

    const result = await formDefApi.pageFormDefs({ pageNum: 1, pageSize: 10 })

    expect(mockRequest).toHaveBeenCalledTimes(1)
    expect(mockRequest).toHaveBeenCalledWith({
      method: 'GET',
      url: '/form/def/page',
      params: { pageNum: 1, pageSize: 10 },
    })
    expect(result).toEqual({ list: [], total: 0, pageNum: 1, pageSize: 10 })
  })

  it('pageFormDefs passes keyword param when provided', async () => {
    const pageResult = { records: [], total: 0, pageNum: 1, pageSize: 10 }
    mockRequest.mockResolvedValueOnce(pageResult)

    await formDefApi.pageFormDefs({ pageNum: 1, pageSize: 10 }, '请假')

    expect(mockRequest).toHaveBeenCalledTimes(1)
    expect(mockRequest).toHaveBeenCalledWith({
      method: 'GET',
      url: '/form/def/page',
      params: { pageNum: 1, pageSize: 10, keyword: '请假' },
    })
  })

  it('pageFormDefs omits keyword param when undefined', async () => {
    const pageResult = {
      records: [{ id: '1', formKey: 'fk', name: 'F', status: 'DRAFT' as const }],
      total: 1,
      pageNum: 1,
      pageSize: 10,
    }
    mockRequest.mockResolvedValueOnce(pageResult)

    const result = await formDefApi.pageFormDefs({ pageNum: 1, pageSize: 10 })

    expect(mockRequest).toHaveBeenCalledTimes(1)
    expect(result.list).toHaveLength(1)
    expect(result.list[0].formKey).toBe('fk')
  })

  it('pageFormDefs adapts records→list from backend response', async () => {
    const records = [
      { id: 'd1', formKey: 'f1', name: 'F1', status: 'DRAFT' as const },
      { id: 'd2', formKey: 'f2', name: 'F2', status: 'PUBLISHED' as const },
    ]
    mockRequest.mockResolvedValueOnce({ records, total: 2, pageNum: 1, pageSize: 10 })

    const result = await formDefApi.pageFormDefs({ pageNum: 1, pageSize: 10 })

    expect(result.list).toEqual(records)
    expect(result.total).toBe(2)
  })

  /* ---- full lifecycle sequence ---- */

  it('supports full draft → save → publish lifecycle sequence', async () => {
    const createDto = { id: 'uuid-1', formKey: 'my-form', status: 'DRAFT' as const }
    const publishDto = { id: 'uuid-1', formKey: 'my-form', status: 'PUBLISHED' as const }
    const definition = JSON.stringify({ title: 'F', fields: [] })

    mockRequest
      .mockResolvedValueOnce(createDto) // createFormDef
      .mockResolvedValueOnce(undefined) // saveFormConfig
      .mockResolvedValueOnce(publishDto) // publishFormDef

    // Step 1: create draft
    const created = await formDefApi.createFormDef({ formKey: 'my-form', name: 'F' })
    expect(created.id).toBe('uuid-1')

    // Step 2: save config
    await formDefApi.saveFormConfig(created.id, definition)

    // Step 3: publish (verify mock call order confirms save before publish)
    const published = await formDefApi.publishFormDef(created.id)
    expect(published.status).toBe('PUBLISHED')

    // Verify call order: create → save → publish
    expect(mockRequest).toHaveBeenCalledTimes(3)
    const calls = mockRequest.mock.calls
    expect(calls[0][0].url).toBe('/form/def')
    expect(calls[1][0].url).toBe('/form/def/uuid-1/config')
    expect(calls[2][0].url).toBe('/form/def/uuid-1/publish')
  })
})
