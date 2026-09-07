import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

/* ── 可变的 route mock：测试间可修改 query ── */
let mockQuery: Record<string, string> = {}
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { formKey: 'test-form-key' }, query: mockQuery }),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/modules/form/api/form', () => ({
  getFormDefinition: vi.fn(),
  submitForm: vi.fn(),
  getFormData: vi.fn(),
  updateFormData: vi.fn(),
  normalizeSubmitData: vi.fn((data: Record<string, unknown>) => data),
}))

vi.mock('@/modules/form/utils/resolve-reference-display', () => ({
  resolveReferenceDisplay: vi.fn().mockResolvedValue('ref-display'),
}))

vi.mock('@/modules/workflow/api', () => ({
  getDraft: vi.fn(),
  createDraft: vi.fn(),
  updateDraft: vi.fn(),
  submitDraft: vi.fn(),
  pollCommandStatus: vi.fn(),
  queryInstances: vi.fn(),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...(actual as object),
    ElMessage: {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    },
  }
})

import { getFormDefinition, getFormData, submitForm } from '@/modules/form/api/form'
import {
  getDraft,
  createDraft,
  updateDraft,
  submitDraft,
  pollCommandStatus,
} from '@/modules/workflow/api'
import { ElMessage } from 'element-plus'
import type { BpmDraft } from '@/contracts/bpm'
import FormRender from './FormRender.vue'

/* ── 通用 stubs ── */

const baseStubs = {
  DictSelect: { template: '<select />' },
  ElDatePicker: { template: '<input type="text" />' },
  ElInputNumber: { template: '<input type="number" />' },
  ElSkeleton: { template: '<div />' },
  ElEmpty: { template: '<div />' },
  ElAlert: { props: ['title'], template: '<div class="el-alert">{{ title }}</div>' },
  ElButton: { template: '<button><slot /></button>' },
  DynamicField: {
    props: ['field', 'modelValue', 'readonly', 'referenceLabel'],
    template:
      '<div class="dynamic-field-stub" :data-field-name="field.name" :data-readonly="readonly" :data-reference-label="referenceLabel" :data-model-value="String(modelValue)"><label>{{ field.label ?? field.name }}</label></div>',
  },
}

