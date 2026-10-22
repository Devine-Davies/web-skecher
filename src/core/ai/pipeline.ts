import { COMPLEXITY_PRESETS } from '@/shared/constants';
import type {
  ComplexityLevel,
  DiagramEdge,
  DiagramNode,
  DiagramNodeKind,
  DiagramSpec,
  DiagramType,
  SourceDocument,
  SourceSection,
} from '@/shared/types';
import { validateDiagramSpec } from '@/core/diagrams/schema';

export interface ContentAnalysisResult {
  mainTopic: string;
  summary: string;
  analyzedUnits: Array<{
    sectionId: string;
    label: string;
    description: string;
    inferredKind: DiagramNodeKind;
  }>;
}

function inferSectionNodeKind(
  section: SourceSection,
  index: number,
  total: number
): DiagramNodeKind {
  const combined = `${section.heading ?? ''} ${section.text}`.toLowerCase();

  if (
    section.type === 'code' ||
    section.type === 'table' ||
    combined.includes('for example') ||
    combined.includes('e.g.') ||
    combined.includes('example:')
  ) {
    return 'example';
  }

  if (
    combined.includes('?') ||
    combined.includes('whether ') ||
    combined.includes('decide ') ||
    combined.includes('if ') ||
    combined.includes('check ')
  ) {
    return 'decision';
  }

  if (
    index === total - 1 ||
    combined.includes('conclusion') ||
    combined.includes('result') ||
    combined.includes('outcome') ||
    combined.includes('therefore')
  ) {
    return 'outcome';
  }

  if (
    index === 0 ||
    combined.includes('overview') ||
    combined.includes('introduction') ||
    combined.includes('what is')
  ) {
    return 'concept';
  }

  return 'process';
}

function conciseLabelFromSection(section: SourceSection): string {
  if (section.heading && section.heading.trim().length > 0) {
    return section.heading.trim().slice(0, 88);
  }
  const firstSentence = section.text
    .split(/(?<=[.!?])\s+/)[0]
    ?.replace(/\s+/g, ' ')
    .trim();
  const raw = firstSentence || section.text.trim();
  return raw.length > 88 ? `${raw.slice(0, 85).trim()}…` : raw;
}

/**
 * Stage A — Analyse content:
 * Identifies main topic, important concepts, decisions, examples, sequences, and outcomes.
 */
export function analyseSourceContent(doc: SourceDocument): ContentAnalysisResult {
  const mainTopic = doc.title || 'Webpage Concept Overview';
  const analyzedUnits: ContentAnalysisResult['analyzedUnits'] = [];

  doc.sections.forEach((sec, idx) => {
    const inferredKind = inferSectionNodeKind(sec, idx, doc.sections.length);
    analyzedUnits.push({
      sectionId: sec.id,
      label: conciseLabelFromSection(sec),
      description: sec.text.slice(0, 180),
      inferredKind,
    });

    // Extract extra sub-clauses for detailed preset coverage when a section has multiple sentences
    const sentences = sec.text
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 25);

    if (sentences.length > 1) {
      sentences.slice(1, 3).forEach((sentence) => {
        const lower = sentence.toLowerCase();
        const subKind: DiagramNodeKind =
          lower.includes('example') || lower.includes('replace')
            ? 'example'
            : lower.includes('?') || lower.includes('if ')
              ? 'decision'
              : 'concept';

        analyzedUnits.push({
          sectionId: sec.id,
          label: sentence.length > 84 ? `${sentence.slice(0, 81).trim()}…` : sentence,
          description: sentence.slice(0, 180),
          inferredKind: subKind,
        });
      });
    }
  });

  if (doc.selectedText && doc.selectedText.trim().length > 0) {
    const firstSecId = doc.sections[0]?.id ?? 's1';
    analyzedUnits.unshift({
      sectionId: firstSecId,
      label:
        doc.selectedText.length > 84
          ? `${doc.selectedText.slice(0, 81).trim()}…`
          : doc.selectedText.trim(),
      description: `Selected excerpt: ${doc.selectedText.slice(0, 160)}`,
      inferredKind: 'concept',
    });
  }

  return {
    mainTopic,
    summary: `Structured analysis of "${mainTopic}" across ${doc.sections.length} source sections.`,
    analyzedUnits,
  };
}

