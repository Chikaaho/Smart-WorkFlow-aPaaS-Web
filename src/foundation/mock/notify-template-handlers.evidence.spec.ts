import { describe, it, expect } from 'vitest'
import { dispatchMock } from './index'
import { MOCK_NOTIFY_TEMPLATES, MOCK_NOTIFY_MESSAGES } from './seeds'

/**
 * 消息模板 Mock handler 行为证据专项（P36 补证缺口 G3，一次性 evidence spec）。
 *
 * 通过 dispatchMock 真实执行 handler（非源码扫描），断言真实返回值（code + data 字段）。
 * 场景编号 a-l 对应补证任务清单；每场景注释附与后端 NotifyTemplateController /
 * NotifyTemplateServiceImpl / TemplateRenderService 的契约对照结论。
 *
 * 种子污染说明：MOCK_NOTIFY_TEMPLATES / MOCK_NOTIFY_MESSAGES 是模块级可变数组，
 * handler 原地 mutate。本 spec 内按依赖顺序组织用例：场景 b 新建的模板在场景 e
 * 编辑、f 前自清理删除；场景 f 停用的种子 id=1 在用例末尾恢复启用，避免影响后续
 * 用例与同目录其他 spec 文件（vitest 每文件独立模块作用域，文件间无共享状态）。
 */

interface PageData {
  records: Array<{ id: number; templateCode: string; name: string; enabled: boolean }>
  total: number
  pageNum: number
  pageSize: number
}

interface TemplateDetail {
  id: number
  templateCode: string
  name: string
  titleTemplate: string
  contentTemplate: string
  enabled: boolean
  remark: string | null
}

async function mock<T>(
  method: string,
  url: string,
  query: Record<string, string> = {},
  body?: unknown,
) {
  return dispatchMock<T>(method, url, '/api', query, body)
}

/** 清理测试期间新建的模板（按代码），恢复种子状态。 */
function cleanupTemplate(code: string): void {
  const idx = MOCK_NOTIFY_TEMPLATES.findIndex((t) => t.templateCode === code)
  if (idx !== -1) MOCK_NOTIFY_TEMPLATES.splice(idx, 1)
}

// ─── a. 分页列表 ──────────────────────────────────────────

describe('a. GET 分页列表', () => {
  it('code=0，records 含 3 条种子，total=3，按 id 降序', async () => {
    const res = await mock<PageData>('GET', '/notify/templates', { pageNum: '1', pageSize: '10' })

    expect(res!.code).toBe(0)
    expect(res!.data.total).toBe(3)
    expect(res!.data.records.map((t) => t.templateCode)).toEqual([
      'DISABLED_SAMPLE',
      'WF_APPROVED_NOTICE',
      'WF_TODO_NOTICE',
    ])
    // 对照后端 pageTemplates（NotifyTemplateServiceImpl）：keyword like + enabled 过滤 + orderByDesc(id)。一致
  })
})

// ─── b/c/d. 新建与代码唯一性 ─────────────────────────────

describe('b. POST 新建合法模板', () => {
  it('code=0 返回新 id=4；再查列表 total=4（+1）', async () => {
    const create = await mock<number>(
      'POST',
      '/notify/templates',
      {},
      {
        templateCode: 'EVIDENCE_TMP_A',
        name: '证据临时模板A',
        titleTemplate: '标题 ${v}',
        contentTemplate: '正文 ${v}',
        enabled: true,
        remark: null,
      },
    )
    expect(create!.code).toBe(0)
    expect(create!.message).toBe('ok')
    expect(create!.data).toBe(4)

    const list = await mock<PageData>('GET', '/notify/templates', { pageNum: '1', pageSize: '10' })
    expect(list!.code).toBe(0)
    expect(list!.data.total).toBe(4)
    // 对照后端 createTemplate：validate + requireCodeAvailable + insert 返回 id。一致
  })
})

describe('c. POST 重复 templateCode', () => {
  it('code=400 且 message 含「模板代码已存在」', async () => {
    const res = await mock(
      'POST',
      '/notify/templates',
      {},
      {
        templateCode: 'WF_TODO_NOTICE',
        name: '重复代码模板',
        titleTemplate: 't ${x}',
        contentTemplate: 'c ${x}',
      },
    )
    expect(res!.code).toBe(400)
    expect(res!.message).toContain('模板代码已存在')
    // 对照后端 requireCodeAvailable → PARAM_ERROR(400, "模板代码已存在: xxx")。一致
  })
})

