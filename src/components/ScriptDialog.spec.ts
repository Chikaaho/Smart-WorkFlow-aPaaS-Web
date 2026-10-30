import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ElMessageBox } from 'element-plus'
import ScriptDialog from './ScriptDialog.vue'
import { PROCESS_SCRIPT_FUNCTIONS } from './script-catalog'

vi.mock('element-plus', async (importOriginal) => ({
  ...(await importOriginal<typeof import('element-plus')>()),
  ElMessageBox: { confirm: vi.fn() },
}))

const stubs = {
  DetailDialog: {
    props: ['modelValue'],
    template: '<div v-if="modelValue"><slot/><slot name="footer"/></div>',
  },
  'el-input': {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template:
      '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  'el-button': { template: '<button><slot/></button>' },
  'el-tooltip': { template: '<span><slot/></span>' },
}
function open(
  simulate?: (
    code: string,
    signal?: AbortSignal,
  ) => Promise<{ ok: boolean; value?: unknown; log: string[] }>,
) {
  return mount(ScriptDialog, {
    props: {
      visible: true,
      title: '脚本',
      code: 'return true;',
      functions: PROCESS_SCRIPT_FUNCTIONS,
      simulate,
    },
    global: { stubs },
  })
}
const wrappers: ReturnType<typeof open>[] = []
function create(simulate?: Parameters<typeof open>[0]) {
  const wrapper = open(simulate)
  wrappers.push(wrapper)
  return wrapper
}
function button(wrapper: ReturnType<typeof open>, name: string) {
  return wrapper.findAll('button').find((item) => item.text() === name)!
}
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('shared script workspace', () => {
  it('initializes an already open dialog and searches descriptions without losing code', async () => {
    const wrapper = create()
    expect(wrapper.get('textarea').element.value).toBe('return true;')
    await wrapper.get('input').setValue('负责人')
    expect(wrapper.findAll('.script-dialog__fn-name').map((item) => item.text())).toEqual([
      '#获取部门负责人',
      '#获取分管领导',
    ])
    await wrapper.get('input').setValue('missing-function')
    expect(wrapper.findAll('.script-dialog__fn-name')).toHaveLength(0)
    expect(wrapper.text()).toContain('没有匹配的函数')
    expect(wrapper.get('textarea').element.value).toBe('return true;')
  })

  it('inserts at the selected code range and applies only when requested', async () => {
    const wrapper = create()
    wrapper.get('textarea').element.setSelectionRange(7, 11)
    await wrapper.get('.script-dialog__fn-name').trigger('click')
    expect(wrapper.get('textarea').element.value).toBe('return #获取流程变量(var_example);')
    expect(wrapper.emitted('save')).toBeUndefined()
    await button(wrapper, '应用').trigger('click')
    expect(wrapper.emitted('save')).toEqual([['return #获取流程变量(var_example);']])
  })

  it('cancels without saving and resets the next opening to the supplied code', async () => {
    const wrapper = create()
    await wrapper.get('textarea').setValue('return 42;')
    await button(wrapper, '取消').trigger('click')
    expect(wrapper.emitted('save')).toBeUndefined()
    await wrapper.setProps({ visible: false })
    await wrapper.setProps({ visible: true, code: 'return 7;' })
    expect(wrapper.get('textarea').element.value).toBe('return 7;')
    expect(wrapper.text()).toContain('尚未运行')
  })

  it('confirms clearing and keeps the draft when confirmation is cancelled', async () => {
    const wrapper = create()
    vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce('cancel')
    await button(wrapper, '清空').trigger('click')
    await flushPromises()
    expect(wrapper.get('textarea').element.value).toBe('return true;')
    vi.mocked(ElMessageBox.confirm).mockResolvedValueOnce(
      'confirm' as Awaited<ReturnType<typeof ElMessageBox.confirm>>,
    )
    await button(wrapper, '清空').trigger('click')
    await flushPromises()
    expect(wrapper.get('textarea').element.value).toBe('')
    expect(wrapper.emitted('save')).toBeUndefined()
  })

  it('runs the local bounded interpreter and displays syntax failures independently', async () => {
    const wrapper = create()
    await button(wrapper, '运行').trigger('click')
    expect(wrapper.get('[data-testid="script-sim-result"]').text()).toContain('返回值：true')
    await wrapper.get('textarea').setValue('return window.location;')
    await button(wrapper, '运行').trigger('click')
    expect(wrapper.get('.script-dialog__status').text()).toBe('失败')
    expect(wrapper.find('.script-dialog__sim-error').exists()).toBe(true)
    expect(wrapper.emitted('save')).toBeUndefined()
  })

  it('aborts a closed preview and ignores its late response after reopening', async () => {
    let finish!: (value: { ok: boolean; value: unknown; log: string[] }) => void
    const simulate = vi.fn(
      (_code: string, _signal?: AbortSignal) =>
        new Promise<{ ok: boolean; value: unknown; log: string[] }>((resolve) => {
          finish = resolve
        }),
    )
    const wrapper = create(simulate)
    await button(wrapper, '运行').trigger('click')
    await button(wrapper, '运行').trigger('click')
    expect(simulate).toHaveBeenCalledTimes(1)
    await wrapper.setProps({ visible: false })
    expect(simulate.mock.calls[0]![1]?.aborted).toBe(true)
    await wrapper.setProps({ visible: true })
    finish({ ok: true, value: 'stale', log: [] })
    await flushPromises()
    expect(wrapper.text()).not.toContain('stale')
    expect(wrapper.text()).toContain('尚未运行')
  })

  it('cancels an obsolete preview when code changes and bounds a stalled preview', async () => {
    vi.useFakeTimers()
    const simulate = vi.fn(
      (_code: string, _signal?: AbortSignal) =>
        new Promise<{ ok: boolean; log: string[] }>(() => {}),
    )
    const wrapper = create(simulate)
    await button(wrapper, '运行').trigger('click')
    await wrapper.get('textarea').setValue('return false;')
    expect(simulate.mock.calls[0]![1]?.aborted).toBe(true)
    await button(wrapper, '运行').trigger('click')
    await vi.advanceTimersByTimeAsync(15000)
    expect(simulate.mock.calls[1]![1]?.aborted).toBe(true)
    expect(wrapper.text()).toContain('预览超时，请重试')
    expect(vi.getTimerCount()).toBe(0)
  })
})