describe('FormRender', () => {
  beforeEach(() => {
    vi.mocked(getFormDefinition).mockReset()
    vi.mocked(getFormData).mockReset()
    vi.mocked(submitForm).mockReset()
    vi.mocked(getDraft).mockReset()
    vi.mocked(createDraft).mockReset()
    vi.mocked(updateDraft).mockReset()
    vi.mocked(submitDraft).mockReset()
    vi.mocked(pollCommandStatus).mockReset()
    mockQuery = {}
  })

  it('renders one DynamicField per field for given FormSchema', async () => {
    vi.mocked(getFormDefinition).mockResolvedValueOnce({
      title: '测试表单',
      fields: [
        { name: 'f1', type: 'TEXT', required: false },
        { name: 'f2', type: 'NUMBER', required: false },
        { name: 'f3', type: 'BOOL', required: false },
        { name: 'f4', type: 'DATE', required: false },
        { name: 'f5', type: 'REFERENCE', required: false },
      ],
    })

    const wrapper = mount(FormRender, {
      global: { stubs: baseStubs },
    })

    await flushPromises()

    const fields = wrapper.findAll('[data-field-name]')
    expect(fields).toHaveLength(5)
  })

  it('renders form title from schema', async () => {
    vi.mocked(getFormDefinition).mockResolvedValueOnce({
      title: '我的业务表单',
      fields: [{ name: 'x', type: 'TEXT', required: false }],
    })

    const wrapper = mount(FormRender, {
      global: { stubs: baseStubs },
    })

    await flushPromises()
    expect(wrapper.text()).toContain('我的业务表单')
  })

  it('renders DICT and TABLE field types', async () => {
    vi.mocked(getFormDefinition).mockResolvedValueOnce({
      title: 'F',
      fields: [
        { name: 'd1', type: 'DICT', dictType: 'some_type', required: false },
        {
          name: 't1',
          type: 'TABLE',
          required: false,
          subFields: [{ name: 'col', type: 'TEXT' }],
        },
      ],
    })

    const wrapper = mount(FormRender, {
      global: { stubs: baseStubs },
    })

    await flushPromises()

    const fields = wrapper.findAll('[data-field-name]')
    expect(fields).toHaveLength(2)
  })

  it('shows error message when schema loading fails', async () => {
    vi.mocked(getFormDefinition).mockRejectedValueOnce(new Error('load failed'))

    const wrapper = mount(FormRender, {
      global: { stubs: baseStubs },
    })

    await flushPromises()

    expect(wrapper.text()).toContain('表单定义加载失败')
  })

  it('passes readonly=true when mode=view with recordId', async () => {
    mockQuery = { recordId: 'rec_001', mode: 'view' }

    vi.mocked(getFormDefinition).mockResolvedValueOnce({
      title: '查看表单',
      fields: [{ name: 'x', type: 'TEXT', required: false }],
    })
    vi.mocked(getFormData).mockResolvedValueOnce({ id: 'rec_001', version: 1, x: 'hello' })

    const wrapper = mount(FormRender, {
      global: { stubs: baseStubs },
    })

    await flushPromises()
    await flushPromises() // 等待 record query + ref resolve

    const field = wrapper.find('[data-field-name="x"]')
    expect(field.attributes('data-readonly')).toBe('true')
    // 查看模式不显示提交/保存按钮
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('loads record and resolves REFERENCE display name in edit mode', async () => {
    mockQuery = { recordId: 'rec_001', mode: 'edit' }

    vi.mocked(getFormDefinition).mockResolvedValueOnce({
      title: '编辑表单',
      fields: [
        { name: 'name', type: 'TEXT', required: false },
        { name: 'related', type: 'REFERENCE', targetFormId: 'other-form', required: false },
      ],
    })
    vi.mocked(getFormData).mockResolvedValueOnce({
      id: 'rec_001',
      version: 1,
      name: '张三',
      ref_related_id: 'ref_001',
    })

    const wrapper = mount(FormRender, {
      global: { stubs: baseStubs },
    })

    await flushPromises()
    await flushPromises() // 等待 ref resolve

    // REFERENCE 字段应传入 referenceLabel
    const refField = wrapper.find('[data-field-name="related"]')
    expect(refField.attributes('data-reference-label')).toBe('ref-display')
    // 编辑模式不 readonly
    expect(refField.attributes('data-readonly')).toBe('false')
  })

  it('shows submit button for new form (no recordId)', async () => {
    vi.mocked(getFormDefinition).mockResolvedValueOnce({
      title: '新建',
      fields: [{ name: 'x', type: 'TEXT', required: false }],
    })

    const wrapper = mount(FormRender, {
      global: { stubs: baseStubs },
    })

    await flushPromises()

    expect(wrapper.text()).toContain('提交')
  })

  it('shows required validation inline and keeps the next grid row below the error', async () => {
    vi.mocked(getFormDefinition).mockResolvedValueOnce({
      title: '必填校验',
      fields: [
        { name: 'required_name', type: 'TEXT', required: true },
        { name: 'next_field', type: 'TEXT', required: false },
      ],
    })

    const wrapper = mount(FormRender, {
      global: { stubs: baseStubs },
    })

    await flushPromises()
    await wrapper.find('button').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-validation-error-for="required_name"]').text()).toBe(
      '此字段为必填项',
    )
    expect(wrapper.text()).toContain('请完善必填项后再提交')
    expect(submitForm).not.toHaveBeenCalled()
  })
})

/* ── draft 模式（我的草稿 → 真实表单控件填报） ── */

const draftFields = [
  { name: 'applicant', label: '申请人', type: 'TEXT' as const, required: false },
  { name: 'days', label: '天数', type: 'NUMBER' as const, required: false },
]

const draftRecord: BpmDraft = {
  id: 5,
  title: '张三的请假',
  formKey: 'leave-request',
  formVersion: '2',
  processDefKey: null,
  payload: '{"applicant":"李四","days":3}',
  status: 'EDITING',
  commandId: null,
  submitSeq: 0,
  resultRecordId: null,
  lastError: null,
  createTime: '2026-08-01T09:00:00',
  updateTime: '2026-08-01T09:00:00',
}

const draftStubs = {
  ...baseStubs,
  'el-input': { template: '<div class="draft-title-input" />', props: ['modelValue'] },
  'el-checkbox': { template: '<div class="draft-refresh-switch" />', props: ['modelValue'] },
}

function findButtonByText(wrapper: ReturnType<typeof mount>, text: string) {
  return wrapper.findAll('button').find((b) => b.text().includes(text)) ?? null
}