describe('d. PUT 变更 templateCode', () => {
  it('code=400「模板代码不可变更」', async () => {
    const res = await mock(
      'PUT',
      '/notify/templates/1',
      {},
      {
        templateCode: 'CHANGED_CODE_X',
        name: '待办提醒模板',
        titleTemplate: '${userName} 的待办提醒',
        contentTemplate: '您好 ${userName}，您有一条新的待办任务「${taskName}」需要处理。',
      },
    )
    expect(res!.code).toBe(400)
    expect(res!.message).toContain('模板代码不可变更')
    // 对照后端 updateTemplate：请求 templateCode 与库中不等 → PARAM_ERROR(400)。一致
  })
})

// ─── e. 正常编辑 ──────────────────────────────────────────

describe('e. PUT 正常编辑（编辑场景 b 新建的 id=4）', () => {
  it('code=0；GET 详情字段已更新；用例末尾自清理删除 id=4', async () => {
    const update = await mock(
      'PUT',
      '/notify/templates/4',
      {},
      {
        templateCode: 'EVIDENCE_TMP_A',
        name: '证据临时模板A-已改名',
        titleTemplate: '新标题 ${v2}',
        contentTemplate: '新正文 ${v2}',
        enabled: false,
        remark: '已被编辑',
      },
    )
    expect(update!.code).toBe(0)
    expect(update!.message).toBe('ok')

    const detail = await mock<TemplateDetail>('GET', '/notify/templates/4')
    expect(detail!.code).toBe(0)
    expect(detail!.data.name).toBe('证据临时模板A-已改名')
    expect(detail!.data.titleTemplate).toBe('新标题 ${v2}')
    expect(detail!.data.contentTemplate).toBe('新正文 ${v2}')
    expect(detail!.data.enabled).toBe(false)
    expect(detail!.data.remark).toBe('已被编辑')
    // 对照后端 updateTemplate + getTemplate：同 code 放行、其余字段全量覆盖。一致

    // 自清理：删除新建模板，恢复 3 条种子
    cleanupTemplate('EVIDENCE_TMP_A')
    const list = await mock<PageData>('GET', '/notify/templates', { pageNum: '1', pageSize: '10' })
    expect(list!.data.total).toBe(3)
  })
})

// ─── f. 停用 → 发送拒绝 ──────────────────────────────────

describe('f. toggle 停用 id=1 后按代码发送', () => {
  it('toggle → code=0；send 该代码 → code=404「模板不存在或未启用」；末尾恢复启用', async () => {
    const toggle = await mock('PUT', '/notify/templates/1/toggle', { enabled: 'false' })
    expect(toggle!.code).toBe(0)

    // 状态确实落盘：GET 详情 enabled=false
    const detail = await mock<TemplateDetail>('GET', '/notify/templates/1')
    expect(detail!.data.enabled).toBe(false)

    const send = await mock<number>(
      'POST',
      '/notify/templates/send',
      {},
      {
        templateCode: 'WF_TODO_NOTICE',
        recipientId: 1,
        variables: { userName: '张三', taskName: '差旅审批' },
      },
    )
    expect(send!.code).toBe(404)
    expect(send!.message).toContain('模板不存在或未启用')
    // 对照后端 send：requireEnabledByCode → NOT_FOUND(404, "模板不存在或未启用: xxx")。一致

    // 恢复种子启用态，避免污染后续用例
    await mock('PUT', '/notify/templates/1/toggle', { enabled: 'true' })
  })
})

// ─── g. 停用模板预览 ─────────────────────────────────────

describe('g. 对停用模板（id=3 DISABLED_SAMPLE）POST preview', () => {
  it('实际 code=0 —— 预览不查模板可用性，与后端一致（差异点如实记录）', async () => {
    const preview = await mock<{ title: string; content: string }>(
      'POST',
      '/notify/templates/preview',
      {},
      {
        titleTemplate: '示例 ${n}',
        contentTemplate: '该模板处于停用状态，编号 ${n}。',
        variables: { n: '42' },
      },
    )
    // 实际行为记录：code=0（非 400/404）。预览接口按提交内容渲染，
    // 不做 requireEnabledByCode 可用性检查——与真实后端 renderPreview 完全一致
    // （NotifyTemplateServiceImpl.renderPreview 只校验标题/正文非空，然后直接渲染）。
    // 预览 vs 发送的可用性检查差异由发送侧 requireEnabledByCode 承担（场景 f 已验证 404）。
    expect(preview!.code).toBe(0)
    expect(preview!.message).toBe('ok')
    expect(preview!.data.title).toBe('示例 42')
    expect(preview!.data.content).toBe('该模板处于停用状态，编号 42。')
  })
})

