import type { ProcessDef } from '@/contracts/bpm'
import type { ProcessDefVersionInfo, ProcessGraphPayload } from '@/modules/workflow/api'

/**
 * Published snapshot seam between the form designer and workflow history APIs.
 *
 * The form module cannot import the workflow module directly. This adapter keeps
 * the existing architectural boundary while exposing only the read-only calls
 * needed by the snapshot viewer.
 */

export type SnapshotProcessGraphPayload = ProcessGraphPayload & {
  advancedConfig?: Record<string, unknown>
  formDefId?: string
  formName?: string
  elements?: Array<{
    id: string
    kind: string
    type?: string
    source?: string
    target?: string
    config?: Record<string, unknown>
    style?: Record<string, unknown>
    x?: number
    y?: number
    waypoints?: Array<{ x: number; y: number }>
  }>
}

export interface SnapshotProcessVersionCandidate {
  def: ProcessDef
  version: ProcessDefVersionInfo
}

export interface SnapshotProcessVersionCandidates {
  items: SnapshotProcessVersionCandidate[]
  failures: string[]
}

/** Load process definitions bound to one form and their immutable version rows. */
export async function loadSnapshotProcessVersionCandidates(
  formKey: string,
): Promise<SnapshotProcessVersionCandidates> {
  const workflow = await import('@/modules/workflow/api')
  const definitions: ProcessDef[] = []
  let pageNum = 1
  while (true) {
    const page = await workflow.pageProcessDefs({ pageNum, pageSize: 200 }, formKey)
    definitions.push(...page.list)
    if (!page.list.length || definitions.length >= page.total) break
    pageNum += 1
  }
  const settled = await Promise.allSettled(
    definitions.map(async (def) => ({
      def,
      versions: await workflow.listDefVersions(def.id),
    })),
  )

  const items: SnapshotProcessVersionCandidate[] = []
  const failures: string[] = []
  settled.forEach((result, index) => {
    if (result.status === 'rejected') {
      failures.push(
        `${definitions[index]?.name ?? definitions[index]?.processKey ?? 'process'}: ${errorText(result.reason)}`,
      )
      return
    }
    for (const version of result.value.versions) {
      items.push({ def: result.value.def, version })
    }
  })
  return { items, failures }
}

/** Read the graph frozen with one published process version. */
export async function loadSnapshotProcessVersionGraph(
  defId: number | string,
  graphVersion: number,
): Promise<SnapshotProcessGraphPayload> {
  const { getDefVersionGraph } = await import('@/modules/workflow/api')
  return getDefVersionGraph(defId, graphVersion) as Promise<SnapshotProcessGraphPayload>
}

function errorText(error: unknown): string {
  if (error && typeof error === 'object' && 'msg' in error) {
    const message = (error as { msg?: unknown }).msg
    if (typeof message === 'string' && message.trim()) return message
  }
  return error instanceof Error ? error.message : String(error)
}
