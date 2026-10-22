import { Readability } from '@mozilla/readability';
import type { SourceDocument, SourceSection } from '@/shared/types';

const IGNORED_SELECTORS = [
  'nav',
  'header',
  'footer',
  'aside',
  'script',
  'style',
  'noscript',
  'iframe',
  'form',
  'input',
  'textarea',
  'select',
  'button',
  'dialog',
  '[type="password"]',
  '[hidden]',
  '[aria-hidden="true"]',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[role="complementary"]',
  '[role="search"]',
  '.ad',
  '.ads',
  '.advertisement',
  '.sponsored',
  '.related-posts',
  '.recommendations',
  '.newsletter',
  '.cookie-banner',
  '.sidebar',
  '#comments',
  '.comments',
].join(',');

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

function slugifyAnchor(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 48);
}

function formatListElement(el: Element): string {
  const isOrdered = el.tagName.toLowerCase() === 'ol';
  const items = Array.from(el.querySelectorAll(':scope > li'))
    .map((li, idx) => {
      const text = (li.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text) return '';
      return isOrdered ? `${idx + 1}. ${text}` : `- ${text}`;
    })
    .filter(Boolean);
  return items.join('\n');
}

function formatTableElement(el: Element): string {
  const rows = Array.from(el.querySelectorAll('tr'))
    .map((tr) => {
      const cells = Array.from(tr.querySelectorAll('th, td')).map((cell) =>
        (cell.textContent || '').replace(/\s+/g, ' ').trim()
      );
      return cells.filter(Boolean).length > 0 ? `| ${cells.join(' | ')} |` : '';
    })
    .filter(Boolean);
  return rows.join('\n');
}

function extractSectionsFromRoot(
  root: Element,
  fallbackTitle: string
): SourceSection[] {
  const sections: SourceSection[] = [];
  let currentHeading: string | undefined;
  let currentHeadingLevel: number | undefined;
  let currentAnchor: string | undefined;
  let sectionIndex = 1;

  const blocks = root.querySelectorAll(
    'h1, h2, h3, h4, h5, h6, p, pre, ul, ol, table'
  );

  blocks.forEach((el) => {
    if (el.closest('pre, table') && !['pre', 'table'].includes(el.tagName.toLowerCase())) {
      return;
    }
    if (el.closest('ul, ol') && !['ul', 'ol'].includes(el.tagName.toLowerCase())) {
      return;
    }

    const tag = el.tagName.toLowerCase();

    if (/^h[1-6]$/.test(tag)) {
      const headingText = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!headingText) return;
      currentHeading = headingText;
      currentHeadingLevel = Number(tag.slice(1)) || 2;
      currentAnchor = el.id || slugifyAnchor(headingText) || undefined;
      return;
    }

    let text = '';
    let type: SourceSection['type'] = 'paragraph';

    if (tag === 'pre') {
      type = 'code';
      text = (el.textContent || '').replace(/\r\n/g, '\n').trim();
    } else if (tag === 'ul' || tag === 'ol') {
      type = 'list';
      text = formatListElement(el);
    } else if (tag === 'table') {
      type = 'table';
      text = formatTableElement(el);
    } else {
      type = 'paragraph';
      text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    }

    const minLength = type === 'code' || type === 'table' || type === 'list' ? 4 : 12;
    if (!text || text.length < minLength) return;

    sections.push({
      id: `s${sectionIndex++}`,
      heading: currentHeading,
      headingLevel: currentHeadingLevel,
      text,
      type,
      anchor: el.id || currentAnchor,
    });
  });

  if (sections.length === 0) {
    const fallbackText = (root.textContent || '').replace(/\s+/g, ' ').trim();
    if (fallbackText) {
      sections.push({
        id: 's1',
        heading: fallbackTitle || 'Article Content',
        headingLevel: 1,
        text: fallbackText,
        type: 'paragraph',
      });
    }
  }

  return sections;
}

export function extractDocumentFromDom(doc: Document, url: string): SourceDocument {
  const sanitisedClone = doc.cloneNode(true) as Document;

  sanitisedClone.querySelectorAll(IGNORED_SELECTORS).forEach((el) => el.remove());
  sanitisedClone.querySelectorAll('[style]').forEach((el) => {
    const styleAttr = (el.getAttribute('style') || '').toLowerCase().replace(/\s+/g, '');
    if (styleAttr.includes('display:none') || styleAttr.includes('visibility:hidden')) {
      el.remove();
    }
  });

  let resolvedTitle = doc.title || 'Untitled Webpage';
  let resolvedSiteName =
    doc.querySelector('meta[property="og:site_name"]')?.getAttribute('content') ||
    undefined;

  const semanticContainer =
    sanitisedClone.querySelector('article') ||
    sanitisedClone.querySelector('main') ||
    sanitisedClone.querySelector('[role="main"]') ||
    sanitisedClone.querySelector('.markdown-body');

  let sections: SourceSection[] = [];

  if (semanticContainer) {
    sections = extractSectionsFromRoot(semanticContainer, resolvedTitle);
  }

  try {
    const readabilityClone = sanitisedClone.cloneNode(true) as Document;
    const reader = new Readability(readabilityClone);
    const parsed = reader.parse();

    if (parsed) {
      if (parsed.title && (!doc.title || doc.title === 'Untitled Webpage')) {
        resolvedTitle = parsed.title;
      }
      if (parsed.siteName && !resolvedSiteName) {
        resolvedSiteName = parsed.siteName;
      }
      if (sections.length === 0 && parsed.content) {
        const tempDoc = doc.implementation.createHTMLDocument(resolvedTitle);
        tempDoc.body.innerHTML = parsed.content;
        sections = extractSectionsFromRoot(tempDoc.body, resolvedTitle);
      }
    }
  } catch {
    // Fall back to direct DOM extraction if Readability throws
  }

  if (sections.length === 0 && sanitisedClone.body) {
    sections = extractSectionsFromRoot(sanitisedClone.body, resolvedTitle);
  }

  const combinedText = sections.map((s) => s.text).join(' ');
  const wordCount = combinedText
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  const selection =
    typeof window !== 'undefined' && window.getSelection
      ? window.getSelection()?.toString().trim() || undefined
      : undefined;

  const hashPayload = `${url}|${resolvedTitle}|${sections
    .map((s) => `${s.id}:${s.type}:${s.heading ?? ''}:${s.text}`)
    .join('||')}`;

  return {
    id: `doc-${computeContentHash(url).slice(4, 12)}`,
    url,
    title: resolvedTitle,
    siteName: resolvedSiteName,
    language: doc.documentElement.lang || 'en',
    extractedAt: new Date().toISOString(),
    contentHash: computeContentHash(hashPayload),
    sections,
    wordCount,
    selectedText: selection,
  };
}