// ─── g2. 按模板代码预览的可用性检查（补证缺口 G1） ─────────

describe('g2-a. 停用模板按代码预览（POST /notify/templates/:code/preview）', () => {
  it('停用种子 id=3 DISABLED_SAMPLE → code=404「模板不存在或未启用」', async () => {
    const preview = await mock(
      'POST',
      '/notify/templates/DISABLED_SAMPLE/preview',
      {},
      {
        variables: { n: '42' },
      },
    )
    expect(preview!.code).toBe(404)
    expect(preview!.message).toContain('模板不存在或未启用')
    // 对照后端 NotifyTemplateServiceImpl.previewByCode → requireEnabledByCode
    // → NOT_FOUND(404, "模板不存在或未启用: xxx")，与发送链路同源。一致
  })
})

describe('g2-b. 删除模板按代码预览', () => {
  it('新建→删除后按代码预览 → code=404；末尾自清理恢复种子', async () => {
    const create = await mock<number>(
      'POST',
      '/notify/templates',
      {},
      {
        templateCode: 'EVIDENCE_PV_DEL',
        name: '证据预览删除模板',
        titleTemplate: '标题 ${v}',
        contentTemplate: '正文 ${v}',
        enabled: true,
        remark: null,
      },
    )
    expect(create!.code).toBe(0)
    const newId = create!.data as number

    const del = await mock('DELETE', `/notify/templates/${newId}`)
    expect(del!.code).toBe(0)

    const preview = await mock('POST', '/notify/templates/EVIDENCE_PV_DEL/preview', {})
    expect(preview!.code).toBe(404)
    expect(preview!.message).toContain('模板不存在或未启用')

    cleanupTemplate('EVIDENCE_PV_DEL')
  })
})

describe('g2-c. 按代码预览无副作用 + 启用模板正常渲染', () => {
  it('启用种子 id=1 渲染正确；失败预览前后 MOCK_NOTIFY_MESSAGES 数量不变', async () => {
    const before = MOCK_NOTIFY_MESSAGES.length

    const okPreview = await mock<{ title: string; content: string }>(
      'POST',
      '/notify/templates/WF_TODO_NOTICE/preview',
      {},
      { variables: { userName: '王五', taskName: '测试审批' } },
    )
    expect(okPreview!.code).toBe(0)
    expect(okPreview!.data.title).toBe('王五 的待办提醒')
    expect(okPreview!.data.content).toBe('您好 王五，您有一条新的待办任务「测试审批」需要处理。')

    const rejected = await mock(
      'POST',
      '/notify/templates/DISABLED_SAMPLE/preview',
      {},
      {
        variables: {},
      },
    )
    expect(rejected!.code).toBe(404)

    expect(MOCK_NOTIFY_MESSAGES.length).toBe(before) // 零落库
    // 对照后端：previewByCode 只读模板表、不写 sw_notify_message。一致
  })
})

// ─── h/i/j. 预览校验与渲染 ───────────────────────────────

describe('h. preview 缺变量', () => {
  it('variables 不含 userName → code=400，message 含「缺少变量」', async () => {
    const res = await mock(
      'POST',
      '/notify/templates/preview',
      {},
      {
        titleTemplate: '${userName} 的提醒',
        contentTemplate: '正文 ${userName}',
        variables: {},
      },
    )
    expect(res!.code).toBe(400)
    expect(res!.message).toContain('缺少变量')
    // 对照后端 TemplateRenderService.render：missing 非空 → TemplateRenderException("缺少变量: ...")
    // → renderPreview 包装为 PARAM_ERROR(400)。一致
  })
})

describe('i. preview 非法占位符', () => {
  it('${1abc} → code=400「非法占位符」', async () => {
    const res = await mock(
      'POST',
      '/notify/templates/preview',
      {},
      {
        titleTemplate: '标题 ${1abc}',
        contentTemplate: '正文 ${ok}',
        variables: { ok: 'x' },
      },
    )
    expect(res!.code).toBe(400)
    expect(res!.message).toContain('非法占位符')
    // 对照后端 render：rawName 不匹配 VALID_VAR_NAME → "非法占位符: ${1abc}" → 400。一致
  })
})

