// Scans view files for literals that belong in design tokens: hex/rgb/hsl/oklch colours,
// Tailwind palette classes and arbitrary px/rem values. Same pattern as the /10x-ui audit grep.
// Run: npm run check:values (default shell files) or node scripts/check-hardcoded-values.mjs <file>...
import { existsSync, readFileSync } from "node:fs";

const DEFAULT_FILES = [
  "src/layouts/AppLayout.astro",
  "src/layouts/Layout.astro",
  "src/components/Banner.astro",
  "src/components/NavLink.astro",
  "src/pages/today.astro",
  "src/components/TextLink.astro",
  "src/components/Chip.astro",
  "src/components/TaskRow.astro",
  "src/components/ui/inline-error.tsx",
  "src/components/today/TodayTaskActions.tsx",
  "src/components/today/CloseMilestoneButton.tsx",
  "src/components/today/RestoreDeferredButton.tsx",
  "src/components/today/AddTaskFromTodayDialog.tsx",
];

const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black";
const LITERAL = new RegExp(
  // Hex skips anchors (href="#add") and entities (&#123;); hsl(var(--x)) is allowed; palette classes may carry a side/offset segment.
  String.raw`(?<![\w&])(?<!href=["'])#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\((?!var\()|oklch\(|-\[[^\]]*\d(px|rem|em|%|vh|vw)[^\]]*\]|\b(bg|text|border|ring|outline|from|via|to|fill|stroke|shadow|divide|decoration|accent|caret|placeholder)(-(t|b|l|r|x|y|s|e|offset))?-(${PALETTE})\b`,
);

const args = process.argv.slice(2);
const explicit = args.length > 0;
// Every listed file must exist (a renamed or moved view must not silently drop out of the scan).
const files = explicit ? args : DEFAULT_FILES;

let hits = 0;
for (const file of files) {
  if (!existsSync(file)) {
    console.error(`${file}: file not found`);
    hits++;
    continue;
  }
  readFileSync(file, "utf8")
    .split(/\r?\n/)
    .forEach((line, index) => {
      if (LITERAL.test(line)) {
        console.error(`${file}:${index + 1}: ${line.trim()}`);
        hits++;
      }
    });
}

process.exit(hits > 0 ? 1 : 0);
