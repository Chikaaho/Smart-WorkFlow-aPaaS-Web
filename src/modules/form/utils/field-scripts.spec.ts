import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { useUserStore } from '@/stores/user'
import { createFieldScripts, validateFieldScript } from './field-scripts'
import type { FormSchema } from '@/contracts/form-schema'

/**
 * BF20261013-021：表单字段脚本运行时用例。
 */
function schemaWithScripts(): FormSchema {
  return {
    title: 't',
    fields: [
      { type: 'TEXT', name: 'field_a', label: 'A' },
      {
        type: 'TEXT',
        name: 'field_b',
        label: 'B',
        script: { code: '#设置字段值(field_c, #获取字段值(field_a) + "!");' },
      },
      { type: 'TEXT', name: 'field_c', label: 'C' },
      {
        type: 'TEXT',
        name: 'field_d',
        label: 'D',
        script: { code: '#设置隐藏(field_d, true);', onLoad: true },
      },
    ],
  }
}

describe('createFieldScripts', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  it('onLoad 等待异步受控集成结果后写入字段，不落 Promise 对象', async () => {
    const schema: FormSchema = {
      title: 'async integration',
      fields: [
        {
          type: 'TEXT',
          name: 'src',
          label: 'S',
          script: {
            code: '#设置字段值("out", #调用集成("cap_q"));',
            onLoad: true,
          },
        },
        { type: 'TEXT', name: 'out', label: 'O' },
      ],
    }
    const model = reactive<Record<string, unknown>>({ src: '', out: '' })
    const runtime = createFieldScripts({
      getSchema: () => schema,
      model,
      allowedIntegrations: () => ['cap_q'],
      callIntegration: async () => 'async-result',
    })
    await runtime.runOnLoad()
    expect(model.out).toBe('async-result')
    expect(runtime.lastError()).toBe('')
  })

  it('字段值变化触发该字段脚本：# 糖读写字段值', async () => {
    const schema = schemaWithScripts()
    const model = reactive<Record<string, unknown>>({ field_a: 'x', field_b: '', field_c: '' })
    const runtime = createFieldScripts({ getSchema: () => schema, model })
    model.field_b = 'changed'
    await nextTick()
    expect(model.field_c).toBe('x!')
    runtime.dispose()
  })

  it('组织快照与日期函数可在 # 糖中同步调用', async () => {
    const schema: FormSchema = {
      title: 't',
      fields: [
        {
          type: 'TEXT',
          name: 'owner',
          label: '负责人',
          script: { code: '#设置字段值(owner_name, #获取用户姓名("1001"));' },
        },
        { type: 'TEXT', name: 'owner_name', label: '负责人姓名' },
        {
          type: 'TEXT',
          name: 'today',
          label: '日期',
          script: { code: '#设置字段值(next_week, #日期加减(#当前日期(), 7));' },
        },
        { type: 'TEXT', name: 'next_week', label: '下周' },
      ],
    }
    const model = reactive<Record<string, unknown>>({
      owner: '',
      owner_name: '',
      today: '',
      next_week: '',
    })
    const runtime = createFieldScripts({
      getSchema: () => schema,
      model,
      orgContext: () => ({ users: [{ id: '1001', name: '张三' }], depts: [] }),
    })
    model.owner = '1001'
    model.today = 'changed'
    await nextTick()
    expect(runtime.lastError()).toBe('')
    expect(model.owner_name).toBe('张三')
    expect(String(model.next_week)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    runtime.dispose()
  })

  it('设置必填/隐藏/只读写入覆盖层', async () => {
    const schema: FormSchema = {
      title: 't',
      fields: [
        {
          type: 'TEXT',
          name: 'src',
          label: 'S',
          script: { code: '#设置必填(dst, true); #设置只读(dst, true);' },
        },
        { type: 'TEXT', name: 'dst', label: 'D' },
      ],
    }
    const model = reactive<Record<string, unknown>>({ src: '', dst: '' })
    const runtime = createFieldScripts({ getSchema: () => schema, model })
    model.src = '1'
    await nextTick()
    expect(runtime.overrides.required.dst).toBe(true)
    expect(runtime.overrides.readonly.dst).toBe(true)
    runtime.dispose()
  })

  it('onLoad 脚本仅在 runOnLoad 时执行', async () => {
    const schema = schemaWithScripts()
    const model = reactive<Record<string, unknown>>({
      field_a: '',
      field_b: '',
      field_c: '',
      field_d: '',
    })
    const runtime = createFieldScripts({ getSchema: () => schema, model })
    await nextTick()
    expect(runtime.overrides.hidden.field_d).toBeUndefined()
    runtime.runOnLoad()
    expect(runtime.overrides.hidden.field_d).toBe(true)
    runtime.dispose()
  })

  it('enabled=false（只读查看态）不执行脚本', async () => {
    const schema: FormSchema = {
      title: 't',
      fields: [
        {
          type: 'TEXT',
          name: 'a',
          label: 'A',
          script: { code: '#设置字段值(b, "ran");', onLoad: true },
        },
        { type: 'TEXT', name: 'b', label: 'B' },
      ],
    }
    const model = reactive<Record<string, unknown>>({ a: '', b: '' })
    const runtime = createFieldScripts({ getSchema: () => schema, model, enabled: () => false })
    model.a = '1'
    await nextTick()
    runtime.runOnLoad()
    expect(model.b).toBe('')
    runtime.dispose()
  })

  it('未知字段名报错且不打断运行', async () => {
    const schema: FormSchema = {
      title: 't',
      fields: [
        { type: 'TEXT', name: 'a', label: 'A', script: { code: '#设置字段值(not_exist, 1);' } },
      ],
    }
    const errorSpy = vi.spyOn(ElMessage, 'error').mockImplementation(() => ({}) as never)
    const model = reactive<Record<string, unknown>>({ a: '' })
    const runtime = createFieldScripts({ getSchema: () => schema, model })
    model.a = 'x'
    await nextTick()
    expect(runtime.lastError()).toContain('字段不存在')
    expect(errorSpy).toHaveBeenCalled()
    runtime.dispose()
  })

  it('互写级联在 12 步内收敛（死循环不会无限执行）', async () => {
    const schema: FormSchema = {
      title: 't',
      fields: [
        {
          type: 'TEXT',
          name: 'x',
          label: 'X',
          script: { code: '#设置字段值(y, String(#获取字段值(y)) + "x");' },
        },
        {
          type: 'TEXT',
          name: 'y',
          label: 'Y',
          script: { code: '#设置字段值(x, String(#获取字段值(x)) + "y");' },
        },
      ],
    }
    const model = reactive<Record<string, unknown>>({ x: '', y: '' })
    const runtime = createFieldScripts({ getSchema: () => schema, model })
    model.x = 'a'
    for (let i = 0; i < 40; i++) {
      await nextTick()
    }
    // 断言：联动真实发生（y 被写入）且未无限增长（字符串长度有界）
    expect(String(model.y)).toContain('x')
    expect(String(model.x).length).toBeLessThan(40)
    expect(String(model.y).length).toBeLessThan(40)
    runtime.dispose()
  })

  it('主表批量/清空、字段元信息、子表汇总与上下文函数真实可用', async () => {
    const store = useUserStore()
    store.user = {
      id: 'u1',
      username: 'u1',
      displayName: '用户一',
      deptId: 'd1',
      tenantId: 't1',
    }
    store.roles = new Set(['role_a'])
    const schema: FormSchema = {
      title: 't',
      fields: [
        {
          type: 'TEXT',
          name: 'src',
          label: 'S',
          script: {
            code: [
              '#批量设置字段值(a, "1", b, "2");',
              '#清空字段(b);',
              '#设置字段值(total, #汇总子表列(items, qty));',
              '#设置字段值(count, #获取子表行数(items));',
              '#设置字段值(fieldType, #获取字段类型(a));',
              '#设置字段值(fieldList, #获取字段列表());',
              '#设置字段值(optionList, #获取字段选项(choice));',
              '#设置字段值(formId, #获取表单标识());',
              '#设置字段值(formVersion, #获取表单版本());',
              '#设置字段值(submission, #获取当前提交结果());',
              '#设置字段值(status, #获取流程状态());',
              '#设置字段值(flowVar, #获取流程变量(var1));',
              '#设置字段值(tenant, #获取当前租户());',
              '#设置字段值(roles, #获取当前用户角色());',
            ].join(' '),
          },
        },
        { type: 'TEXT', name: 'a', label: 'A' },
        { type: 'TEXT', name: 'b', label: 'B' },
        { type: 'NUMBER', name: 'total', label: 'total' },
        { type: 'NUMBER', name: 'count', label: 'count' },
        { type: 'TEXT', name: 'fieldType', label: 'type' },
        { type: 'TEXT', name: 'fieldList', label: 'fields' },
        { type: 'TEXT', name: 'optionList', label: 'options' },
        { type: 'TEXT', name: 'formId', label: 'form' },
        { type: 'NUMBER', name: 'formVersion', label: 'version' },
        { type: 'TEXT', name: 'submission', label: 'submission' },
        { type: 'TEXT', name: 'status', label: 'status' },
        { type: 'TEXT', name: 'flowVar', label: 'flowVar' },
        { type: 'TEXT', name: 'tenant', label: 'tenant' },
        { type: 'TEXT', name: 'roles', label: 'roles' },
        {
          type: 'DICT',
          name: 'choice',
          label: 'choice',
          dictType: 'test_dict',
          options: [
            { key: 'a', value: 'A' },
            { key: 'b', value: 'B' },
          ],
        },
        {
          type: 'TABLE',
          name: 'items',
          label: 'items',
          subFields: [
            { type: 'NUMBER', name: 'qty', label: 'qty' },
            { type: 'TEXT', name: 'name', label: 'name' },
          ],
        },
      ],
    }
    const model = reactive<Record<string, unknown>>({
      src: '',
      a: '',
      b: '',
      total: 0,
      count: 0,
      fieldType: '',
      fieldList: [],
      optionList: [],
      formId: '',
      formVersion: 0,
      submission: '',
      status: '',
      flowVar: '',
      tenant: '',
      roles: [],
      items: [
        { qty: 1, name: 'x' },
        { qty: 2, name: 'y' },
      ],
    })
    const runtime = createFieldScripts({
      getSchema: () => schema,
      model,
      processContext: () => ({ status: 'RUNNING', var1: 'v1' }),
      formContext: () => ({ formKey: 'f1', version: 3, submissionId: 's1' }),
    })
    model.src = 'go'
    await nextTick()
    expect(model.a).toBe('1')
    expect(model.b).toBe('')
    expect(model.total).toBe(3)
    expect(model.count).toBe(2)
    expect(model.fieldType).toBe('TEXT')
    expect(model.fieldList).toEqual(schema.fields.map((field) => field.name))
    expect(model.optionList).toEqual(['A', 'B'])
    expect(model.formId).toBe('f1')
    expect(model.formVersion).toBe(3)
    expect(model.submission).toBe('s1')
    expect(model.status).toBe('RUNNING')
    expect(model.flowVar).toBe('v1')
    expect(model.tenant).toBe('t1')
    expect(model.roles).toEqual(['role_a'])
    runtime.dispose()
  })

  it('子表增删改、批量列值与行标识真实生效', async () => {
    const schema: FormSchema = {
      title: 't',
      fields: [
        {
          type: 'TEXT',
          name: 'src',
          label: 'S',
          script: {
            code: [
              '#设置字段值(added, #新增子表行(items, qty, 5, name, "z"));',
              '#设置字段值(firstId, #获取子表行标识(items, 0));',
              '#批量设置子表字段值(items, name, "m");',
              '#设置子表字段值(items, 1, qty, 10);',
              '#删除子表行(items, 0);',
            ].join(' '),
          },
        },
        { type: 'NUMBER', name: 'added', label: 'added' },
        { type: 'TEXT', name: 'firstId', label: 'firstId' },
        {
          type: 'TABLE',
          name: 'items',
          label: 'items',
          subFields: [
            { type: 'NUMBER', name: 'qty', label: 'qty' },
            { type: 'TEXT', name: 'name', label: 'name' },
          ],
        },
      ],
    }
    const model = reactive<Record<string, unknown>>({
      src: '',
      added: 0,
      firstId: '',
      items: [
        { id: 'row-1', qty: 1, name: 'x' },
        { qty: 2, name: 'y' },
      ],
    })
    const runtime = createFieldScripts({ getSchema: () => schema, model })
    model.src = 'go'
    await nextTick()
    expect(model.added).toBe(2)
    expect(model.firstId).toBe('row-1')
    expect(model.items).toEqual([
      { qty: 10, name: 'm' },
      { qty: 5, name: 'm' },
    ])
    runtime.dispose()
  })

  it('未授权的受控集成返回明确错误，不产生副作用', async () => {
    const schema: FormSchema = {
      title: 't',
      fields: [
        {
          type: 'TEXT',
          name: 'src',
          label: 'S',
          script: { code: '#调用集成("crm_write");' },
        },
      ],
    }
    const callIntegration = vi.fn()
    const model = reactive<Record<string, unknown>>({ src: '' })
    const runtime = createFieldScripts({
      getSchema: () => schema,
      model,
      allowedIntegrations: () => [],
      callIntegration,
    })
    model.src = 'go'
    await nextTick()
    expect(callIntegration).not.toHaveBeenCalled()
    expect(runtime.lastError()).toContain('集成能力未授权')
    runtime.dispose()
  })

  it('validateFieldScript：合法编译通过与语法错误诊断', () => {
    expect(validateFieldScript('#设置字段值(a, 1);')).toBeNull()
    expect(validateFieldScript('return #;')).toContain('应为函数名')
    expect(validateFieldScript('if (')).not.toBeNull()
  })
})
