import { COMPLEXITY_PRESETS, DIAGRAM_STYLE_OPTIONS } from '@/shared/constants';
import type {
  ComplexityLevel,
  DiagramSpec,
  DiagramType,
  SourceDocument,
} from '@/shared/types';
import { buildPromptWithUntrustedBoundary } from '@/core/security';

const STYLE_PROMPT_INSTRUCTIONS: Record<DiagramType, string> = {
  flowchart: [
    'Structure the diagram as a sequential Flowchart:',
    '- Start with an entry process or concept node.',
    '- Include decision nodes ("kind": "decision") for conditions or branching choices, using "Yes" / "No" or condition edge labels.',
    '- Connect sequential steps with "relationship": "sequence" or "causes".',
    '- End branches with clear "outcome" nodes.',
  ].join('\n'),
  mindmap: [
    'Structure the diagram as a radial Mind Map:',
    '- Make the first node ("n1") the central high-emphasis topic ("kind": "concept", "emphasis": "high").',
    '- Create primary branch nodes radiating from "n1" using "relationship": "explains".',
    '- Attach concrete "example" or "outcome" leaf nodes to the primary branches.',
  ].join('\n'),
  concept_map: [
    'Structure the diagram as a semantic Concept Map:',
    '- Represent domain entities and ideas as "concept", "process", or "example" nodes.',
    '- Connect concepts with explicitly labelled edges that form meaningful propositions (e.g., "depends on", "enables", "reduces").',
    '- Use accurate relationship types ("depends_on", "causes", "explains", "alternative").',
  ].join('\n'),
  infographic: [
    'Structure the diagram as a visual Infographic poster:',
    '- Make the first node ("n1") the Hero Title & Core Thesis banner ("kind": "concept", "emphasis": "high").',
    '- Create numbered key takeaway / pillar cards ("kind": "process" or "concept") and concrete stat/example cards ("kind": "example") with crisp, punchy labels (e.g., "1. Audit JS Dependencies", "Key Metric / Example").',
    '- Make the final node a Bottom Summary / Actionable Takeaway banner ("kind": "outcome", "emphasis": "high").',
    '- Connect the Hero banner to the pillar cards and pillar cards to examples/outcomes with concise labels.',
  ].join('\n'),
};

export const DIAGRAM_CORRECTNESS_RULES = [
  '1. Avoid unsupported factual claims not grounded in the extracted article.',
  '2. Preserve important qualifications and conditions.',
  '3. Distinguish source statements from AI-generated examples (use kind="example" for examples).',
  '4. Avoid misleading relationships; ensure every edge is logically meaningful.',
  '5. Prefer concise, beginner-friendly labels (under 90 characters) and put extra context in "description".',
  '6. Never invent sourceSectionIds: only reference section IDs present in the provided source document.',
  '7. Do not output x/y layout coordinates; layout is computed deterministically by the local engine.',
].join('\n');

export const DIAGRAM_SPEC_JSON_SCHEMA_PROMPT = `Required JSON Schema for DiagramSpec:
{
  "schemaVersion": 1,
  "id": "string (kebab-case identifier)",
  "title": "string (clear diagram title)",
  "type": "flowchart" | "mindmap" | "concept_map" | "infographic",
  "summary": "string (1-2 sentence synthesis of the core takeaway)",
  "sourceDocumentId": "string",
  "nodes": [
    {
      "id": "n1",
      "kind": "concept" | "process" | "decision" | "example" | "outcome",
      "label": "string (concise concept/step label, max 80 chars, synthesized in your own words)",
      "description": "string (1 sentence explanation)",
      "sourceSectionIds": ["s1"],
      "emphasis": "normal" | "high"
    }
  ],
  "edges": [
    {
      "id": "e1",
      "from": "n1",
      "to": "n2",
      "label": "optional short connector label (e.g. Yes, No, enables, requires)",
      "relationship": "sequence" | "causes" | "depends_on" | "explains" | "alternative"
    }
  ],
  "createdAt": "ISO-8601 timestamp"
}`;

