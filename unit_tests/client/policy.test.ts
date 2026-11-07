type PolicyModule = typeof import("@/features/privacy/policy");

function loadPolicy(markdown: string): PolicyModule {
  jest.resetModules();
  jest.doMock("../../PRIVACY_POLICY.md", () => markdown);
  return require("../../client/src/features/privacy/policy") as PolicyModule;
}

afterEach(() => {
  jest.dontMock("../../PRIVACY_POLICY.md");
  jest.resetModules();
});

test("parses headings, joined paragraphs, lists, bold text, and links", () => {
  const policy = loadPolicy("# Title\n\n## Effective date\nFebruary 29, 2024\n\nA **bold** paragraph\ncontinued with a [link](https://example.invalid).\n\n- One\n- Two");
  expect(policy.policyEffectiveAt).toBe(Date.UTC(2024, 1, 29));
  expect(policy.policyConfigurationError).toBeNull();
  expect(policy.policyBlocks).toEqual([
    { type: "heading", level: 1, text: "Title" },
    { type: "heading", level: 2, text: "Effective date" },
    { type: "paragraph", text: "February 29, 2024" },
    { type: "paragraph", text: "A **bold** paragraph continued with a [link](https://example.invalid)." },
    { type: "list", items: ["One", "Two"] },
  ]);
});

test.each([
  ["# No date", "missing its effective date"],
  ["## Effective date\n2026-11-01", "invalid effective date"],
  ["## Effective date\nFebruary 29, 2025", "invalid effective date"],
  ["## Effective date\nApril 31, 2026", "invalid effective date"],
])("rejects missing or impossible effective date %#", (markdown, expected) => {
  const policy = loadPolicy(markdown);
  expect(policy.policyEffectiveAt).toBeNull();
  expect(policy.policyConfigurationError).toContain(expected);
});
