/**
 * flow-graph 中性图标词汇（24×24 线性图标路径）。
 *
 * NodeCard（画布节点卡片）与业务层节点面板/插入对话框共用同一图标字形，
 * 业务类型 → icon key 的映射由业务层 node-presentation 决定。
 */
export const FLOW_ICON_PATHS: Record<string, string> = {
  play: 'M8 5v14l11-7z',
  stop: 'M6 6h12v12H6z',
  spark: 'M12 3l2.2 5.4L20 10.5l-5.8 2.1L12 18l-2.2-5.4L4 10.5l5.8-2.1z',
  tool: 'M4 20l6-6m0 0a5 5 0 1 0 6-6l-3 3-3-3 3-3a5 5 0 0 0-6 6z',
  branch: 'M12 3v5M12 8l6 4-6 4-6-4 6-4zM12 16v5',
  loop: 'M4 12a8 8 0 0 1 13.7-5.7M20 6v5h-5M20 12a8 8 0 0 1-13.7 5.7M4 18v-5h5',
  fork: 'M6 4v16M6 12h12M18 8v8',
  join: 'M6 8v8M6 12h12M18 4v16',
  book: 'M5 4h14v16H5zM9 4v16',
  user: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 21a8 8 0 0 1 16 0',
  subgraph: 'M4 4h7v7H4zM13 13h7v7h-7zM11 7h4v6',
  dot: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z',
}
