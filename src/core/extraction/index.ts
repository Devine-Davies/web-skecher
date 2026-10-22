import type { ActiveTabMetadata, SourceDocument, SourceSection } from '@/shared/types';

export function computeContentHash(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= code;
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  return `fnv-${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

const RESTRICTED_PROTOCOLS = [
  'chrome:',
  'chrome-extension:',
  'edge:',
  'about:',
  'view-source:',
  'devtools:',
];

const UNSUPPORTED_FILE_EXTENSIONS = [
  '.pdf',
  '.zip',
  '.tar',
  '.gz',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.mp4',
  '.mp3',
];

export const DEFAULT_MODEL_TOKEN_BUDGET = 3500;

export function evaluateTabUrlSupport(url: string, title = 'Current Tab'): ActiveTabMetadata {
  if (!url) {
    return {
      url: 'about:blank',
      title,
      domain: 'local',
      supported: false,
      unsupportedReason:
        'No active webpage URL detected. You can paste article text manually below.',
    };
  }

  try {
    const parsed = new URL(url);
    if (RESTRICTED_PROTOCOLS.includes(parsed.protocol)) {
      return {
        url,
        title,
        domain: parsed.protocol.replace(':', ''),
        supported: false,
        unsupportedReason: `Browser internal pages (${parsed.protocol}//) cannot be extracted by extensions. Open a standard webpage or paste text manually below.`,
      };
    }

    if (
      parsed.hostname === 'chromewebstore.google.com' ||
      parsed.hostname === 'chrome.google.com'
    ) {
      return {
        url,
        title,
        domain: parsed.hostname,
        supported: false,
        unsupportedReason:
          'Chrome Web Store pages restrict extension scripts. Open another webpage or paste text manually below.',
      };
    }

    const lowerPath = parsed.pathname.toLowerCase();
    const matchedExt = UNSUPPORTED_FILE_EXTENSIONS.find((ext) =>
      lowerPath.endsWith(ext)
    );
    if (matchedExt) {
      return {
        url,
        title,
        domain: parsed.hostname || 'document',
        supported: false,
        unsupportedReason: `Direct ${matchedExt.toUpperCase()} document extraction is outside the MVP HTML extractor. Paste the relevant text below to visualise it.`,
      };
    }

    return {
      url,
      title,
      domain: parsed.hostname || 'webpage',
      supported: true,
    };
  } catch {
    return {
      url,
      title,
      domain: 'unknown',
      supported: false,
      unsupportedReason: 'Invalid or unsupported URL format. Paste text manually below.',
    };
  }
}

export function estimateTokenCount(doc: SourceDocument): number {
  return Math.max(1, Math.ceil(doc.wordCount * 1.35));
}

export function estimateTextTokenCount(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words * 1.35));
}

export interface SemanticSectionGroup {
  groupHeading: string;
  sections: SourceSection[];
  estimatedTokens: number;
}

export function groupDocumentBySemanticSection(
  doc: SourceDocument
): SemanticSectionGroup[] {
  const groups: SemanticSectionGroup[] = [];

  for (const section of doc.sections) {
    const heading = section.heading || doc.title || 'Introduction';
    const sectionTokens = estimateTextTokenCount(section.text);
    const current = groups[groups.length - 1];

    if (!current || current.groupHeading !== heading) {
      groups.push({
        groupHeading: heading,
        sections: [section],
        estimatedTokens: sectionTokens,
      });
    } else {
      current.sections.push(section);
      current.estimatedTokens += sectionTokens;
    }
  }

  return groups;
}

