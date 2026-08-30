/**
 * form-create 子 app 装配（防腐层内部）。
 *
 * 隔离方案（WYSIWYG 刀）：form-create 及其依赖的 Element Plus 组件**不再注册进主 app**，
 * 改为注册进 FormPreview 为每个渲染实例创建的**独立 createApp 子实例**。主 app 因此零污染
 * （main.ts 不再 app.component 那 19 个 EP 组件）。
 *
 * @form-create/element-ui 内部通过 Vue resolveComponent() 按名解析 EP 组件，
 * 而 resolveComponent 只看「渲染所在 app」的全局组件（不走父链）——所以要让 form-create
 * 在子 app 里渲染出真控件，必须把 EP 组件注册到该子 app 上（form-create 仅在
 * window.ElementPlus 存在时才自动装 EP，本项目按需导入、无全局 EP，故须显式注册）。
 *
 * CSS：EP 样式是文档级 side-effect import，在此一次性加载（全局可用，子 app 渲染的
 * 弹层 teleport 到 body 也受用）。vitest 通过 css:false + mock-css 插件兜底，不真加载 .css。
 */
import formCreate from '@form-create/element-ui'

// -- Element Plus CSS（form-create 渲染的组件，unplugin-vue-components 扫不到 node_modules） --
import 'element-plus/es/components/form/style/css'
import 'element-plus/es/components/form-item/style/css'
import 'element-plus/es/components/checkbox/style/css'
import 'element-plus/es/components/checkbox-group/style/css'
import 'element-plus/es/components/checkbox-button/style/css'
import 'element-plus/es/components/radio-button/style/css'
import 'element-plus/es/components/tree/style/css'
import 'element-plus/es/components/upload/style/css'

// -- Element Plus 组件（form-create 内部 resolveComponent 按名解析） --
import {
  ElForm,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElSelect,
  ElOption,
  ElSwitch,
  ElDatePicker,
  ElButton,
  ElRadio,
  ElRadioGroup,
  ElRadioButton,
  ElCheckbox,
  ElCheckboxGroup,
  ElCheckboxButton,
  ElDialog,
  ElIcon,
  ElTree,
  ElUpload,
} from 'element-plus'

import type { App } from 'vue'

const EP_COMPONENTS = [
  ElForm,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElSelect,
  ElOption,
  ElSwitch,
  ElDatePicker,
  ElButton,
  ElRadio,
  ElRadioGroup,
  ElRadioButton,
  ElCheckbox,
  ElCheckboxGroup,
  ElCheckboxButton,
  ElDialog,
  ElIcon,
  ElTree,
  ElUpload,
]

/**
 * 把 form-create 插件 + 所需 EP 组件装配进**给定子 app**。
 *
 * 由 FormPreview 在 onMounted 时对自建的子 app 调用（每个渲染实例一个子 app）。
 * 红线：调用方只会传子 app，绝不传主 app —— 全局污染锁死在防腐层内。
 */
export function setupFcApp(app: App): void {
  // 注册 <form-create> 组件（form-create 默认导出自带 install）。
  app.use(formCreate)

  for (const comp of EP_COMPONENTS) {
    // 先登记进 form-create 内部 registry（兼容性），再 Vue 全局注册供 resolveComponent 解析。
    formCreate.component(comp.name!, comp)
    app.component(comp.name!, comp)
  }
}
