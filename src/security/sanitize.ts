import DOMPurify from 'dompurify'

const ALLOWED_TAGS = ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'span']
const ALLOWED_ATTR = ['href', 'title', 'target', 'rel']

/**
 * 唯一允许产出可信 HTML 的地方。任何用户产生的 HTML 必须经过此函数。
 */
export function sanitizeHtml(input: string): string {
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
  })
}
