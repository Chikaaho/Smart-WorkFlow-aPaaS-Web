/**
 * Mock 层最小 .xlsx 生成器（无第三方依赖）。
 *
 * <p>用途：让 dev:mock 模式下"下载模板 / 导出"返回结构合法、可被表格软件打开的
 * 真实 xlsx（而不是占位文本 Blob），与真实后端语义逐字段对齐（P32 R7）。</p>
 *
 * <p>实现：手工构造 OPC 包（[Content_Types].xml / _rels / workbook / sheet），
 * zip 采用 STORE（不压缩）+ CRC32。仅覆盖模板/导出所需的只读能力。</p>
 */

/** 每行单元格（字符串），行列即最终表格布局。 */
export type MockSheetRows = string[][]

/** CRC32（zip 标准，IEEE 802.3 多项式 0xEDB88320）。 */
let CRC_TABLE: Int32Array | null = null
function crc32(bytes: Uint8Array): number {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256)
    for (let i = 0; i < 256; i++) {
      let c = i
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      }
      CRC_TABLE[i] = c
    }
  }
  let crc = -1
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xff]
  }
  return (crc ^ -1) >>> 0
}

/** DOS 时间（xlsx 要求，固定值即可） */
const DOS_TIME = 0
const DOS_DATE = (44 << 9) | (1 << 5) | 1 // 2024-01-01

interface ZipEntry {
  name: string
  data: Uint8Array
}

function strBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

function buildZip(entries: ZipEntry[]): Uint8Array {
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBytes = strBytes(entry.name)
    const crc = crc32(entry.data)
    const local = new Uint8Array(30 + nameBytes.length + entry.data.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true) // version needed
    lv.setUint16(6, 0, true) // flags
    lv.setUint16(8, 0, true) // method = STORE
    lv.setUint16(10, DOS_TIME, true)
    lv.setUint16(12, DOS_DATE, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, entry.data.length, true) // compressed
    lv.setUint32(22, entry.data.length, true) // uncompressed
    lv.setUint16(26, nameBytes.length, true)
    lv.setUint16(28, 0, true)
    local.set(nameBytes, 30)
    local.set(entry.data, 30 + nameBytes.length)
    locals.push(local)

    const central = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0, true)
    cv.setUint16(10, 0, true)
    cv.setUint16(12, DOS_TIME, true)
    cv.setUint16(14, DOS_DATE, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, entry.data.length, true)
    cv.setUint32(24, entry.data.length, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint32(42, offset, true)
    central.set(nameBytes, 46)
    centrals.push(central)

    offset += local.length
  }

  const centralSize = centrals.reduce((n, c) => n + c.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)

  const total = offset + centralSize + 22
  const out = new Uint8Array(total)
  let pos = 0
  for (const l of locals) {
    out.set(l, pos)
    pos += l.length
  }
  for (const c of centrals) {
    out.set(c, pos)
    pos += c.length
  }
  out.set(end, pos)
  return out
}

/** XML 文本转义 */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 列号 → Excel 列标（1→A, 27→AA） */
function colLetter(n: number): string {
  let s = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

/**
 * 生成仅含一个工作表的 .xlsx 字节（Uint8Array），所有单元格为 inline string。
 */
export function buildMockXlsx(rows: MockSheetRows): Uint8Array {
  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '</Types>'
  const rootRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>'
  const workbook =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>'
  const workbookRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '</Relationships>'

  const body = rows
    .map((row, ri) => {
      const cells = row
        .map((value, ci) => {
          const ref = `${colLetter(ci + 1)}${ri + 1}`
          return `<c r="${ref}" t="inlineStr"><is><t>${esc(value)}</t></is></c>`
        })
        .join('')
      return `<row r="${ri + 1}">${cells}</row>`
    })
    .join('')
  const sheet =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetData>${body}</sheetData></worksheet>`

  return buildZip([
    { name: '[Content_Types].xml', data: strBytes(contentTypes) },
    { name: '_rels/.rels', data: strBytes(rootRels) },
    { name: 'xl/workbook.xml', data: strBytes(workbook) },
    { name: 'xl/_rels/workbook.xml.rels', data: strBytes(workbookRels) },
    { name: 'xl/worksheets/sheet1.xml', data: strBytes(sheet) },
  ])
}

/** 生成浏览器侧 Blob（对齐真实后端的 .xlsx MIME）。 */
export function buildMockXlsxBlob(rows: MockSheetRows): Blob {
  const bytes = buildMockXlsx(rows)
  return new Blob([bytes.buffer as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

/** XLSX MIME（单一常量，handlers 与本工具共用）。 */
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
