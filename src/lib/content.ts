import sanitizeHtml from "sanitize-html";

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "br",
    "strong",
    "em",
    "u",
    "s",
    "blockquote",
    "code",
    "pre",
    "ul",
    "ol",
    "li",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "img",
    "h1",
    "h2",
    "h3",
    "hr",
    "span",
  ],
  allowedAttributes: {
    "*": ["class", "style"],
    img: ["src", "alt", "title"],
  },
  allowedSchemes: ["http", "https", "data"],
};

export function sanitizeRichHtml(html: string) {
  return sanitizeHtml(html, SANITIZE_OPTIONS);
}

export function htmlToPlainText(html: string) {
  return sanitizeHtml(html, {
    allowedTags: [],
    allowedAttributes: {},
  })
    .replace(/\s+/g, " ")
    .trim();
}

export function excerptHtml(html: string, maxLength = 96) {
  const text = htmlToPlainText(html);

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1).trim()}…`;
}
