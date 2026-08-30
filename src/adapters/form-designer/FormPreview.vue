<script setup lang="ts">
/**
 * FormPreview — form-create 渲染组件（防腐层唯一出口 · 双模式）。
 *
 * 这是 @form-create/element-ui 在本项目的唯一出口：业务层（modules/）通过本组件使用
 * form-create，绝不直引 @form-create/*。接收前端契约 FormSchema，内部经 toFormCreateRule
 * 转为 form-create 原生 rules 后渲染。
 *
 * 双模式（同一条 FormSchema → toFormCreateRule → form-create 转换，不分叉两套）：
 *  - mode='design'：画布所见即所得态。渲染真控件长相，但容器 pointer-events:none，
 *    真控件物理上无法接收任何指针事件（打不了字、拨不动开关、展不开下拉），也绝不吞掉
 *    外层壳的拖拽/点选事件——交互全交画布壳层。
 *  - mode='fill'（默认）：全屏预览填写态，真实可填写。
 *
 * 隔离：form-create + 19 个 EP 组件注册进**本实例自建的子 createApp**（setupFcApp），
 * 主 app 零污染。子 app 挂载点在主 DOM 树内，--sw-* token 与 EP 全局样式天然级联继承。
 * 跨 app 响应式：内部 renderer 读取的 rules/mode 来自本组件 setup（主 app context）的
 * computed —— Vue 响应式系统是全局的（仅组件/指令/provide 按 app 隔离），故 schema 变更
 * 子 app 自动重渲，数据同源不脱钩。
 */
import {
  createApp,
  computed,
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  ref,
  type App,
} from 'vue'
import formCreate from '@form-create/element-ui'
import { setupFcApp } from './setup'
import { toFormCreateRule } from './index'
import type { FormSchema } from '@/contracts/form-schema'

const props = withDefaults(
  defineProps<{
    schema: FormSchema
    /** design=画布只读热区；fill=全屏可填写。默认 fill。 */
    mode?: 'design' | 'fill'
  }>(),
  { mode: 'fill' },
)

const rules = computed(() => toFormCreateRule(props.schema))

// 子 app 挂载点（模板 ref）。不显式标 DOM 全局类型，避免 eslint no-undef 误报；
// 仅流向 childApp.mount(Element | string)，类型安全由该签名兜底。
const host = ref()
let childApp: App | null = null

onMounted(() => {
  // Inner 在子 app context 内渲染（EP + form-create 注册在子 app），但读取父侧响应式
  // rules/isDesign（跨 app 响应式生效）。直接 h(formCreate) 传组件对象，免名称解析。
  const Inner = defineComponent({
    name: 'FcInnerRenderer',
    setup() {
      return () =>
        h(formCreate, {
          rule: rules.value,
          option: { submitBtn: false, resetBtn: false },
        })
    },
  })

  childApp = createApp(Inner)
  setupFcApp(childApp)
  childApp.mount(host.value!)
})

onBeforeUnmount(() => {
  childApp?.unmount()
  childApp = null
})
</script>

<template>
  <div ref="host" class="fc-host" :class="`fc-host--${mode}`" />
</template>

<style scoped>
.fc-host {
  width: 100%;
}

/* 画布设计态：真控件整块禁止指针交互——既打不了字/拨不动，也不吞外层壳的拖拽/点选。 */
.fc-host--design {
  pointer-events: none;
  user-select: none;
}
</style>
