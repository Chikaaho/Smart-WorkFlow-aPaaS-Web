import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ElMessage } from 'element-plus'
import { ApiError, request } from '@/foundation/request'
import AttachmentControl from './AttachmentControl.vue'
import DynamicField from '../DynamicField.vue'
import type { DynamicFieldSchema } from '../dynamic-field-registry'

vi.mock('@/foundation/request', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/foundation/request')>()),
  request: vi.fn(),
}))

const wrappers: Array<{ unmount: () => void }> = []
const createUrl = vi.fn(() => 'blob:attachment-download')
const revokeUrl = vi.fn()
const clicks: Array<{ href: string; name: string }> = []
const nativeUrl = globalThis.URL
const file = { storageKey: 'file-a', name: '演练方案.pdf' }

function mountControl(extra: Record<string, unknown> = {}) {
  const wrapper = mount(AttachmentControl, {
    props: {
      field: { name: 'document', type: 'ATTACHMENT' } as DynamicFieldSchema,
      modelValue: [file],
      readonly: true,
      formKey: 'form',
      recordId: 'record-1',
      ...extra,
    },
  })
  wrappers.push(wrapper)
  return wrapper
}

beforeEach(() => {
  vi.mocked(request).mockReset()
  createUrl.mockClear()
  revokeUrl.mockClear()
  clicks.length = 0
  vi.stubGlobal(
    'URL',
    class extends nativeUrl {
      static createObjectURL = createUrl
      static revokeObjectURL = revokeUrl
    },
  )
  vi.stubGlobal(
    'FileReader',
    class {
      result = ''
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      readAsDataURL(blob: Blob) {
        this.result =
          blob.type === 'image/old' ? 'data:image/png;base64,b2xk' : 'data:image/png;base64,bmV3'
        this.onload?.()
      }
    },
  )
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicks.push({ href: this.href, name: this.download })
  })
  vi.spyOn(ElMessage, 'error').mockReturnValue({ close: vi.fn() })
})

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('AttachmentControl 记录附件读取', () => {
  it('兼容已存储的字符串文件键，并沿用受保护下载入口', async () => {
    vi.mocked(request).mockResolvedValue(new Blob(['legacy']))
    const wrapper = mountControl({ modelValue: ['old/path/plan.pdf'] })
    expect(wrapper.text()).toContain('plan.pdf')
    await wrapper.find('.attachment-control__download').trigger('click')
    await flushPromises()
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { formKey: 'form', storageKey: 'old/path/plan.pdf', name: 'plan.pdf' },
      }),
    )
    expect(clicks[0]?.name).toBe('plan.pdf')
  })

  it('经登录态请求正确记录与文件，下载后释放临时地址', async () => {
    const blob = new Blob(['pdf'], { type: 'application/pdf' })
    vi.mocked(request).mockResolvedValue(blob)
    const wrapper = mountControl()
    await wrapper.find('.attachment-control__download').trigger('click')
    await flushPromises()
    expect(request).toHaveBeenCalledWith({
      method: 'GET',
      url: '/workflow/attachments/record-1/download',
      responseType: 'blob',
      params: { formKey: 'form', storageKey: 'file-a', name: file.name },
    })
    expect(createUrl).toHaveBeenCalledWith(blob)
    expect(clicks).toEqual([{ href: 'blob:attachment-download', name: file.name }])
    expect(revokeUrl).toHaveBeenCalledWith('blob:attachment-download')
  })

  it('未保存或缺少记录上下文时仅显示文件名，不请求公共替代地址', () => {
    const wrapper = mountControl({ recordId: '' })
    expect(wrapper.text()).toContain(file.name)
    expect(wrapper.find('.attachment-control__download').exists()).toBe(false)
    expect(request).not.toHaveBeenCalled()
  })

  it('服务端拒绝时显示实际错误，不创建下载文件', async () => {
    vi.mocked(request).mockRejectedValue(new ApiError(403, '无权读取此记录附件'))
    const wrapper = mountControl()
    await wrapper.find('.attachment-control__download').trigger('click')
    await flushPromises()
    expect(ElMessage.error).toHaveBeenCalledWith('无权读取此记录附件')
    expect(createUrl).not.toHaveBeenCalled()
    expect(clicks).toHaveLength(0)
  })

  it('传输失败提供可重试提示且按钮恢复可用', async () => {
    vi.mocked(request).mockRejectedValue(new Error('transport'))
    const wrapper = mountControl()
    await wrapper.find('.attachment-control__download').trigger('click')
    await flushPromises()
    expect(ElMessage.error).toHaveBeenCalledWith('附件下载失败，请重试')
    expect(wrapper.find('.attachment-control__download').attributes('disabled')).toBeUndefined()
  })

  it('图片预览使用同一受保护的记录请求并显示读取结果', async () => {
    vi.mocked(request).mockResolvedValue(new Blob(['image'], { type: 'image/png' }))
    const wrapper = mountControl({ field: { name: 'photo', type: 'IMAGE' } })
    await flushPromises()
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/workflow/attachments/record-1/download',
        params: { formKey: 'form', storageKey: 'file-a', name: file.name },
      }),
    )
    expect(wrapper.find('.attachment-control__thumb').attributes('src')).toBe(
      'data:image/png;base64,bmV3',
    )
    expect(wrapper.html()).not.toContain('/api/workflow/attachments/download?')
  })

  it('图片读取拒绝保留真实不可预览状态和下载入口', async () => {
    vi.mocked(request).mockRejectedValue(new ApiError(403, 'denied'))
    const wrapper = mountControl({ field: { name: 'photo', type: 'IMAGE' } })
    await flushPromises()
    expect(wrapper.find('.attachment-control__thumb').exists()).toBe(false)
    expect(wrapper.find('[role="status"]').text()).toBe('图片暂时无法预览')
    expect(wrapper.find('.attachment-control__download').exists()).toBe(true)
  })

  it('切换记录后迟到图片结果不能回填新记录', async () => {
    let resolveOld!: (blob: Blob) => void
    let resolveNew!: (blob: Blob) => void
    vi.mocked(request)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveNew = resolve
          }),
      )
    const wrapper = mountControl({ field: { name: 'photo', type: 'IMAGE' } })
    await wrapper.setProps({ recordId: 'record-2' })
    resolveOld(new Blob(['old'], { type: 'image/old' }))
    await flushPromises()
    expect(wrapper.find('.attachment-control__thumb').exists()).toBe(false)
    resolveNew(new Blob(['new'], { type: 'image/png' }))
    await flushPromises()
    expect(wrapper.find('.attachment-control__thumb').attributes('src')).toBe(
      'data:image/png;base64,bmV3',
    )
    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({ url: '/workflow/attachments/record-2/download' }),
    )
  })

  it('子表附件沿用主记录上下文', () => {
    const wrapper = mount(DynamicField, {
      props: {
        field: { name: 'lines', type: 'TABLE', subFields: [{ name: 'proof', type: 'ATTACHMENT' }] },
        modelValue: [{ proof: [file] }],
        readonly: true,
        formKey: 'form',
        recordId: 'parent-record',
      },
    })
    wrappers.push(wrapper)
    const control = wrapper.findComponent(AttachmentControl)
    expect(control.props('recordId')).toBe('parent-record')
    expect(control.props('formKey')).toBe('form')
    expect(control.find('.attachment-control__download').exists()).toBe(true)
  })

  it('现有上传继续追加真实存储键并保留已选文件', async () => {
    vi.mocked(request).mockResolvedValue({
      storageKey: 'new-file',
      storageName: 'stored',
      fileSize: 3,
    })
    const wrapper = mountControl({ readonly: false })
    const input = wrapper.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', {
      value: [new File(['pdf'], 'new.pdf', { type: 'application/pdf' })],
    })
    await input.trigger('change')
    await flushPromises()
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: '/workflow/attachments/upload',
        data: expect.any(FormData),
      }),
    )
    expect(wrapper.emitted('update:modelValue')?.[0]?.[0]).toEqual([
      file,
      { storageKey: 'new-file', name: 'new.pdf' },
    ])
  })
})