describe('FormRender draft mode', () => {
  beforeEach(() => {
    vi.mocked(getFormDefinition).mockReset()
    vi.mocked(getDraft).mockReset()
    vi.mocked(createDraft).mockReset()
    vi.mocked(updateDraft).mockReset()
    vi.mocked(submitDraft).mockReset()
    vi.mocked(pollCommandStatus).mockReset()
    mockQuery = {}
  })

  it('backfills controls from draft payload when draftId is present', async () => {
    mockQuery = { mode: 'draft', draftId: '5' }
    vi.mocked(getFormDefinition).mockResolvedValueOnce({ title: '请假申请单', fields: draftFields })
    vi.mocked(getDraft).mockResolvedValueOnce(draftRecord)

    const wrapper = mount(FormRender, { global: { stubs: draftStubs } })
    await flushPromises()
    await flushPromises()

    expect(getDraft).toHaveBeenCalledWith('5')
    expect(wrapper.find('[data-field-name="applicant"]').attributes('data-model-value')).toBe(
      '李四',
    )
    expect(wrapper.find('[data-field-name="days"]').attributes('data-model-value')).toBe('3')
    expect(wrapper.text()).toContain('草稿填报')
    expect(wrapper.text()).toContain('保存草稿')
    expect(wrapper.text()).toContain('提交草稿')
  })

  it('saves an existing draft via updateDraft and never calls form-data submit', async () => {
    mockQuery = { mode: 'draft', draftId: '5' }
    vi.mocked(getFormDefinition).mockResolvedValueOnce({ title: '请假申请单', fields: draftFields })
    vi.mocked(getDraft).mockResolvedValueOnce(draftRecord)
    vi.mocked(updateDraft).mockResolvedValueOnce(draftRecord)

    const wrapper = mount(FormRender, { global: { stubs: draftStubs } })
    await flushPromises()
    await flushPromises()

    const saveBtn = findButtonByText(wrapper, '保存草稿')
    expect(saveBtn).not.toBeNull()
    await saveBtn!.trigger('click')
    await flushPromises()

    expect(updateDraft).toHaveBeenCalledWith(
      '5',
      expect.objectContaining({ payload: JSON.stringify({ applicant: '李四', days: 3 }) }),
    )
    expect(createDraft).not.toHaveBeenCalled()
    expect(submitForm).not.toHaveBeenCalled()
    expect(ElMessage.success).toHaveBeenCalledWith('草稿已保存')
  })

  it('submits an existing draft via updateDraft + submitDraft + poll to COMPLETED', async () => {
    mockQuery = { mode: 'draft', draftId: '5' }
    vi.mocked(getFormDefinition).mockResolvedValueOnce({ title: '请假申请单', fields: draftFields })
    vi.mocked(getDraft).mockResolvedValueOnce(draftRecord)
    vi.mocked(updateDraft).mockResolvedValueOnce(draftRecord)
    vi.mocked(submitDraft).mockResolvedValueOnce({
      commandId: 'cmd-1',
      commandKey: 'k1',
      commandType: 'DRAFT_SUBMIT',
      channel: 'ASYNC',
      status: 'ACCEPTED',
      duplicated: false,
    })
    vi.mocked(pollCommandStatus).mockResolvedValueOnce({
      commandId: 'cmd-1',
      commandType: 'DRAFT_SUBMIT',
      channel: 'ASYNC',
      status: 'COMPLETED',
      result: { recordId: 'rec-1' },
      failureReason: null,
      retryCount: 0,
      createTime: '2026-08-01T10:00:00',
      finishedAt: '2026-08-01T10:00:01',
    })

    const wrapper = mount(FormRender, { global: { stubs: draftStubs } })
    await flushPromises()
    await flushPromises()

    const submitBtn = findButtonByText(wrapper, '提交草稿')
    expect(submitBtn).not.toBeNull()
    await submitBtn!.trigger('click')
    await flushPromises()

    expect(updateDraft).toHaveBeenCalled()
    expect(submitDraft).toHaveBeenCalledWith('5')
    expect(pollCommandStatus).toHaveBeenCalledWith('cmd-1')
    expect(ElMessage.success).toHaveBeenCalledWith('提交成功')
  })

  it('creates a new draft via createDraft in draft mode without draftId', async () => {
    mockQuery = { mode: 'draft' }
    vi.mocked(getFormDefinition).mockResolvedValueOnce({ title: '请假申请单', fields: draftFields })
    vi.mocked(createDraft).mockResolvedValueOnce(draftRecord)

    const wrapper = mount(FormRender, { global: { stubs: draftStubs } })
    await flushPromises()

    expect(getDraft).not.toHaveBeenCalled()
    const saveBtn = findButtonByText(wrapper, '保存草稿')
    await saveBtn!.trigger('click')
    await flushPromises()

    expect(createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        formKey: 'test-form-key',
        payload: JSON.stringify({ applicant: '', days: 0 }),
      }),
    )
    expect(updateDraft).not.toHaveBeenCalled()
    expect(ElMessage.success).toHaveBeenCalledWith('草稿已创建')
  })
})
