/**
 * P32 R7：表单数据导入导出 Mock / 真实后端语义对照测试。
 *
 * 六组输入的 Mock 侧行为锁定（真实侧行为见
 * product/form-data-import-export/receipts 执行回执的 HTTP 证据）：
 *  1. 模板成功   → code=0 + 真实 xlsx Blob（PK 头 + xlsx MIME）
 *  2. 合法导入   → code=0 + successCount>0
 *  3. 格式错     → code=1499（对齐真实"无法解析文件"）
 *  4. 字段校验错 → 原子失败：successCount=0 + 行级错误（对齐真实整批回滚）
 *  5. 权限拒绝   → Mock 层无登录态维度（结构性差异，真实侧 401/403 由后端实证）
 *  6. 空集导出   → 真实 xlsx 且仅表头行
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { dispatchMock } from './index'
import { setAccessToken } from '@/foundation/auth/token'
import { buildMockXlsxBlob } from './mock-xlsx'
import { MOCK_FORM_DATA_RECORDS } from './seeds'

const BASE = '/api'
const DEMO_KEY = 'demo-form'

function xlsxRowTagCount(bytes: Uint8Array): number {
  const text = new TextDecoder().decode(bytes)
  return (text.match(/<row r=/g) ?? []).length
}

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

beforeAll(async () => {
  // L13 既有五组用例原先以"默认超管会话"运行；接入权限闸后统一以授权身份（admin）执行。
  await mockLogin('admin')
})

describe('P32 R7 Mock/真实语义对照：模板', () => {
  it('模板成功 → 返回真实 xlsx Blob（PK 头 + xlsx MIME + 两行表头）', async () => {
    const result = await dispatchMock('GET', `/form/data/${DEMO_KEY}/template`, BASE, {}, undefined)
    expect(result).toBeDefined()
    expect(result!.code).toBe(0)
    const blob = result!.data as Blob
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    const bytes = await blobBytes(blob)
    expect(bytes[0]).toBe(0x50)
    expect(bytes[1]).toBe(0x4b)
    // 两行表头 → sheet1.xml 至少 2 个 <row>
    expect(xlsxRowTagCount(bytes)).toBeGreaterThanOrEqual(2)
  })

  it('buildMockXlsxBlob 输出可定位表头文本（申请人/applicant）', async () => {
    const bytes = await blobBytes(
      buildMockXlsxBlob([
        ['申请人', '天数'],
        ['applicant', 'days'],
      ]),
    )
    const text = new TextDecoder().decode(bytes)
    expect(text).toContain('申请人')
    expect(text).toContain('applicant')
  })
})

describe('P32 R7 Mock/真实语义对照：导入', () => {
  it('合法导入 → code=0 且 successCount>0', async () => {
    const fd = new FormData()
    fd.append('file', new File(['xlsx'], 'data.xlsx'))
    const result = await dispatchMock('POST', `/form/data/${DEMO_KEY}/import`, BASE, {}, fd)
    expect(result!.code).toBe(0)
    const data = result!.data as { successCount: number; errorCount: number }
    expect(data.successCount).toBeGreaterThan(0)
    expect(data.errorCount).toBe(0)
  })

  it('格式错（非 .xlsx）→ code=1499 格式拒绝（对齐真实"无法解析文件"）', async () => {
    const fd = new FormData()
    fd.append('file', new File(['plain'], 'data.txt'))
    const result = await dispatchMock('POST', `/form/data/${DEMO_KEY}/import`, BASE, {}, fd)
    expect(result!.code).toBe(1499)
    expect(result!.message).toContain('无法解析文件')
    expect(result!.data).toBeNull()
  })

  it('字段校验错 → 原子失败：successCount=0 + 行级错误（对齐真实整批回滚）', async () => {
    const fd = new FormData()
    fd.append('file', new File(['xlsx'], 'invalid.xlsx'))
    const result = await dispatchMock('POST', `/form/data/${DEMO_KEY}/import`, BASE, {}, fd)
    expect(result!.code).toBe(0)
    const data = result!.data as {
      successCount: number
      errorCount: number
      errors: Array<{ rowNum: number; message: string }>
    }
    expect(data.successCount).toBe(0)
    expect(data.errorCount).toBe(1)
    expect(data.errors[0]).toMatchObject({ rowNum: 3 })
    expect(data.errors[0].message).toContain('必填字段')
  })
})

describe('P32 R7 Mock/真实语义对照：导出', () => {
  it('有数据导出 → xlsx 含表头 + 记录行', async () => {
    const result = await dispatchMock(
      'POST',
      `/form/data/${DEMO_KEY}/export`,
      BASE,
      {},
      {
        pageNum: 1,
        pageSize: 100,
      },
    )
    expect(result!.code).toBe(0)
    const bytes = await blobBytes(result!.data as Blob)
    expect(bytes[0]).toBe(0x50)
    expect(xlsxRowTagCount(bytes)).toBe(1 + MOCK_FORM_DATA_RECORDS.length)
  })

  it('空集导出（未匹配筛选）→ xlsx 仅表头行', async () => {
    const result = await dispatchMock(
      'POST',
      `/form/data/${DEMO_KEY}/export`,
      BASE,
      {},
      {
        pageNum: 1,
        pageSize: 100,
        filters: [{ field: 'applicant', op: 'EQ', value: '不存在的值' }],
      },
    )
    expect(result!.code).toBe(0)
    const bytes = await blobBytes(result!.data as Blob)
    expect(xlsxRowTagCount(bytes)).toBe(1)
  })
})

// ══════ S3：Mock 三身份权限一致（401/403/成功） ══════

async function mockLogin(username: string): Promise<string> {
  const result = await dispatchMock('POST', '/auth/login', '/api', {}, { username, password: 'x' })
  const token = (result!.data as { accessToken: string }).accessToken
  setAccessToken(token)
  return token
}

describe('S3 Mock 三身份权限一致（与真实 401/403/200 同义）', () => {
  afterEach(() => setAccessToken(null))

  it('未登录 → 模板请求返回 401 未认证（对齐真实 401）', async () => {
    setAccessToken(null)
    const result = await dispatchMock('GET', `/form/data/${DEMO_KEY}/template`, BASE, {}, undefined)
    expect(result!.code).toBe(401)
    expect(result!.message).toBe('未认证')
    expect(result!.data).toBeNull()
  })

  it('普通无权限身份（user）→ 导入返回 403 无权限（对齐真实 403）', async () => {
    await mockLogin('user')
    const fd = new FormData()
    fd.append('file', new File(['xlsx'], 'data.xlsx'))
    const result = await dispatchMock('POST', `/form/data/${DEMO_KEY}/import`, BASE, {}, fd)
    expect(result!.code).toBe(403)
    expect(result!.message).toBe('无权限')
    expect(result!.data).toBeNull()
  })

  it('有 P32 权限身份（admin）→ 导出成功（对齐真实 200）', async () => {
    await mockLogin('admin')
    const result = await dispatchMock(
      'POST',
      `/form/data/${DEMO_KEY}/export`,
      BASE,
      {},
      {
        pageNum: 1,
        pageSize: 10,
      },
    )
    expect(result!.code).toBe(0)
    const blob = result!.data as Blob
    const bytes = new Uint8Array(await blob.arrayBuffer())
    expect(bytes[0]).toBe(0x50)
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  })
})
