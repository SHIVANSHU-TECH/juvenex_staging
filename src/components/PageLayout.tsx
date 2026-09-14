// This module previously exported `PageHeader` and `PageFooter`. Both were
// removed in the Tier 2/3 code-quality cleanup pass after a repo-wide
// audit confirmed zero callers. The file is intentionally left as an empty
// module so existing build graphs that reference its path do not break.
export {}
