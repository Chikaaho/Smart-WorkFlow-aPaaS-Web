/**
 * 子表单元格控件解析（独立注册表映射）。
 *
 * TABLE 控件只依赖本模块，不反向依赖 dynamic-field-registry：注册表 → 控件组件 →
 * 注册表会形成运行时环，设计器深链冷启动时在组件初始化前读取绑定会抛
 * `Cannot access 'TableControl' before initialization`。本模块只依赖占位控件
 * （其仅对注册表做类型导入，编译期擦除），因此无环。
 */
import type { Component } from 'vue'
import PlaceholderControl from './dynamic-field-controls/PlaceholderControl.vue'

const subFieldComponents = new Map<string, Component | null>()

/** 由注册表在建表及动态注册时写入；同 type 覆盖式，幂等。 */
export function registerSubFieldComponent(type: string, component: Component | null): void {
  subFieldComponents.set(type, component)
}

/** 子表单元格组件：按 type 查表，缺失 / 显式 null → 降级占位输入框。 */
export function getSubFieldComponent(type: string): Component {
  return subFieldComponents.get(type) ?? PlaceholderControl
}