export const DIAGRAM_PATCH_JSON_SCHEMA_PROMPT = `Required JSON Schema for DiagramPatch:
{
  "baseDiagramId": "string (must match current diagram id)",
  "baseVersion": number,
  "operations": [
    { "type": "add_node", "node": { "id": "n_new", "kind": "concept" | "process" | "decision" | "example" | "outcome", "label": "string", "description": "string", "sourceSectionIds": ["s1"], "emphasis": "normal" | "high" } },
    { "type": "update_node", "id": "existing_node_id", "changes": { "label": "string", "description": "string", "emphasis": "high" } },
    { "type": "remove_node", "id": "existing_node_id" },
    { "type": "add_edge", "edge": { "id": "e_new", "from": "n1", "to": "n_new", "label": "string", "relationship": "explains" } },
    { "type": "remove_edge", "id": "existing_edge_id" }
  ]
}`;

export function buildDiagramGenerationPrompt(params: {
  sourceDocument: SourceDocument;
  diagramType: DiagramType;
  complexity: ComplexityLevel;
  additionalInstructions?: string;
}): string {
  const styleMeta =
    DIAGRAM_STYLE_OPTIONS.find((s) => s.id === params.diagramType) ??
    DIAGRAM_STYLE_OPTIONS[0];
  const complexityMeta =
    COMPLEXITY_PRESETS.find((c) => c.id === params.complexity) ??
    COMPLEXITY_PRESETS[0];

  const validSectionIds = params.sourceDocument.sections.map((s) => s.id).join(', ');

  const targetNodesDescription =
    params.diagramType === 'infographic'
      ? 'Target Infographic Structure: 6–8 total cards (1 Hero banner + 4–6 key takeaway/example cards + 1 bottom summary banner).'
      : `Target Complexity Preset: ${complexityMeta.label} (${complexityMeta.targetNodes} target nodes) — ${complexityMeta.behaviour}`;

  const systemInstructions = [
    'You are the Visualise Page AI diagram generation engine. Synthesise the article into a clear, insightful conceptual diagram rather than copying raw headings verbatim.',
    `Target Diagram Style: ${styleMeta.label} (${styleMeta.id}) — ${styleMeta.description}`,
    STYLE_PROMPT_INSTRUCTIONS[params.diagramType],
    targetNodesDescription,
    `Source Document ID: ${params.sourceDocument.id}`,
    `Valid sourceSectionIds from this document: [${validSectionIds}]`,
    params.sourceDocument.selectedText
      ? `User highlighted focus excerpt: "${params.sourceDocument.selectedText}"`
      : '',
    'Correctness Requirements:',
    DIAGRAM_CORRECTNESS_RULES,
    DIAGRAM_SPEC_JSON_SCHEMA_PROMPT,
    'Return ONLY a valid JSON object matching the DiagramSpec schema above (no markdown fences or commentary).',
  ]
    .filter(Boolean)
    .join('\n\n');

  return buildPromptWithUntrustedBoundary({
    systemInstructions,
    userInstructions: params.additionalInstructions,
    sourceDocument: params.sourceDocument,
  });
}

export function buildDiagramRefinementPrompt(params: {
  currentDiagram: DiagramSpec;
  currentVersion: number;
  instruction: string;
  selectedNodeIds?: string[];
}): string {
  return [
    '=== TRUSTED APPLICATION INSTRUCTIONS ===',
    'You are the Visualise Page diagram refinement engine.',
    'Produce a targeted DiagramPatch JSON object that updates the existing diagram without unnecessarily deleting unrelated nodes.',
    'Keep existing node and edge IDs stable.',
    `Base Diagram ID: ${params.currentDiagram.id}`,
    `Base Version: ${params.currentVersion}`,
    params.selectedNodeIds && params.selectedNodeIds.length > 0
      ? `Selected target node IDs: ${params.selectedNodeIds.join(', ')}`
      : 'Selected target node IDs: None (apply to relevant part of diagram)',
    DIAGRAM_PATCH_JSON_SCHEMA_PROMPT,
    'Current DiagramSpec JSON:',
    JSON.stringify(params.currentDiagram),
    '=== USER REFINEMENT INSTRUCTION ===',
    params.instruction.trim(),
  ].join('\n\n');
}

export function buildValidationRepairPrompt(
  originalPrompt: string,
  invalidOutput: string,
  validationErrorMessage: string
): string {
  return [
    originalPrompt,
    '=== VALIDATION REPAIR REQUIRED ===',
    'Your previous response did not pass runtime schema validation.',
    `Validation Error: ${validationErrorMessage}`,
    `Previous Invalid Output: ${invalidOutput.slice(0, 1500)}`,
    'Please return a corrected, strictly valid JSON object.',
  ].join('\n\n');
}
