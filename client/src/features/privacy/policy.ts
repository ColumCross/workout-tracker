import markdown from "../../../../PRIVACY_POLICY.md";

export type PolicyBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] };

const dateLine = markdown.match(/^## Effective date\s*\r?\n([^\r\n]+)$/m)?.[1]?.trim() ?? null;
const parsedDate = dateLine ? parseEffectiveDate(dateLine) : null;

export const policyMarkdown = markdown;
export const policyDisplayDate = dateLine;
export const policyEffectiveAt = parsedDate;
export const policyConfigurationError = policyDisplayDate === null
  ? "The bundled privacy policy is missing its effective date."
  : policyEffectiveAt === null
    ? "The bundled privacy policy has an invalid effective date."
    : null;
export const policyBlocks = parsePolicy(markdown);

function parseEffectiveDate(value: string) {
  const match = value.match(/^([A-Z][a-z]+) ([0-9]{1,2}), ([0-9]{4})$/);
  if (!match) return null;

  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const month = months.indexOf(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  const timestamp = Date.UTC(year, month, day);
  const date = new Date(timestamp);

  if (month < 0 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) return null;
  return timestamp;
}

function parsePolicy(source: string): PolicyBlock[] {
  const blocks: PolicyBlock[] = [];
  const lines = source.split(/\r?\n/);
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) blocks.push({ type: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  };
  const flushList = () => {
    if (list.length > 0) blocks.push({ type: "list", items: list });
    list = [];
  };

  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    const item = line.match(/^-\s+(.+)$/);

    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2] });
    } else if (item) {
      flushParagraph();
      list.push(item[1]);
    } else if (line.trim() === "") {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraph.push(line.trim());
    }
  }

  flushParagraph();
  flushList();
  return blocks;
}
