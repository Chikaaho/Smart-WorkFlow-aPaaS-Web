import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TextConfig from './TextConfig.vue'
import type { TextField } from '@/contracts/form-schema'

/**
 * 0.3.6 H8：TEXT 配置面板「键名/取值中文映射」编辑器。
 * 「键=中文名」逐行文本 ↔ jsonDisplay 映射；非法行忽略；
 * 双映射均清空回写 jsonDisplay=undefined；切换选中字段后本地文本从新字段重同步。
 */
function textField(overrides: Partial<TextField> = {}): TextField {
  return {
    name: 'deviceCommandPayload',
    type: 'TEXT',
    label: '到点下发的设备指令',
    ...overrides,
  }
}

function mountConfig(field: TextField = textField()) {
  return mount(TextConfig, { props: { field, otherNames: [] } })
}

const patchesOf = (wrapper: ReturnType<typeof mountConfig>) =>
  wrapper.emitted('update') as unknown as
    | Array<[{ jsonDisplay?: Record<string, unknown> | undefined }]>
    | undefined

describe('TextConfig JSON 参数中文映射编辑器（0.3.6 H8）', () => {
  it('已配置映射时按「键=中文名」逐行回显', () => {
    const wrapper = mountConfig(
      textField({
        jsonDisplay: {
          keyLabels: { drillCode: '演练编号', action: '动作' },
          valueLabels: { switch: '切换' },
        },
      }),
    )
    const textareas = wrapper.findAll('textarea')
    expect(textareas[0].element.value).toBe('drillCode=演练编号\naction=动作')
    expect(textareas[1].element.value).toBe('switch=切换')
  })

  it('输入合法映射行回写 jsonDisplay.keyLabels', async () => {
    const wrapper = mountConfig()
    const keyArea = wrapper.findAll('textarea')[0]
    await keyArea.setValue('drillCode=演练编号\naction=动作')

    const patches = patchesOf(wrapper)
    const last = patches?.at(-1)?.[0]
    expect(last?.jsonDisplay).toEqual({
      keyLabels: { drillCode: '演练编号', action: '动作' },
      valueLabels: undefined,
    })
  })

  it('非法行（无 = 或空键/空值）被忽略，不回写脏键', async () => {
    const wrapper = mountConfig()
    const keyArea = wrapper.findAll('textarea')[0]
    await keyArea.setValue('drillCode=演练编号\n没有等号的行\n=空键名\naction=')

    const last = patchesOf(wrapper)?.at(-1)?.[0]
    expect(last?.jsonDisplay).toEqual({
      keyLabels: { drillCode: '演练编号' },
      valueLabels: undefined,
    })
  })

  it('取值映射与键名映射合并进同一 jsonDisplay 补丁', async () => {
    const wrapper = mountConfig()
    await wrapper.findAll('textarea')[0].setValue('action=动作')
    await wrapper.findAll('textarea')[1].setValue('switch=切换')

    const last = patchesOf(wrapper)?.at(-1)?.[0]
    expect(last?.jsonDisplay).toEqual({
      keyLabels: { action: '动作' },
      valueLabels: { switch: '切换' },
    })
  })

  it('双映射均清空时回写 jsonDisplay=undefined（不落脏键）', async () => {
    const wrapper = mountConfig(textField({ jsonDisplay: { keyLabels: { a: '甲' } } }))
    const keyArea = wrapper.findAll('textarea')[0]
    await keyArea.setValue('')

    const last = patchesOf(wrapper)?.at(-1)?.[0]
    expect(last?.jsonDisplay).toBeUndefined()
  })

  it('切换选中字段后本地文本从新字段重同步', async () => {
    const wrapper = mountConfig(textField())
    await wrapper.setProps({
      field: textField({ jsonDisplay: { keyLabels: { machineRooms: '目标机房' } } }),
    })
    const keyArea = wrapper.findAll('textarea')[0]
    expect((keyArea.element as HTMLTextAreaElement).value).toBe('machineRooms=目标机房')
  })
})
