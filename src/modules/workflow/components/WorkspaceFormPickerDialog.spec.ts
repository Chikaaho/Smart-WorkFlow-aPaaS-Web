import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import WorkspaceFormPickerDialog from './WorkspaceFormPickerDialog.vue'
import type { WorkspaceFormSource } from '../api/workspace-analytics'

const stubs = {
  'el-dialog': {
    template: '<div v-if="modelValue" class="el-dialog-stub"><slot/><slot name="footer"/></div>',
    props: ['modelValue', 'title', 'width'],
  },
  'el-input': {
    template:
      '<input class="el-input-stub" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ['modelValue', 'placeholder'],
    emits: ['update:modelValue'],
  },
  'el-button': {
    template:
      '<button class="el-button-stub" :disabled="disabled" @click="$emit(\'click\')"><slot/></button>',
    props: ['disabled', 'text', 'size'],
    emits: ['click'],
  },
}

const sources: WorkspaceFormSource[] = [
  {
    formKey: 'drill_apply',
    name: '灾备演练申请',
    formVersion: 2,
    appId: 'app-1',
    appName: '灾备演练',
    recordCount: 23,
  },
  {
    formKey: 'drill_report',
    name: '灾备演练报告',
    formVersion: 1,
    appId: 'app-1',
    appName: '灾备演练',
    recordCount: 4,
  },
  {
    formKey: 'admin_leave',
    name: '请假申请',
    formVersion: 3,
    appId: 'app-2',
    appName: '行政办公',
    recordCount: 0,
  },
]

function mountDialog(visible = true) {
  return mount(WorkspaceFormPickerDialog, {
    props: { modelValue: visible, sources, currentFormKey: null },
    global: { stubs },
  })
}

describe('WorkspaceFormPickerDialog.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('渲染应用分类（全部应用+去重应用）与表单卡（名称+可见记录数+首字）', () => {
    const wrapper = mountDialog()
    const cats = wrapper.findAll('.wsfp__cat')
    expect(cats.length).toBe(3)
    expect(cats[0].text()).toContain('全部应用')
    expect(cats[1].text()).toContain('灾备演练')
    expect(cats[2].text()).toContain('行政办公')
    const glyphs = wrapper.findAll('.wsfp__cat-glyph')
    expect(glyphs[1].text()).toBe('灾')
    const forms = wrapper.findAll('.wsfp__form')
    expect(forms.length).toBe(3)
    expect(forms[0].text()).toContain('灾备演练申请')
    expect(forms[0].text()).toContain('23 条记录')
    expect(wrapper.find('.wsfp__hint').text()).toBe('仅展示有权查看的表单')
  })

  it('应用分类过滤与关键字过滤共用同一列表', async () => {
    const wrapper = mountDialog()
    await wrapper.findAll('.wsfp__cat')[1].trigger('click')
    expect(wrapper.findAll('.wsfp__form').length).toBe(2)
    await wrapper.findAll('.wsfp__cat')[0].trigger('click')
    await wrapper.find('input.el-input-stub').setValue('请假')
    await nextTick()
    const forms = wrapper.findAll('.wsfp__form')
    expect(forms.length).toBe(1)
    expect(forms[0].text()).toContain('请假申请')
  })

  it('点击表单卡选中，确定后回填 formKey 并关闭；未选择时确定不可用', async () => {
    const wrapper = mountDialog()
    const confirm = wrapper.findAll('.el-button-stub').find((b) => b.text() === '确认选择')!
    expect(confirm.attributes('disabled')).toBeDefined()
    await wrapper.findAll('.wsfp__form')[1].trigger('click')
    expect(wrapper.findAll('.wsfp__form')[1].classes()).toContain('is-selected')
    await confirm.trigger('click')
    expect(wrapper.emitted('select')).toEqual([['drill_report']])
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })

  it('打开时回显当前绑定并复位过滤条件', async () => {
    const wrapper = mount(WorkspaceFormPickerDialog, {
      props: { modelValue: false, sources, currentFormKey: 'admin_leave' },
      global: { stubs },
    })
    await wrapper.setProps({ modelValue: true })
    await nextTick()
    expect(wrapper.findAll('.wsfp__form')[2].classes()).toContain('is-selected')
  })
})
