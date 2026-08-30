import { describe, it, expect } from 'vitest'
import { FORM_DEF_STATUS_MAP, getFormDefStatusLabel, getFormDefStatusType } from './form-def-status'

describe('modules/form/utils/form-def-status', () => {
  /* ---- FORM_DEF_STATUS_MAP ---- */

  it('maps DRAFT to 草稿 + info', () => {
    const entry = FORM_DEF_STATUS_MAP.DRAFT
    expect(entry.label).toBe('草稿')
    expect(entry.type).toBe('info')
  })

  it('maps PUBLISHED to 已发布 + success', () => {
    const entry = FORM_DEF_STATUS_MAP.PUBLISHED
    expect(entry.label).toBe('已发布')
    expect(entry.type).toBe('success')
  })

  /* ---- getFormDefStatusLabel ---- */

  it('returns correct label for DRAFT', () => {
    expect(getFormDefStatusLabel('DRAFT')).toBe('草稿')
  })

  it('returns correct label for PUBLISHED', () => {
    expect(getFormDefStatusLabel('PUBLISHED')).toBe('已发布')
  })

  /* ---- getFormDefStatusType ---- */

  it('returns info for DRAFT', () => {
    expect(getFormDefStatusType('DRAFT')).toBe('info')
  })

  it('returns success for PUBLISHED', () => {
    expect(getFormDefStatusType('PUBLISHED')).toBe('success')
  })
})
