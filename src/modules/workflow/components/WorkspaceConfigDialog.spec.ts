import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'

/* 配置工作台居中弹窗（273:1600 · direction-ui-completion-020）：
 * 页脚 恢复默认/取消/确定 复用同一 WorkspaceBoard 保存语义；
 * 确定仅在保存成功（dirty 归零）后关闭，取消丢弃未保存修改。 */

const saveConfig = vi.fn()
const resetConfig = vi.fn()
const dirty = ref(false)

vi.mock('./WorkspaceBoard.vue', () => ({
  default: {
    name: 'WorkspaceBoard',
    props: {
      editable: { type: Boolean, default: false },
      embedded: { type: Boolean, default: false },
      configViaDialog: { type: Boolean, default: false },
    },
    setup(_: unknown, { expose }: { expose: (v: unknown) => void }) {
      expose({ saveConfig, resetConfig, dirty })
      return () => null
    },
  },
}))

import WorkspaceConfigDialog from './WorkspaceConfigDialog.vue'

function mountDialog() {
  return mount(WorkspaceConfigDialog, {
    props: { visible: true },
    global: {
      stubs: {
        'el-dialog': {
          name: 'ElDialog',
          props: {
            modelValue: Boolean,
            title: String,
            width: String,
            alignCenter: Boolean,
            destroyOnClose: Boolean,
            appendTobody: Boolean,
          },
          template:
            '<div class="dialog-stub" :data-title="title"><slot /><div class="dialog-stub__footer"><slot name="footer" /></div></div>',
        },
      },
    },
  })
}

function footerButton(wrapper: ReturnType<typeof mountDialog>, label: string) {
  const button = wrapper
    .findAll('.dialog-stub__footer button')
    .find((b) => b.text().trim() === label)
  expect(button, `footer button ${label}`).toBeTruthy()
  return button!
}

describe('WorkspaceConfigDialog', () => {
  it('居中弹窗承载编辑画布，页脚提供恢复默认/取消/确定', () => {
    const wrapper = mountDialog()
    expect(wrapper.find('.dialog-stub').attributes('data-title')).toBe('配置工作台')
    const dialog = wrapper.findComponent({ name: 'ElDialog' })
    // 273:1600：1120 宽居中浮层；内容超高由画布区滚动，页脚保持可达。
    expect(dialog.props('width')).toBe('1120px')
    expect(dialog.props('alignCenter')).toBe(true)
    expect(wrapper.findComponent({ name: 'WorkspaceBoard' }).props('editable')).toBe(true)
    expect(wrapper.findComponent({ name: 'WorkspaceBoard' }).props('embedded')).toBe(true)
    expect(footerButton(wrapper, '恢复默认')).toBeTruthy()
    expect(footerButton(wrapper, '取消')).toBeTruthy()
    expect(footerButton(wrapper, '确定')).toBeTruthy()
    wrapper.unmount()
  })

  it('确定保存成功后关闭弹窗；保存失败（dirty 保持）不关闭', async () => {
    const wrapper = mountDialog()
    saveConfig.mockReset()

    saveConfig.mockImplementation(() => {
      dirty.value = false
    })
    await footerButton(wrapper, '确定').trigger('click')
    await nextTick()
    expect(saveConfig).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('update:visible')?.at(-1)).toEqual([false])

    await wrapper.setProps({ visible: true })
    saveConfig.mockImplementation(() => {
      dirty.value = true
    })
    await footerButton(wrapper, '确定').trigger('click')
    await nextTick()
    expect(saveConfig).toHaveBeenCalledTimes(2)
    // 保存失败：不新增关闭事件，编辑不丢（唯一一次关闭仍来自上一步成功保存）
    expect(wrapper.emitted('update:visible')).toHaveLength(1)
    wrapper.unmount()
  })

  it('取消直接关闭且不触发保存；恢复默认走同一复位语义', async () => {
    const wrapper = mountDialog()
    saveConfig.mockReset()
    resetConfig.mockReset()
    dirty.value = true

    await footerButton(wrapper, '取消').trigger('click')
    expect(wrapper.emitted('update:visible')?.at(-1)).toEqual([false])
    expect(saveConfig).not.toHaveBeenCalled()

    await footerButton(wrapper, '恢复默认').trigger('click')
    expect(resetConfig).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
})
