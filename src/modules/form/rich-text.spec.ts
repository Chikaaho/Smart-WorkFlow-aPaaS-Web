import { describe, expect, it } from 'vitest'
import {
  RICH_TEXT_PREFIX,
  editorHtmlForValue,
  escapePlainText,
  isRichText,
  renderRichTextHtml,
  richTextVisibleText,
  sanitizeRichTextBody,
  serializeRichText,
} from './rich-text'

describe('rich-text 编码与安全边界', () => {
  it('只把带版本前缀的值识别为富文本，旧纯文本不因尖括号被当 HTML', () => {
    expect(isRichText(`${RICH_TEXT_PREFIX}<p>x</p>`)).toBe(true)
    expect(isRichText('<b>旧文本</b>')).toBe(false)
    expect(richTextVisibleText('<script>alert(1)</script>')).toBe('<script>alert(1)</script>')
  })

  it('可见文本忽略格式标记，块级边界与 br 计为换行', () => {
    expect(richTextVisibleText(`${RICH_TEXT_PREFIX}<p>你好</p><p>世界</p>`)).toBe('你好\n世界')
    expect(richTextVisibleText(`${RICH_TEXT_PREFIX}<p>你好</p>`)).toBe('你好')
    expect(richTextVisibleText(`${RICH_TEXT_PREFIX}第一行<br>第二行`)).toBe('第一行\n第二行')
  })

  it('清洗剥离脚本、事件、样式、链接和外部内容，只保留受控令牌', () => {
    const dirty = `<p onclick="alert(1)">Hi<script>alert(1)</script><span data-rt-font="song" data-rt-size="16" data-rt-color="#6f2dff" style="background:url(x)">A</span><img src=x onerror=alert(1)><a href="javascript:alert(1)">L</a></p>`
    const clean = sanitizeRichTextBody(dirty)
    expect(clean).toContain('Hi')
    expect(clean).toContain('A')
    expect(clean).toContain('L')
    expect(clean).not.toContain('script')
    expect(clean).not.toContain('onclick')
    expect(clean).not.toContain('onerror')
    expect(clean).not.toContain('javascript:')
    expect(clean).not.toContain('style=')
    expect(clean).not.toContain('data-rt-color="#6f2dff"')
    expect(clean).toContain('data-rt-color="#6F2DFF"')
  })

  it('非法字体/字号/颜色令牌被移除，空 span 被展开', () => {
    const clean = sanitizeRichTextBody(
      '<span data-rt-font="comic" data-rt-size="99" data-rt-color="red">X</span><span data-rt-size="14"></span>',
    )
    expect(clean).toBe('X')
  })

  it('仅格式无正文不满足必填，序列化为空字符串', () => {
    expect(serializeRichText('<p><br></p>')).toBe('')
    expect(serializeRichText('<p><span data-rt-size="14"> </span></p>')).toBe('')
  })

  it('序列化保留受控字体/字号/颜色令牌并加版本前缀', () => {
    const value = serializeRichText(
      '<p><span data-rt-font="song" data-rt-size="16" data-rt-color="#6F2DFF">正文</span></p>',
    )
    expect(value.startsWith(RICH_TEXT_PREFIX)).toBe(true)
    expect(value).toContain('data-rt-font="song"')
    expect(value).toContain('data-rt-size="16"')
    expect(value).toContain('data-rt-color="#6F2DFF"')
  })

  it('只读渲染把令牌转固定内联样式，不把令牌或脚本留在页面', () => {
    const html = renderRichTextHtml(
      `${RICH_TEXT_PREFIX}<p><span data-rt-font="song" data-rt-size="16" data-rt-color="#6F2DFF">正文</span><script>alert(1)</script></p>`,
    )
    expect(html).toContain('font-family')
    expect(html).toContain('font-size: 16px')
    expect(html).toContain('color')
    expect(html).not.toContain('data-rt-')
    expect(html).not.toContain('script')
  })

  it('旧纯文本初始化编辑器时转义，换行保留为 br', () => {
    expect(escapePlainText('a\n<b>')).toBe('a<br>&lt;b&gt;')
    expect(editorHtmlForValue('<script>x</script>\n第二行')).toBe(
      '&lt;script&gt;x&lt;/script&gt;<br>第二行',
    )
  })
})
