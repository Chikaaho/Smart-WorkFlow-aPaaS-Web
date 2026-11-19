/**
 * 存储种子：文件列表。
 * 从 seeds.ts 按域拆出（行为零变化）；seeds.ts 聚合 re-export。
 */

export const MOCK_STORAGE_FILES: Array<{
  id: number
  originalName: string
  storageKey: string
  storageName: string
  fileSize: number
  contentType: string
  fileExt: string
  providerType: string
  bucketName: string
  storageUrl: string
  createTime: string
  updateTime: string
  createBy: number
  updateBy: number
}> = [
  {
    id: 1,
    originalName: '请假申请单模板.pdf',
    storageKey: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890.pdf',
    storageName: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890.pdf',
    fileSize: 245760,
    contentType: 'application/pdf',
    fileExt: 'pdf',
    providerType: 'minio',
    bucketName: 'sw-files',
    storageUrl: '/files/a1b2c3d4-e5f6-7890-abcd-ef1234567890.pdf',
    createTime: '2026-07-15T09:00:00',
    updateTime: '2026-07-15T09:00:00',
    createBy: 1,
    updateBy: 1,
  },
  {
    id: 2,
    originalName: '产品原型截图.png',
    storageKey: 'b2c3d4e5-f6a7-8901-bcde-f12345678901.png',
    storageName: 'b2c3d4e5-f6a7-8901-bcde-f12345678901.png',
    fileSize: 1572864,
    contentType: 'image/png',
    fileExt: 'png',
    providerType: 'cos',
    bucketName: 'sw-images-1250000000',
    storageUrl: 'https://sw-images-1250000000.cos.ap-guangzhou.myqcloud.com/files/b2c3d4e5.png',
    createTime: '2026-07-15T14:30:00',
    updateTime: '2026-07-15T14:30:00',
    createBy: 1,
    updateBy: 1,
  },
  {
    id: 3,
    originalName: '2026年Q2工作总结.docx',
    storageKey: 'c3d4e5f6-a7b8-9012-cdef-123456789012.docx',
    storageName: 'c3d4e5f6-a7b8-9012-cdef-123456789012.docx',
    fileSize: 51200,
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    fileExt: 'docx',
    providerType: 'local',
    bucketName: 'default',
    storageUrl: '/upload/c3d4e5f6-a7b8-9012-cdef-123456789012.docx',
    createTime: '2026-07-16T10:15:00',
    updateTime: '2026-07-16T10:15:00',
    createBy: 1,
    updateBy: 1,
  },
  {
    id: 4,
    originalName: '项目进度表.xlsx',
    storageKey: 'd4e5f6a7-b8c9-0123-defa-234567890123.xlsx',
    storageName: 'd4e5f6a7-b8c9-0123-defa-234567890123.xlsx',
    fileSize: 1048576,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    fileExt: 'xlsx',
    providerType: 'qiniu',
    bucketName: 'sw-docs',
    storageUrl: 'https://cdn.example.com/files/d4e5f6a7-b8c9-0123-defa-234567890123.xlsx',
    createTime: '2026-07-16T16:45:00',
    updateTime: '2026-07-16T16:45:00',
    createBy: 1,
    updateBy: 1,
  },
  {
    id: 5,
    originalName: '团建合影.jpg',
    storageKey: 'e5f6a7b8-c9d0-1234-efab-345678901234.jpg',
    storageName: 'e5f6a7b8-c9d0-1234-efab-345678901234.jpg',
    fileSize: 3145728,
    contentType: 'image/jpeg',
    fileExt: 'jpg',
    providerType: 'cos',
    bucketName: 'sw-images-1250000000',
    storageUrl: 'https://sw-images-1250000000.cos.ap-guangzhou.myqcloud.com/files/e5f6a7b8.jpg',
    createTime: '2026-07-17T08:00:00',
    updateTime: '2026-07-17T08:00:00',
    createBy: 1,
    updateBy: 1,
  },
  {
    id: 6,
    originalName: '会议纪要.txt',
    storageKey: 'f6a7b8c9-d0e1-2345-fabc-456789012345.txt',
    storageName: 'f6a7b8c9-d0e1-2345-fabc-456789012345.txt',
    fileSize: 2048,
    contentType: 'text/plain',
    fileExt: 'txt',
    providerType: 'local',
    bucketName: 'default',
    storageUrl: '/upload/f6a7b8c9-d0e1-2345-fabc-456789012345.txt',
    createTime: '2026-07-17T11:30:00',
    updateTime: '2026-07-17T11:30:00',
    createBy: 1,
    updateBy: 1,
  },
  {
    id: 7,
    originalName: '系统架构图.svg',
    storageKey: 'a7b8c9d0-e1f2-3456-abcd-567890123456.svg',
    storageName: 'a7b8c9d0-e1f2-3456-abcd-567890123456.svg',
    fileSize: 45056,
    contentType: 'image/svg+xml',
    fileExt: 'svg',
    providerType: 'minio',
    bucketName: 'sw-files',
    storageUrl: '/files/a7b8c9d0-e1f2-3456-abcd-567890123456.svg',
    createTime: '2026-07-18T09:45:00',
    updateTime: '2026-07-18T09:45:00',
    createBy: 1,
    updateBy: 1,
  },
  {
    id: 8,
    originalName: 'API接口文档.pdf',
    storageKey: 'b8c9d0e1-f2a3-4567-bcde-678901234567.pdf',
    storageName: 'b8c9d0e1-f2a3-4567-bcde-678901234567.pdf',
    fileSize: 2097152,
    contentType: 'application/pdf',
    fileExt: 'pdf',
    providerType: 'qiniu',
    bucketName: 'sw-docs',
    storageUrl: 'https://cdn.example.com/files/b8c9d0e1-f2a3-4567-bcde-678901234567.pdf',
    createTime: '2026-07-18T15:20:00',
    updateTime: '2026-07-18T15:20:00',
    createBy: 1,
    updateBy: 1,
  },
]