describe('j. preview 合法变量 → send 落库逐字一致', () => {
  it('preview code=0 返回替换文本；同变量 send code=0 返回通知 id；messages 列表出现该 title/content', async () => {
    const vars = { userName: '李四', taskName: '合同审批' }
    const preview = await mock<{ title: string; content: string }>(
      'POST',
      '/notify/templates/preview',
      {},
      {
        titleTemplate: '${userName} 的待办提醒',
        contentTemplate: '您好 ${userName}，您有一条新的待办任务「${taskName}」需要处理。',
        variables: vars,
      },
    )
    expect(preview!.code).toBe(0)
    expect(preview!.data.title).toBe('李四 的待办提醒')
    expect(preview!.data.content).toBe('您好 李四，您有一条新的待办任务「合同审批」需要处理。')

    const before = await mock<Array<{ id: number }>>('GET', '/notify/messages')
    expect(before!.code).toBe(0)
    const countBefore = (before!.data as Array<{ id: number }>).length

    const send = await mock<number>(
      'POST',
      '/notify/templates/send',
      {},
      {
        templateCode: 'WF_TODO_NOTICE',
        recipientId: 1,
        variables: vars,
      },
    )
    expect(send!.code).toBe(0)
    expect(typeof send!.data).toBe('number')

    const after = await mock<Array<{ title: string; content: string; bizType: string }>>(
      'GET',
      '/notify/messages',
    )
    expect(after!.code).toBe(0)
    const msgs = after!.data as Array<{ title: string; content: string; bizType: string }>
    expect(msgs.length).toBe(countBefore + 1)
    const landed = msgs.find((m) => m.title === '李四 的待办提醒')
    expect(landed).toBeDefined()
    expect(landed!.content).toBe('您好 李四，您有一条新的待办任务「合同审批」需要处理。')
    expect(landed!.bizType).toBe('SYSTEM')
    // 预览结果 = 落库内容逐字一致（对照后端：preview 与 send 共用 renderService.render）。一致
  })
})

// ─── k. DELETE 幂等 ──────────────────────────────────────

describe('k. DELETE 不存在 id', () => {
  it('code=0（幂等），种子不受影响', async () => {
    const res = await mock('DELETE', '/notify/templates/99999')
    expect(res!.code).toBe(0)
    expect(res!.message).toBe('ok')

    const list = await mock<PageData>('GET', '/notify/templates', { pageNum: '1', pageSize: '10' })
    expect(list!.code).toBe(0)
    expect(list!.data.total).toBe(3)
    // 对照后端 deleteTemplate：@TableLogic 逻辑删除，deleteById 幂等返回 ok。一致
  })
})

// ─── l. 发送失败原子性 ───────────────────────────────────

describe('l. 发送失败无半成品残留', () => {
  it('缺变量 send 失败前后消息数相等', async () => {
    const before = await mock<unknown[]>('GET', '/notify/messages')
    expect(before!.code).toBe(0)
    const countBefore = (before!.data as unknown[]).length
    expect(countBefore).toBeGreaterThan(0) // 场景 j 已落一条，此处 >0 即可

    const failSend = await mock(
      'POST',
      '/notify/templates/send',
      {},
      {
        templateCode: 'WF_APPROVED_NOTICE',
        recipientId: 1,
        variables: { userName: '王五' }, // 缺 submitTime
      },
    )
    expect(failSend!.code).toBe(400)
    expect(failSend!.message).toContain('缺少变量')
    expect(failSend!.message).toContain('submitTime')

    const after = await mock<unknown[]>('GET', '/notify/messages')
    expect(after!.code).toBe(0)
    const msgs = after!.data as Array<{ title: string; content: string }>
    expect(msgs.length).toBe(countBefore)
    // 无半成品：不存在残留的未替换占位符消息
    expect(msgs.some((m) => m.title.includes('${') || m.content.includes('${'))).toBe(false)
    // 对照后端 send：先渲染成功才 messageService.save，失败发生在任何落库之前。一致
  })

  it('收尾：恢复种子状态（清空场景 j 新增消息、id=1 保持启用）', async () => {
    // 场景 j 向 MOCK_NOTIFY_MESSAGES push 了 1 条（id=Date.now()）；移除它恢复 8 条种子
    const systemMsgIds = MOCK_NOTIFY_MESSAGES.filter((m) => m.bizType === 'SYSTEM').map((m) => m.id)
    for (const id of systemMsgIds) {
      const idx = MOCK_NOTIFY_MESSAGES.findIndex((m) => m.id === id)
      if (idx !== -1) MOCK_NOTIFY_MESSAGES.splice(idx, 1)
    }
    expect(MOCK_NOTIFY_MESSAGES.length).toBe(8)
    const t1 = MOCK_NOTIFY_TEMPLATES.find((t) => t.id === 1)!
    expect(t1.enabled).toBe(true)
  })
})
