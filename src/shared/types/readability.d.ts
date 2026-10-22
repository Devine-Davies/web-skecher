declare module '@mozilla/readability' {
  export interface ReadabilityArticle {
    title: string;
    content: string;
    textContent: string;
    length: number;
    excerpt: string;
    byline: string | null;
    dir: string | null;
    siteName: string | null;
    lang: string | null;
    publishedTime: string | null;
  }

  export interface ReadabilityOptions {
    debug?: boolean;
    maxElemsToParse?: number;
    nbTopCandidates?: number;
    charThreshold?: number;
    classesToPreserve?: string[];
    keepClasses?: boolean;
    serializer?: (el: Node) => string;
    disableJSONLD?: boolean;
    allowedVideoRegex?: RegExp;
  }

  export class Readability {
    constructor(doc: Document, options?: ReadabilityOptions);
    parse(): ReadabilityArticle | null;
  }
}
