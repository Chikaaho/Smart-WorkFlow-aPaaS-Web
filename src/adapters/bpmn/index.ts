/**
 * bpmn-js 的防腐层。原生 API 只允许在本文件内出现，业务层只认下方导出的我方契约。
 */
import BpmnViewer from 'bpmn-js/lib/Viewer'

/* ------------------------------------------------------------------ */
/*  对外契约：业务层只消费这些类型和函数                                  */
/* ------------------------------------------------------------------ */

export interface BpmnViewerEvents {
  onElementClick?(elementId: string, elementType: string): void
}

export interface BpmnViewerInstance {
  destroy(): void
  fitViewport(): void
  highlight(elementId: string, markerClass?: string): void
  clearHighlight(elementId: string, markerClass?: string): void
}

/* ------------------------------------------------------------------ */
/*  默认值                                                                */
/* ------------------------------------------------------------------ */

const DEFAULT_MARKER_CLASS = 'highlight'

/* ------------------------------------------------------------------ */
/*  主入口                                                              */
/* ------------------------------------------------------------------ */

export async function mountBpmnViewer(
  container: HTMLElement,
  xml: string,
  events?: BpmnViewerEvents,
): Promise<BpmnViewerInstance> {
  const viewer = new BpmnViewer({ container })
  await viewer.importXML(xml)

  const canvas = viewer.get('canvas') as {
    zoom: (scale: number | 'fit-viewport') => void
    addMarker: (elementId: string, markerClass: string) => void
    removeMarker: (elementId: string, markerClass: string) => void
  }
  const eventBus = viewer.get('eventBus') as {
    on: (
      eventName: string,
      callback: (event: { element: { id: string; type: string } }) => void,
    ) => void
  }

  eventBus.on('element.click', (event) => {
    events?.onElementClick?.(event.element.id, event.element.type)
  })

  let destroyed = false

  return {
    destroy() {
      if (destroyed) return
      destroyed = true
      viewer.destroy()
    },
    fitViewport() {
      canvas.zoom('fit-viewport')
    },
    highlight(elementId: string, markerClass = DEFAULT_MARKER_CLASS) {
      canvas.addMarker(elementId, markerClass)
    },
    clearHighlight(elementId: string, markerClass = DEFAULT_MARKER_CLASS) {
      canvas.removeMarker(elementId, markerClass)
    },
  }
}