function summariseIndividualSection(
  section: SourceSection,
  targetWordBudget: number
): SourceSection {
  const words = section.text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= targetWordBudget) {
    return section;
  }

  // Extract first and concluding sentences to preserve key concepts & conclusions without silent mid-thought truncation
  const sentences = section.text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (sentences.length <= 2) {
    const summaryWords = words.slice(0, targetWordBudget).join(' ');
    return {
      ...section,
      text: `${summaryWords} [Section summarised]`,
    };
  }

  const selectedSentences: string[] = [sentences[0]];
  let currentWordCount = sentences[0].split(/\s+/).length;

  for (let i = 1; i < sentences.length - 1; i++) {
    const sentenceWords = sentences[i].split(/\s+/).length;
    if (currentWordCount + sentenceWords <= targetWordBudget * 0.75) {
      selectedSentences.push(sentences[i]);
      currentWordCount += sentenceWords;
    }
  }

  const lastSentence = sentences[sentences.length - 1];
  if (!selectedSentences.includes(lastSentence)) {
    selectedSentences.push(lastSentence);
  }

  return {
    ...section,
    text: selectedSentences.join(' '),
  };
}

export function prepareDocumentForContextBudget(
  doc: SourceDocument,
  maxTokenBudget: number = DEFAULT_MODEL_TOKEN_BUDGET
): SourceDocument {
  const currentTokens = estimateTokenCount(doc);
  if (currentTokens <= maxTokenBudget || doc.sections.length === 0) {
    return {
      ...doc,
      hierarchicalSummarisationUsed: false,
      originalWordCount: doc.wordCount,
    };
  }

  const semanticGroups = groupDocumentBySemanticSection(doc);
  const maxTotalWords = Math.max(40, Math.floor(maxTokenBudget / 1.35));
  const perGroupWordBudget = Math.max(
    20,
    Math.floor(maxTotalWords / Math.max(1, semanticGroups.length))
  );

  const summarisedSections: SourceSection[] = [];

  for (const group of semanticGroups) {
    const perSectionBudget = Math.max(
      15,
      Math.floor(perGroupWordBudget / Math.max(1, group.sections.length))
    );
    for (const sec of group.sections) {
      summarisedSections.push(summariseIndividualSection(sec, perSectionBudget));
    }
  }

  const summarisedWordCount = summarisedSections
    .map((s) => s.text)
    .join(' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  return {
    ...doc,
    sections: summarisedSections,
    wordCount: summarisedWordCount,
    originalWordCount: doc.wordCount,
    hierarchicalSummarisationUsed: true,
  };
}

export function buildSourceDocumentFromSections(params: {
  url: string;
  title: string;
  siteName?: string;
  language?: string;
  sections: SourceSection[];
  selectedText?: string;
}): SourceDocument {
  const combinedText = params.sections.map((s) => s.text).join(' ');
  const wordCount = combinedText
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  const hashPayload = `${params.url}|${params.title}|${params.sections
    .map((s) => `${s.id}:${s.text}`)
    .join('||')}`;

  return {
    id: `doc-${computeContentHash(params.url).slice(4, 12)}`,
    url: params.url,
    title: params.title || 'Untitled Webpage',
    siteName: params.siteName,
    language: params.language || 'en',
    extractedAt: new Date().toISOString(),
    contentHash: computeContentHash(hashPayload),
    sections: params.sections,
    wordCount,
    selectedText: params.selectedText,
  };
}

export function createDocumentFromPastedText(
  rawText: string,
  title = 'Pasted Article Content',
  url = 'https://local.pasted-content/article'
): SourceDocument {
  const paragraphs = rawText
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const sections: SourceSection[] = [];
  let currentHeading = title;
  let sectionIdx = 1;

  for (const block of paragraphs) {
    if (block.startsWith('#')) {
      const match = block.match(/^(#{1,6})\s+(.+)$/);
      if (match) {
        currentHeading = match[2].trim();
        continue;
      }
    }
    sections.push({
      id: `s${sectionIdx++}`,
      heading: currentHeading,
      headingLevel: 2,
      text: block.replace(/\s+/g, ' '),
      type: 'paragraph',
    });
  }

  if (sections.length === 0 && rawText.trim()) {
    sections.push({
      id: 's1',
      heading: title,
      headingLevel: 1,
      text: rawText.trim(),
      type: 'paragraph',
    });
  }

  return buildSourceDocumentFromSections({
    url,
    title,
    siteName: 'Manual Input',
    language: 'en',
    sections,
  });
}

