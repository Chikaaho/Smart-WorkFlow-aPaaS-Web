import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

// Mock storage API 层
vi.mock('@/modules/storage/api', () => ({
  listFiles: vi.fn(),
  uploadFile: vi.fn(),
  deleteFile: vi.fn(),
  downloadFile: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ params: {} }),
}))

// Mock Element Plus API
vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...(actual as object),
    ElMessage: { success: vi.fn(), error: vi.fn() },
    ElMessageBox: { confirm: vi.fn() },
  }
})

import { listFiles, uploadFile, deleteFile, downloadFile } from '@/modules/storage/api'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ApiError } from '@/foundation/request'
import type { StorageFile } from '@/contracts/storage'
import StorageList from './StorageList.vue'

// ─── 桩组件 ───

const stubs = {
  StandardListTemplate: {
    template:
      '<div><slot name="toolbar-actions"/><slot name="filter"/><slot name="filter-actions"/><slot/><slot name="empty-action"/></div>',
    props: ['title', 'total', 'pageNum', 'pageSize', 'empty'],
    emits: ['update:pageNum', 'update:pageSize'],
  },
  'el-alert': { template: '<div class="el-alert">{{ title }}</div>', props: ['title', 'type'] },
  'el-table': { template: '<div><slot/></div>', props: ['data'] },
  'el-table-column': { template: '<div/>' },
  'el-button': {
    template: '<button :disabled="disabled"><slot/></button>',
    props: ['disabled'],
  },
  'el-tag': { template: '<span><slot/></span>', props: ['type', 'size'] },
  'el-dialog': {
    template: '<div v-if="modelValue"><slot/><slot name="footer"/></div>',
    props: ['modelValue', 'title'],
  },
  'el-input': { template: '<input/>', props: ['modelValue', 'placeholder'] },
}

// ─── 造数据 ───

function makeStorageFile(overrides: Partial<StorageFile> = {}): StorageFile {
  return {
    id: 1,
    originalName: '测试文件.pdf',
    storageKey: 'abc123.pdf',
    storageName: 'abc123.pdf',
    fileSize: 1024,
    contentType: 'application/pdf',
    fileExt: 'pdf',
    providerType: 'minio',
    bucketName: 'test-bucket',
    storageUrl: '/files/abc123.pdf',
    createTime: '2026-07-19T10:00:00',
    updateTime: '2026-07-19T10:00:00',
    createBy: 1,
    updateBy: 1,
    ...overrides,
  }
}

// ═══════════════════════════════════════