/**
 * Stage B — Produce diagram plan from Stage A analysis:
 * Builds nodes and edges tailored to the requested DiagramType and ComplexityLevel.
 */
export function buildDiagramPlanFromAnalysis(params: {
  analysis: ContentAnalysisResult;
  sourceDocument: SourceDocument;
  diagramType: DiagramType;
  complexity: ComplexityLevel;
  additionalInstructions?: string;
}): DiagramSpec {
  const preset =
    COMPLEXITY_PRESETS.find((p) => p.id === params.complexity) ??
    COMPLEXITY_PRESETS[0];

  const targetCount =
    params.diagramType === 'infographic'
      ? Math.min(8, Math.max(6, params.analysis.analyzedUnits.length))
      : Math.min(
          preset.maxNodes,
          Math.max(preset.minNodes, params.analysis.analyzedUnits.length)
        );

  const selectedUnits = params.analysis.analyzedUnits.slice(0, targetCount);
  const fallbackSectionId = params.sourceDocument.sections[0]?.id ?? 's1';

  const nodes: DiagramNode[] = selectedUnits.map((unit, idx) => {
    if (params.diagramType === 'infographic') {
      const isHero = idx === 0;
      const isFinalTakeaway =
        selectedUnits.length >= 3 && idx === selectedUnits.length - 1;
      return {
        id: `n${idx + 1}`,
        kind: isHero
          ? 'concept'
          : isFinalTakeaway
            ? 'outcome'
            : unit.inferredKind === 'example'
              ? 'example'
              : 'process',
        label: isHero
          ? `Overview: ${unit.label}`
          : isFinalTakeaway
            ? `Key Takeaway: ${unit.label}`
            : `${idx}. ${unit.label}`,
        description: unit.description,
        sourceSectionIds: [unit.sectionId || fallbackSectionId],
        emphasis: isHero || isFinalTakeaway ? 'high' : 'normal',
      };
    }

    return {
      id: `n${idx + 1}`,
      kind:
        params.diagramType === 'mindmap' && idx === 0
          ? 'concept'
          : unit.inferredKind,
      label: unit.label,
      description: unit.description,
      sourceSectionIds: [unit.sectionId || fallbackSectionId],
      emphasis:
        idx === 0 || unit.inferredKind === 'decision' ? 'high' : 'normal',
    };
  });

  const edges: DiagramEdge[] = [];

  if (params.diagramType === 'infographic') {
    const hero = nodes[0];
    const hasBottomBanner = nodes.length >= 4;
    const middleNodes = hasBottomBanner
      ? nodes.slice(1, -1)
      : nodes.slice(1);
    const footerNode = hasBottomBanner ? nodes[nodes.length - 1] : null;

    if (hero) {
      middleNodes.forEach((card, idx) => {
        edges.push({
          id: `e${edges.length + 1}`,
          from: hero.id,
          to: card.id,
          label: `Pillar ${idx + 1}`,
          relationship: 'explains',
        });
        if (footerNode) {
          edges.push({
            id: `e${edges.length + 1}`,
            from: card.id,
            to: footerNode.id,
            relationship: 'causes',
          });
        }
      });
    }
  } else if (params.diagramType === 'mindmap') {
    const root = nodes[0];
    if (root) {
      nodes.slice(1).forEach((branch, idx) => {
        edges.push({
          id: `e${idx + 1}`,
          from: root.id,
          to: branch.id,
          label: branch.kind === 'example' ? 'Example' : 'Branch',
          relationship: 'explains',
        });
      });
    }
  } else if (params.diagramType === 'concept_map') {
    for (let i = 0; i < nodes.length - 1; i++) {
      const current = nodes[i];
      const next = nodes[i + 1];
      edges.push({
        id: `e${edges.length + 1}`,
        from: current.id,
        to: next.id,
        label:
          next.kind === 'example'
            ? 'illustrated by'
            : next.kind === 'outcome'
              ? 'leads to'
              : 'relates to',
        relationship:
          next.kind === 'example'
            ? 'explains'
            : next.kind === 'outcome'
              ? 'causes'
              : 'depends_on',
      });
    }
    if (nodes.length >= 4) {
      edges.push({
        id: `e${edges.length + 1}`,
        from: nodes[0].id,
        to: nodes[nodes.length - 1].id,
        label: 'governs',
        relationship: 'causes',
      });
    }
  } else {
    // Flowchart
    for (let i = 0; i < nodes.length - 1; i++) {
      const current = nodes[i];
      const next = nodes[i + 1];
      edges.push({
        id: `e${edges.length + 1}`,
        from: current.id,
        to: next.id,
        label: current.kind === 'decision' ? 'Yes' : undefined,
        relationship: 'sequence',
      });

      if (current.kind === 'decision' && i + 2 < nodes.length) {
        edges.push({
          id: `e${edges.length + 1}`,
          from: current.id,
          to: nodes[i + 2].id,
          label: 'Alternative',
          relationship: 'alternative',
        });
      }
    }
  }

  return {
    schemaVersion: 1,
    id: `diagram-${Date.now()}`,
    title: params.sourceDocument.title || params.analysis.mainTopic,
    type: params.diagramType,
    summary:
      params.additionalInstructions?.trim() || params.analysis.summary,
    sourceDocumentId: params.sourceDocument.id,
    nodes,
    edges,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Stage C — Validate & Sanitise:
 * - Strips any untrusted AI-generated coordinates (x, y, width, height)
 * - Ensures every node references only valid section IDs from SourceDocument
 * - Enforces concise labels and runs runtime Zod validation
 */
export function validateAndSanitiseDiagramSpec(
  rawInput: unknown,
  sourceDocument: SourceDocument
): DiagramSpec {
  if (!rawInput || typeof rawInput !== 'object') {
    throw new Error('AI response is not a JSON object.');
  }

  const validSectionIds = new Set(sourceDocument.sections.map((s) => s.id));
  const fallbackSectionId = sourceDocument.sections[0]?.id ?? 's1';

  const record = rawInput as Record<string, unknown>;
  const rawNodes = Array.isArray(record.nodes) ? record.nodes : [];

  const sanitisedNodes = rawNodes.map((n) => {
    if (!n || typeof n !== 'object') return n;
    const nodeObj = { ...(n as Record<string, unknown>) };
    // Never trust AI-generated layout coordinates
    delete nodeObj.x;
    delete nodeObj.y;
    delete nodeObj.width;
    delete nodeObj.height;

    if (typeof nodeObj.label === 'string' && nodeObj.label.length > 150) {
      nodeObj.label = `${nodeObj.label.slice(0, 147).trim()}…`;
    }

    const rawSectionIds = Array.isArray(nodeObj.sourceSectionIds)
      ? (nodeObj.sourceSectionIds as unknown[]).filter(
          (id): id is string => typeof id === 'string' && validSectionIds.has(id)
        )
      : [];

    nodeObj.sourceSectionIds =
      rawSectionIds.length > 0 ? rawSectionIds : [fallbackSectionId];

    return nodeObj;
  });

  const candidate = {
    ...record,
    schemaVersion: 1,
    sourceDocumentId:
      typeof record.sourceDocumentId === 'string' && record.sourceDocumentId
        ? record.sourceDocumentId
        : sourceDocument.id,
    createdAt:
      typeof record.createdAt === 'string' && record.createdAt
        ? record.createdAt
        : new Date().toISOString(),
    nodes: sanitisedNodes,
  };

  return validateDiagramSpec(candidate);
}
