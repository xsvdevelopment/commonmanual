# Reviewing pull requests

OpenBay's promise is that every fact is backed by a source. The automated checks help, but they can't promise that on their own. You can.

## What the machines check

| Check | Catches | Misses |
|---|---|---|
| `npm run validate` (CI) | Missing footnotes, broken format, footnotes pointing at nothing | Whether the source says it at all |
| Citation spot-check (CI, run summary) | Numbers that don't appear anywhere in the cited document | A real number cited for the wrong thing, scanned PDFs it can't read (`?`), OCR-mangled digits |

**A green build doesn't mean a PR is true.** An AI agent, or a person, can cite a real manual with a believable page and a wrong number.

## What you check

1. **Open the run summary** of the "Citation spot-check" job. Every `✗` must be explained in the PR or fixed. Every `?` means a human has to look.
2. **Spot-check at least three facts by hand** in every PR: open the cited document, go to the cited page/table/paragraph, and confirm the value. Always include every torque value and anything safety-related (brakes, steering, airbags, fuel).
3. **AI-assisted PRs** (author says `(AI-assisted)`): if one spot-check fails, reject the whole PR. Don't fix it up; a fabricated value means the rest can't be trusted either.
4. **Scope:** `applies` must not reach past what the source covers. A 1976 truck manual doesn't make a fact true for a 1995 car.
5. **Clean hands:** wording is paraphrased; no pasted paragraphs, screenshots or diagrams from copyrighted manuals.
6. **Status:** `factory-sourced` only when every source is the manufacturer's own document. Nobody marks their own work `shop-verified`.

## Merging

Squash-merge with a plain message. The preview site redeploys from `main` automatically.