describe('StorageList.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ─── onMounted 加载 ───

  it('calls listFiles on mount', async () => {
    const file = makeStorageFile()
    vi.mocked(listFiles).mockResolvedValueOnce({
      list: [file],
      total: 100,
      pageNum: 1,
      pageSize: 10,
    })

    const wrapper = mount(StorageList, { global: { stubs } })
    await nextTick()

    expect(listFiles).toHaveBeenCalledTimes(1)
    expect(listFiles).toHaveBeenCalledWith(1, 10)
    expect((wrapper.vm as unknown as { list: StorageFile[] }).list).toHaveLength(1)
    expect((wrapper.vm as unknown as { total: number }).total).toBe(100)
  })

  // ─── 列表数据 ───

  it('renders file data into list ref', async () => {
    const file = makeStorageFile()
    vi.mocked(listFiles).mockResolvedValueOnce({
      list: [file],
      total: 1,
      pageNum: 1,
      pageSize: 10,
    })

    const wrapper = mount(StorageList, { global: { stubs } })
    await nextTick()

    const vm = wrapper.vm as unknown as { list: StorageFile[] }
    expect(vm.list[0].originalName).toBe('测试文件.pdf')
    expect(vm.list[0].fileSize).toBe(1024)
    expect(vm.list[0].providerType).toBe('minio')
  })

  // ─── API 错误（ApiError）───

  it('sets errorMsg when listFiles fails with ApiError', async () => {
    vi.mocked(listFiles).mockRejectedValueOnce(new ApiError(5001, '获取文件列表失败'))
    const wrapper = mount(StorageList, { global: { stubs } })
    await nextTick()
    await nextTick()

    expect((wrapper.vm as unknown as { errorMsg: string }).errorMsg).toBe('获取文件列表失败')
  })

  // ─── API 错误（非 ApiError fallback）───

  it('sets fallback errorMsg for non-ApiError', async () => {
    vi.mocked(listFiles).mockRejectedValueOnce(new Error('Network error'))
    const wrapper = mount(StorageList, { global: { stubs } })
    await nextTick()
    await nextTick()

    expect((wrapper.vm as unknown as { errorMsg: string }).errorMsg).toBe('加载文件列表失败')
  })

  // ─── 空态 ───

  it('isEmpty is true when list is empty', async () => {
    vi.mocked(listFiles).mockResolvedValueOnce({
      list: [],
      total: 0,
      pageNum: 1,
      pageSize: 10,
    })

    const wrapper = mount(StorageList, { global: { stubs } })
    await nextTick()
    await nextTick()

    expect((wrapper.vm as unknown as { isEmpty: boolean }).isEmpty).toBe(true)
  })

  // ─── 上传弹窗 ───

  it('openUpload sets uploadDialogVisible to true', async () => {
    vi.mocked(listFiles).mockResolvedValueOnce({ list: [], total: 0, pageNum: 1, pageSize: 10 })
    const wrapper = mount(StorageList, { global: { stubs } })
    await nextTick()

    expect((wrapper.vm as unknown as { uploadDialogVisible: boolean }).uploadDialogVisible).toBe(
      false,
    )
    ;(wrapper.vm as unknown as { openUpload: () => void }).openUpload()
    expect((wrapper.vm as unknown as { uploadDialogVisible: boolean }).uploadDialogVisible).toBe(
      true,
    )
  })

  // ─── 上传成功 ───

  it('handleUpload success calls ElMessage.success and refreshes list', async () => {
    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' })
    vi.mocked(listFiles).mockResolvedValueOnce({ list: [], total: 0, pageNum: 1, pageSize: 10 })
    vi.mocked(uploadFile).mockResolvedValueOnce({
      storageKey: 'abc.pdf',
      storageName: 'abc.pdf',
      storageUrl: '/files/abc.pdf',
      fileSize: 7,
    })

    const wrapper = mount(StorageList, { global: { stubs } })
    await nextTick()

    const vm = wrapper.vm as unknown as {
      uploadFileRef: File | null
      handleUpload: () => Promise<void>
      uploadDialogVisible: boolean
    }
    vm.uploadFileRef = file
    await vm.handleUpload()
    await nextTick()

    expect(uploadFile).toHaveBeenCalledWith(file)
    expect(ElMessage.success).toHaveBeenCalled()
    // 弹窗应关闭，列表应刷新（listFiles 被多调一次）
    expect(listFiles).toHaveBeenCalledTimes(2)
    expect(vm.uploadDialogVisible).toBe(false)
  })

  // ─── 上传失败 ───

  it('handleUpload failure sets uploadError', async () => {
    vi.mocked(listFiles).mockResolvedValueOnce({ list: [], total: 0, pageNum: 1, pageSize: 10 })
    vi.mocked(uploadFile).mockRejectedValueOnce(new ApiError(5002, '上传失败'))

    const wrapper = mount(StorageList, { global: { stubs } })
    await nextTick()

    const vm = wrapper.vm as unknown as {
      uploadFileRef: File | null
      handleUpload: () => Promise<void>
      uploadError: string
    }
    vm.uploadFileRef = new File(['x'], 'x.pdf', { type: 'application/pdf' })
    await vm.handleUpload()

    expect(vm.uploadError).toBe('上传失败')
  })

  // ─── 删除确认 → 成功 ───

  it('handleDelete confirm calls deleteFile and refreshes list', async () => {
    const file = makeStorageFile()
    vi.mocked(listFiles).mockResolvedValueOnce({ list: [file], total: 1, pageNum: 1, pageSize: 10 })
    vi.mocked(ElMessageBox.confirm).mockResolvedValueOnce(undefined as never)
    vi.mocked(deleteFile).mockResolvedValueOnce(undefined)

    const wrapper = mount(StorageList, { global: { stubs } })
    await nextTick()

    await (
      wrapper.vm as unknown as { handleDelete: (r: StorageFile) => Promise<void> }
    ).handleDelete(file)
    await nextTick()

    expect(ElMessageBox.confirm).toHaveBeenCalled()
    expect(deleteFile).toHaveBeenCalledWith(file.storageKey)
    expect(ElMessage.success).toHaveBeenCalledWith('删除成功')
    expect(listFiles).toHaveBeenCalledTimes(2)
  })

  // ─── 删除取消 ───

  it('handleDelete cancel does not call deleteFile', async () => {
    const file = makeStorageFile()
    vi.mocked(listFiles).mockResolvedValueOnce({ list: [file], total: 1, pageNum: 1, pageSize: 10 })
    // ElMessageBox.confirm reject = 用户取消
    vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce(new Error('cancel'))

    const wrapper = mount(StorageList, { global: { stubs } })
    await nextTick()

    await (
      wrapper.vm as unknown as { handleDelete: (r: StorageFile) => Promise<void> }
    ).handleDelete(file)
    await nextTick()

    expect(deleteFile).not.toHaveBeenCalled()
    // 列表不应刷新
    expect(listFiles).toHaveBeenCalledTimes(1)
  })

  // ─── 删除失败 ───

  it('handleDelete failure calls ElMessage.error', async () => {
    const file = makeStorageFile()
    vi.mocked(listFiles).mockResolvedValueOnce({ list: [file], total: 1, pageNum: 1, pageSize: 10 })
    vi.mocked(ElMessageBox.confirm).mockResolvedValueOnce(undefined as never)
    vi.mocked(deleteFile).mockRejectedValueOnce(new ApiError(5003, '删除失败'))

    const wrapper = mount(StorageList, { global: { stubs } })
    await nextTick()

    await (
      wrapper.vm as unknown as { handleDelete: (r: StorageFile) => Promise<void> }
    ).handleDelete(file)
    await nextTick()

    expect(deleteFile).toHaveBeenCalledWith(file.storageKey)
    expect(ElMessage.error).toHaveBeenCalledWith('删除失败')
  })

  // ─── 下载成功 ───

  it('handleDownload calls downloadFile', async () => {
    const file = makeStorageFile()
    vi.mocked(listFiles).mockResolvedValueOnce({ list: [file], total: 1, pageNum: 1, pageSize: 10 })
    vi.mocked(downloadFile).mockResolvedValueOnce({
      blob: new Blob(['test']),
      fileName: '测试文件.pdf',
    })

    // 避免 JSDOM 中 document.body.appendChild 报错
    const appendChildSpy = vi
      .spyOn(document.body, 'appendChild')
      .mockImplementation((node: Node) => node)
    const removeChildSpy = vi
      .spyOn(document.body, 'removeChild')
      .mockImplementation((node: Node) => node)

    const wrapper = mount(StorageList, { global: { stubs } })
    await nextTick()

    await (
      wrapper.vm as unknown as { handleDownload: (r: StorageFile) => Promise<void> }
    ).handleDownload(file)
    await nextTick()

    expect(downloadFile).toHaveBeenCalledWith(file.storageKey)
    expect(appendChildSpy).toHaveBeenCalled()
    expect(removeChildSpy).toHaveBeenCalled()

    appendChildSpy.mockRestore()
    removeChildSpy.mockRestore()
  })

  // ─── 下载失败 ───

  it('handleDownload failure calls ElMessage.error', async () => {
    const file = makeStorageFile()
    vi.mocked(listFiles).mockResolvedValueOnce({ list: [file], total: 1, pageNum: 1, pageSize: 10 })
    vi.mocked(downloadFile).mockRejectedValueOnce(new ApiError(5004, '下载失败'))

    const wrapper = mount(StorageList, { global: { stubs } })
    await nextTick()

    await (
      wrapper.vm as unknown as { handleDownload: (r: StorageFile) => Promise<void> }
    ).handleDownload(file)
    await nextTick()

    expect(ElMessage.error).toHaveBeenCalledWith('下载失败')
  })
})
