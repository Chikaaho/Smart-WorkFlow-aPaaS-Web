import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockRequest = vi.fn()

vi.mock('@/foundation/request', () => ({
  request: <T>(config: unknown): Promise<T> => mockRequest(config),
}))

// fetch 也用 mock（downloadFile 走 fetch）
const mockFetch = vi.fn()
globalThis.fetch = mockFetch

const storageApi = await import('./index')

// ─── 造数据 ───

function makeStorageFile(
  overrides: Partial<import('@/contracts/storage').StorageFile> = {},
): import('@/contracts/storage').StorageFile {
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

function makeUploadResult(
  overrides: Partial<import('@/contracts/storage').StorageUploadResult> = {},
): import('@/contracts/storage').StorageUploadResult {
  return {
    storageKey: 'abc123.pdf',
    storageName: 'abc123.pdf',
    storageUrl: '/files/abc123.pdf',
    fileSize: 1024,
    ...overrides,
  }
}

// ═══════════════════════════════════════

describe('modules/storage/api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ─── uploadFile ───

  describe('uploadFile', () => {
    it('POST /storage/files/upload with FormData, returns StorageUploadResult', async () => {
      const result = makeUploadResult()
      mockRequest.mockResolvedValueOnce(result)

      const file = new File(['test content'], 'test.pdf', { type: 'application/pdf' })
      const data = await storageApi.uploadFile(file)

      expect(mockRequest).toHaveBeenCalledTimes(1)
      const call = mockRequest.mock.calls[0][0]
      expect(call.method).toBe('POST')
      expect(call.url).toBe('/storage/files/upload')
      expect(call.data).toBeInstanceOf(FormData)
      expect(call.data.get('file')).toBe(file)
      expect(data).toEqual(result)
    })
  })

  // ─── listFiles ───

  describe('listFiles', () => {
    it('GET /storage/files?page=&size=, adapts MyBatis-Plus Page', async () => {
      const file = makeStorageFile()
      mockRequest.mockResolvedValueOnce({
        records: [file],
        total: 100,
        pageNum: 1,
        pageSize: 20,
      })

      const result = await storageApi.listFiles(1, 20)

      expect(mockRequest).toHaveBeenCalledWith({
        method: 'GET',
        url: '/storage/files',
        params: { page: 1, size: 20 },
      })
      expect(result.list).toHaveLength(1)
      expect(result.list[0].originalName).toBe('测试文件.pdf')
      expect(result.total).toBe(100)
      expect(result.pageNum).toBe(1)
      expect(result.pageSize).toBe(20)
    })

    it('returns empty list when no files', async () => {
      mockRequest.mockResolvedValueOnce({
        records: [],
        total: 0,
        pageNum: 1,
        pageSize: 20,
      })

      const result = await storageApi.listFiles(1, 20)
      expect(result.list).toHaveLength(0)
      expect(result.total).toBe(0)
    })
  })

  // ─── getFileInfo ───

  describe('getFileInfo', () => {
    it('GET /storage/files/{storageKey} → StorageFile', async () => {
      const file = makeStorageFile()
      mockRequest.mockResolvedValueOnce(file)

      const result = await storageApi.getFileInfo('abc123.pdf')

      expect(mockRequest).toHaveBeenCalledWith({
        method: 'GET',
        url: '/storage/files/abc123.pdf',
      })
      expect(result).toEqual(file)
    })
  })

  // ─── deleteFile ───

  describe('deleteFile', () => {
    it('DELETE /storage/files/{storageKey} → void', async () => {
      mockRequest.mockResolvedValueOnce(undefined)

      await storageApi.deleteFile('abc123.pdf')

      expect(mockRequest).toHaveBeenCalledWith({
        method: 'DELETE',
        url: '/storage/files/abc123.pdf',
      })
    })
  })

  // ─── downloadFile ───

  describe('downloadFile', () => {
    it('GET via fetch, extracts filename from Content-Disposition', async () => {
      const blob = new Blob(['binary content'])
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(blob),
        headers: new Headers({
          'Content-Disposition':
            "attachment; filename*=UTF-8''%E6%B5%8B%E8%AF%95%E6%96%87%E4%BB%B6.pdf",
        }),
      })

      const result = await storageApi.downloadFile('abc123.pdf')

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const url = mockFetch.mock.calls[0][0]
      expect(url).toContain('/api/storage/files/abc123.pdf/download')
      expect(result.blob).toBe(blob)
      expect(result.fileName).toBe('测试文件.pdf')
    })

    it('throws on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      await expect(storageApi.downloadFile('nonexistent')).rejects.toThrow('下载失败')
    })

    it('falls back to storageKey when no Content-Disposition', async () => {
      const blob = new Blob(['content'])
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(blob),
        headers: new Headers(),
      })

      const result = await storageApi.downloadFile('abc123.pdf')
      expect(result.fileName).toBe('abc123.pdf')
    })
  })
})
