/**
 * 流程信息外挂组件接缝：有流程的表单详情渲染「流转记录/流程图/审批详情」的唯一出口。
 *
 * modules 间禁止横向 import（ESLint import/no-restricted-paths 强制）；组件经异步
 * 动态 import 暴露，保持懒加载且不建立静态跨模块依赖（与 instance-relation 同口径）。
 * 组件本体唯一：workflow 模块 components/InstanceFlowPanel（任务详情与表单详情共用）。
 */
import { defineAsyncComponent } from 'vue'

export const InstanceFlowPanel = defineAsyncComponent(
  () => import('@/modules/workflow/components/InstanceFlowPanel.vue'),
)
