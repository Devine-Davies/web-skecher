import { z } from 'zod';
import type { DiagramPatch, DiagramSpec } from '@/shared/types';

export const DiagramNodeSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['concept', 'process', 'decision', 'example', 'outcome']),
  label: z.string().min(1).max(160),
  description: z.string().optional(),
  sourceSectionIds: z.array(z.string().min(1)),
  emphasis: z.enum(['normal', 'high']).optional(),
});

export const DiagramEdgeSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string().optional(),
  relationship: z
    .enum(['sequence', 'causes', 'depends_on', 'explains', 'alternative'])
    .optional(),
});

export const DiagramSpecSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().min(1),
    title: z.string().min(1),
    type: z.enum(['flowchart', 'mindmap', 'concept_map', 'infographic']),
    summary: z.string().min(1),
    sourceDocumentId: z.string().min(1),
    nodes: z.array(DiagramNodeSchema).min(1),
    edges: z.array(DiagramEdgeSchema),
    createdAt: z.string().min(1),
  })
  .superRefine((spec, ctx) => {
    const nodeIds = new Set<string>();
    for (const node of spec.nodes) {
      if (nodeIds.has(node.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate node ID: "${node.id}"`,
          path: ['nodes'],
        });
      }
      nodeIds.add(node.id);
    }

    for (const edge of spec.edges) {
      if (!nodeIds.has(edge.from)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Edge "${edge.id}" references missing source node "${edge.from}"`,
          path: ['edges'],
        });
      }
      if (!nodeIds.has(edge.to)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Edge "${edge.id}" references missing target node "${edge.to}"`,
          path: ['edges'],
        });
      }
    }
  });

export const DiagramPatchOperationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('add_node'),
    node: DiagramNodeSchema,
  }),
  z.object({
    type: z.literal('update_node'),
    id: z.string().min(1),
    changes: DiagramNodeSchema.partial(),
  }),
  z.object({
    type: z.literal('remove_node'),
    id: z.string().min(1),
  }),
  z.object({
    type: z.literal('add_edge'),
    edge: DiagramEdgeSchema,
  }),
  z.object({
    type: z.literal('remove_edge'),
    id: z.string().min(1),
  }),
]);

export const DiagramPatchSchema = z.object({
  baseDiagramId: z.string().min(1),
  baseVersion: z.number().int().positive(),
  operations: z.array(DiagramPatchOperationSchema).min(1),
});

export function validateDiagramSpec(input: unknown): DiagramSpec {
  return DiagramSpecSchema.parse(input);
}

export function validateDiagramPatch(input: unknown): DiagramPatch {
  return DiagramPatchSchema.parse(input);
}
