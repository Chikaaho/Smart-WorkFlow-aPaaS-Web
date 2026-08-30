import type { Component } from 'vue'
import {
  Setting,
  Grid,
  Share,
  Bell,
  MagicStick,
  Cpu,
  Connection,
  Document,
  EditPen,
} from '@element-plus/icons-vue'

/**
 * 菜单 icon 字段（字符串）→ Element Plus 图标组件的白名单映射。
 * 仅在 layouts 内使用，不触碰 modules 的第三方库直引边界。
 */
const ICON_MAP: Record<string, Component> = {
  Setting,
  Grid,
  Share,
  Bell,
  MagicStick,
  Cpu,
  Connection,
  Document,
  EditPen,
}

export function menuIcon(name?: string): Component | undefined {
  return name ? ICON_MAP[name] : undefined
}
