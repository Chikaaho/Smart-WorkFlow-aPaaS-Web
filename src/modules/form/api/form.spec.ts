import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/foundation/request', () => ({ request: vi.fn() }))
vi.mock('@/adapters/form-designer', () => ({
  parseDefinition: vi.fn(),
}))

import { request } from '@/foundation/request'
import { parseDefinition } from '@/adapters/form-designer'
import {
  getFormDef,
  getFormDefinition,
  submitForm,
  listSubmissions,
  getFormData,
  updateFormData,
  normalizeSubmitData,
} from './form'

describe('modules/form/api/form', () => {
  beforeEach(() => {
    vi.mocked(request).mockReset()
    vi.mocked(parseDefinition).mockReset()
  })

  it('getFormDef calls correct URL with GET', async () => {
    vi.mocked(request).mockResolvedValueOnce({ formKey: 'k', formName: 'Form' })
    await getFormDef('test-key')
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', url: '/form/def/by-key/test-key' }),
    )
  })

  it('getFormDefinition calls correct URL and delegates to parseDefinition', async () => {
    const rawJson = '{"title":"T","fields":[]}'
    const expectedSchema = { title: 'T', fields: [] }
    vi.mocked(request).mockResolvedValueOnce(rawJson)
    vi.mocked(parseDefinition).mockReturnValueOnce(expectedSchema)

    const schema = await getFormDefinition('test-key')

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        url: '/form/def/by-key/test-key/definition',
      }),
    )
    expect(parseDefinition).toHaveBeenCalledWith(rawJson)
    expect(schema).toEqual(expectedSchema)
  })

  it('submitForm (seam) posts to correct URL and propagates rejection', async () => {
    vi.mocked(request).mockRejectedValueOnce(new Error('Network Error'))
    await expect(submitForm('my-form', { field: 'value' })).rejects.toThrow('Network Error')
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'POST', url: '/form/data/my-form' }),
    )
  })

  it('submitForm (seam) passes request body correctly', async () => {
    vi.mocked(request).mockRejectedValueOnce(new Error('x'))
    const body = { name: 'Alice', age: 30 }
    await expect(submitForm('k', body)).rejects.toThrow()
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ data: body }))
  })

  it('submitForm normalizes when fields arg provided', async () => {
    vi.mocked(request).mockRejectedValueOnce(new Error('x'))
    const fields = [
      { name: 'active', type: 'BOOL' as const },
      { name: 'date', type: 'DATE' as const },
    ]
    await expect(submitForm('k', { active: true, date: '2026-07-01' }, fields)).rejects.toThrow()
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ data: { active: 1, date: '2026-07-01' } }),
    )
  })

  it('listSubmissions (seam) GETs correct URL with page params and propagates rejection', async () => {
    vi.mocked(request).mockRejectedValueOnce(new Error('Network Error'))
    await expect(listSubmissions('my-form', { pageNum: 2, pageSize: 20 })).rejects.toThrow(
      'Network Error',
    )
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        url: '/form/submit/by-key/my-form/list',
        params: { pageNum: 2, pageSize: 20 },
      }),
    )
  })

  it('listSubmissions adapts backend records→list when endpoint resolves', async () => {
    vi.mocked(request).mockResolvedValueOnce({
      records: [{ id: '1', val: 'a' }],
      total: 1,
      pageNum: 1,
      pageSize: 10,
    })
    const result = await listSubmissions('k', { pageNum: 1, pageSize: 10 })
    expect(result.list).toEqual([{ id: '1', val: 'a' }])
    expect(result.total).toBe(1)
  })

  it('getFormData calls GET /form/data/{formKey}/{recordId}', async () => {
    vi.mocked(request).mockResolvedValueOnce({ id: 'rec1', version: 1, name: 'test' })
    const record = await getFormData('my-form', 'rec1')
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', url: '/form/data/my-form/rec1' }),
    )
    expect(record).toEqual({ id: 'rec1', version: 1, name: 'test' })
  })

  it('getFormData propagates ApiError (e.g. 1507 record not found)', async () => {
    const apiErr = new Error('记录不存在或已被删除')
    vi.mocked(request).mockRejectedValueOnce(apiErr)
    await expect(getFormData('k', 'bad-id')).rejects.toThrow('记录不存在或已被删除')
  })

  it('updateFormData calls PUT /form/data/{formKey}/{recordId} with payload', async () => {
    vi.mocked(request).mockResolvedValueOnce(null)
    const payload = {
      data: { name: 'Alice' },
      version: 2,
      subTableRows: { items: [{ action: 'UNCHANGED' as const, id: 'row1', data: { col: 'v' } }] },
    }
    await updateFormData('my-form', 'rec1', payload)
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PUT',
        url: '/form/data/my-form/rec1',
        data: payload,
      }),
    )
  })

  it('updateFormData propagates ApiError (e.g. 1508 version conflict)', async () => {
    const apiErr = new Error('版本冲突')
    vi.mocked(request).mockRejectedValueOnce(apiErr)
    await expect(
      updateFormData('k', 'r1', { data: {}, version: 1, subTableRows: {} }),
    ).rejects.toThrow('版本冲突')
  })
})

