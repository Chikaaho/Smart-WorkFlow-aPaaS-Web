// ─── 文件上传结果 DTO（对齐后端 StorageUploadResult） ───
export interface StorageUploadResult {
  /** 存储唯一标识（提供商侧的文件 key/objectName） */
  storageKey: string
  /** 存储文件名（系统重命名后，含扩展名） */
  storageName: string
  /** 文件访问地址 */
  storageUrl: string
  /** 文件大小（字节） */
  fileSize: number
}

// ─── 文件存储记录 DTO（对齐后端 StorageFile 实体，不含 tenantId/deleted/version） ───
export interface StorageFile {
  /** 主键 */
  id: number
  /** 文件原始名称（上传时的文件名） */
  originalName: string
  /** 存储唯一标识 */
  storageKey: string
  /** 存储文件名（系统重命名后） */
  storageName: string
  /** 文件大小（字节） */
  fileSize: number
  /** 文件 MIME 类型 */
  contentType: string
  /** 文件扩展名（小写，不含点，如 "pdf"） */
  fileExt: string
  /** 存储提供商类型（local / minio / cos / qiniu） */
  providerType: string
  /** 存储桶名称 */
  bucketName: string
  /** 文件访问地址 */
  storageUrl: string
  /** 创建时间（ISO-8601 字符串） */
  createTime: string
  /** 更新时间 */
  updateTime: string
  /** 创建人 ID */
  createBy: number
  /** 更新人 ID */
  updateBy: number
}
