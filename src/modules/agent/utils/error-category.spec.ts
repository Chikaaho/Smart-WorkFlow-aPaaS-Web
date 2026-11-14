import { describe, it, expect } from 'vitest'
import { failureCategoryLabel } from './error-category'

describe('failureCategoryLabel（P70/B4 失败分类中文名）', () => {
  it('已登记分类返回中文名称', () => {
    expect(failureCategoryLabel('HUMAN_TIMEOUT')).toBe('人工等待超时')
    expect(failureCategoryLabel('MODEL_CALL_FAILED')).toBe('模型调用失败')
    expect(failureCategoryLabel('KNOWLEDGE_RETRIEVAL_FAILED')).toBe('知识检索失败')
    expect(failureCategoryLabel('GRAPH_EXECUTION_FAILED')).toBe('图执行失败')
    expect(failureCategoryLabel('CAPACITY_REJECTED')).toBe('容量已满')
    expect(failureCategoryLabel('SERVICE_RESTART')).toBe('服务重启中断')
  })

  it('未登记分类回落为原值（调用方据此关闭悬浮，显示即原值）', () => {
    expect(failureCategoryLabel('SOME_NEW_CATEGORY')).toBe('SOME_NEW_CATEGORY')
  })
})