/* ── normalizeSubmitData ──────────────────────────────────── */

describe('normalizeSubmitData', () => {
  it('converts BOOL true → 1 and false → 0', () => {
    const fields = [
      { name: 'active', type: 'BOOL' as const },
      { name: 'inactive', type: 'BOOL' as const },
    ]
    expect(normalizeSubmitData({ active: true, inactive: false }, fields)).toEqual({
      active: 1,
      inactive: 0,
    })
  })

  it('passes DATE values through as strings', () => {
    const fields = [{ name: 'd', type: 'DATE' as const }]
    expect(normalizeSubmitData({ d: '2026-07-01' }, fields)).toEqual({ d: '2026-07-01' })
    expect(normalizeSubmitData({ d: '' }, fields)).toEqual({ d: null })
  })

  it('passes TEXT / NUMBER / DICT / REFERENCE values unchanged', () => {
    const fields = [
      { name: 't', type: 'TEXT' as const },
      { name: 'n', type: 'NUMBER' as const },
      { name: 'dict', type: 'DICT' as const, dictType: 'd' },
      { name: 'ref', type: 'REFERENCE' as const },
    ]
    expect(normalizeSubmitData({ t: 'hello', n: 42, dict: 'code', ref: 'ref-id' }, fields)).toEqual(
      {
        t: 'hello',
        n: 42,
        dict: 'code',
        ref: 'ref-id',
      },
    )
  })

  it('fills missing fields with empty string', () => {
    const fields = [
      { name: 'a', type: 'TEXT' as const },
      { name: 'b', type: 'NUMBER' as const },
    ]
    expect(normalizeSubmitData({}, fields)).toEqual({ a: '', b: '' })
  })

  it('treats null and undefined as missing → empty string', () => {
    const fields = [{ name: 'x', type: 'TEXT' as const }]
    expect(normalizeSubmitData({ x: null }, fields)).toEqual({ x: '' })
    expect(normalizeSubmitData({ x: undefined }, fields)).toEqual({ x: '' })
  })

  it('handles RICH_TEXT unchanged', () => {
    const fields = [{ name: 'rich', type: 'RICH_TEXT' as const }]
    expect(normalizeSubmitData({ rich: 'some html' }, fields)).toEqual({ rich: 'some html' })
  })

  it('strips _rowAction and _rowId from TABLE rows', () => {
    const fields = [
      {
        name: 'items',
        type: 'TABLE' as const,
        subFields: [{ name: 'col', type: 'TEXT' as const }],
      },
    ]
    const data = {
      items: [
        { col: 'a', _rowAction: 'ADD' },
        { col: 'b', _rowAction: 'UPDATE', _rowId: 'r2' },
        { col: 'c', _rowAction: 'UNCHANGED', _rowId: 'r3' },
        { col: 'd', _rowAction: 'DELETE', _rowId: 'r4' },
      ],
    }
    expect(normalizeSubmitData(data, fields)).toEqual({
      items: [{ col: 'a' }, { col: 'b' }, { col: 'c' }, { col: 'd' }],
    })
  })

  it('returns empty array for null/undefined TABLE value', () => {
    const fields = [
      { name: 'items', type: 'TABLE' as const, subFields: [{ name: 'c', type: 'TEXT' as const }] },
    ]
    expect(normalizeSubmitData({ items: null }, fields)).toEqual({ items: [] })
    expect(normalizeSubmitData({ items: undefined }, fields)).toEqual({ items: [] })
  })

  it('handles TABLE with empty array', () => {
    const fields = [
      { name: 'items', type: 'TABLE' as const, subFields: [{ name: 'c', type: 'TEXT' as const }] },
    ]
    expect(normalizeSubmitData({ items: [] }, fields)).toEqual({ items: [] })
  })
})
