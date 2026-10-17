import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import FieldListPanel from './FieldListPanel.vue'
import type { DesignerItem } from './types'
import type { FormSchemaField, TableSubField } from '@/contracts/form-schema'

/**
 * FieldListPanel 单测（0.1.7 #38/#39 字段清单工作区）。
 *
 * 覆盖 Owner 口径：
 *   - 不止主表单：主表 + 各子表（TABLE 字段）分组切换，子表内列出其子字段；
 *   - 不提供删除与停用（无这两个动作/列）；
 *   - 发布过的字段只能改长度、名称和描述——可编辑项仅 字段名 / 字段长度 / 描述，
 *     字段编码、控件类型、数据类型、必填为只读事实；非字符串族长度显示「—」。
 */

const mainText = {
  name: 'amount',
  type: 'TEXT',
  label: '金额',
  length: 100,
  required: true,
  description: '含税金额',
} as FormSchemaField

const mainDate = {
  name: 'apply_date',
  type: 'DATE',
  label: '申请日期',
} as FormSchemaField

const subFields: TableSubField[] = [
  { name: 'item_name', type: 'TEXT', label: '费用项', length: 50 },
  { name: 'qty', type: 'NUMBER', label: '数量' },
]

const tableField = {
  name: 'items',
  type: 'TABLE',
  label: '报销明细',
  subFields,
} as FormSchemaField

const items: DesignerItem[] = [
  { id: 'di_1', field: mainText },
  { id: 'di_2', field: mainDate },
  { id: 'di_3', field: tableField },
]

/** 表格渲染需要等 el-table 自身下一拍（真实组件），统一 mount 后两拍再断言。 */
async function mountPanel(overrides?: { items?: DesignerItem[]; formKey?: string }) {
  const wrapper = mount(FieldListPanel, {
    props: { items: overrides?.items ?? items, formKey: overrides?.formKey ?? 'leave-request' },
  })
  await nextTick()
  await nextTick()
  return wrapper
}

/** 行内可编辑输入框（el-input 的透传属性可能落在根节点或内层 input 上，两种都兼容）。 */
function fieldInput(wrapper: Awaited<ReturnType<typeof mountPanel>>, testId: string) {
  const root = wrapper.find(`[data-testid="${testId}"]`)
  if (!root.exists()) return null
  if ((root.element as HTMLElement).tagName === 'INPUT') return root
  return root.find('input')
}

/** 某字段行「字段名」输入框的当前值（字段名是输入框，不是纯文本）。 */
function labelInputValue(wrapper: Awaited<ReturnType<typeof mountPanel>>, key: string) {
  const input = fieldInput(wrapper, `field-label-${key}`)
  return input && input.exists() ? (input.element as HTMLInputElement).value : null
}

describe('FieldListPanel（#38/#39 字段清单）', () => {
  it('主表 + 子表分组：主表列出非 TABLE 字段，子表带自己的表名与子字段', async () => {
    const wrapper = await mountPanel()

    const scopes = wrapper.findAll('[role="tab"]')
    expect(scopes.map((tab) => tab.text())).toEqual(['主表', '报销明细'])
    // 表名口径：主表 = formKey；子表 = formKey.子表字段编码
    expect(wrapper.find('[data-testid="field-table-name"]').text()).toBe('表名：leave-request')
    expect(labelInputValue(wrapper, 'di_1')).toBe('金额')
    expect(labelInputValue(wrapper, 'di_2')).toBe('申请日期')
    // TABLE 自身不出现在主表行里（它就是一个子表范围）
    expect(labelInputValue(wrapper, 'di_3')).toBeNull()

    await wrapper.find('[data-testid="field-scope-di_3"]').trigger('click')
    expect(wrapper.find('[data-testid="field-table-name"]').text()).toBe(
      '表名：leave-request.items',
    )
    expect(labelInputValue(wrapper, 'di_3-0')).toBe('费用项')
    expect(labelInputValue(wrapper, 'di_3-1')).toBe('数量')
    // 切到子表后不再展示主表字段
    expect(labelInputValue(wrapper, 'di_1')).toBeNull()
  })

  it('不提供删除/停用：清单表格内无这两个动作', async () => {
    const wrapper = await mountPanel()
    const tableText = wrapper.find('.el-table').text()
    expect(tableText).not.toContain('删除')
    expect(tableText).not.toContain('停用')
    expect(
      wrapper.findAll('button').every((button) => !['删除', '停用'].includes(button.text())),
    ).toBe(true)
  })

  it('可编辑项只有字段名/长度/描述：补丁回抛给宿主（单一数据源）', async () => {
    const wrapper = await mountPanel()

    await fieldInput(wrapper, 'field-label-di_1')!.setValue('报销金额')
    expect(wrapper.emitted('patch')?.at(-1)).toEqual([
      { field: mainText, patch: { label: '报销金额' } },
    ])

    await fieldInput(wrapper, 'field-description-di_1')!.setValue('含税金额（元）')
    expect(wrapper.emitted('patch')?.at(-1)).toEqual([
      { field: mainText, patch: { description: '含税金额（元）' } },
    ])
  })

  it('只读事实：字段编码/控件类型/数据类型/必填；非字符串族长度显示「—」', async () => {
    const wrapper = await mountPanel()
    const html = wrapper.find('.el-table').html()

    expect(html).toContain('amount')
    expect(html).toContain('单行文本')
    expect(html).toContain('VARCHAR')
    expect(html).toContain('必填')
    expect(html).toContain('字段编码')
    // TEXT 有长度输入；DATE 无长度输入（显示 —）
    expect(wrapper.find('[data-testid="field-length-di_1"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="field-length-di_2"]').exists()).toBe(false)
  })

  it('搜索按字段名/编码过滤当前表的行', async () => {
    const wrapper = await mountPanel()
    await wrapper.find('.field-list__search input').setValue('apply')
    await nextTick()
    expect(labelInputValue(wrapper, 'di_2')).toBe('申请日期')
    expect(labelInputValue(wrapper, 'di_1')).toBeNull()
  })

  // 0.1.7 #40（Owner）：「噪音信息太多」——说明文案整段移除；单表时不渲染表范围与表名
  it('无说明文案：清单不再出现「可直接维护…」「已发布字段结构受版本约束…」等说明噪音', async () => {
    const wrapper = await mountPanel()
    const text = wrapper.text()
    expect(text).not.toContain('可直接维护')
    expect(text).not.toContain('版本约束')
  })

  it('单表（无子表）不渲染表范围与表名；多表（含子表）才渲染', async () => {
    const single = await mountPanel({ items: [items[0]!, items[1]!], formKey: 'leave-request' })
    expect(single.findAll('[role="tab"]')).toHaveLength(0)
    expect(single.find('[data-testid="field-table-name"]').exists()).toBe(false)

    const multi = await mountPanel()
    expect(multi.findAll('[role="tab"]')).toHaveLength(2)
    expect(multi.find('[data-testid="field-table-name"]').exists()).toBe(true)
  })

  it('空表提示：没有字段时给出添加引导而不是空表', async () => {
    const wrapper = await mountPanel({ items: [] })
    expect(wrapper.find('[data-testid="field-list-empty"]').exists()).toBe(true)
  })
})
