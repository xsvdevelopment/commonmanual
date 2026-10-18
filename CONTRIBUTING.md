# Contributing to OpenBay

Thank you. Every entry you add saves another mechanic an hour.

## The one rule: cite it

OpenBay publishes facts, and a fact needs a source. Every published entry needs:

- at least one entry in `sources`,
- a footnote (`"src": [1]`) on **every** spec, pointing at the source number it came from, and
- a footnote on **every** procedure step (`{"text": "...", "src": [1]}`). In the app form, end the line with `[1]`.

Using an AI agent? Read [AGENTS.md](AGENTS.md). Same rules, plus: agents transcribe from documents they've opened, never from memory, and the entry's `author` says `(AI-assisted)`.

Good sources, best first:

1. **Factory service manual or TSB.** Give the title, publisher, and page/section or bulletin number.
2. **Public-domain manuals.** US military technical manuals (TM 9-xxxx), government publications.
3. **Published parts-maker specs.** A gasket or fastener maker's published torque sheet, for example.
4. **Your own measurements.** Allowed for `shop-verified` entries, but cite what you measured against.

Can't cite it yet? Save it with `"status": "draft"`. Drafts are hidden from normal view and listed in the citation queue for someone else to verify.

## Clean hands (this keeps the project alive)

- **Write it in your own words.** Facts (torque values, firing orders, the order of the steps) belong to nobody. A manual's exact wording, its diagrams and its photos belong to the publisher.
- **Don't paste** text, diagrams or screenshots from ALLDATA, Mitchell, Identifix, factory sites or printed manuals. Cite them and link to them.
- **No pirated material** of any kind. One DMCA takedown could wipe out everyone's work.
- **Photos** you take yourself are welcome. Add them in the app's editor: they're resized automatically and saved to `data/kb/media/<entry-id>/`. Each needs a caption and a credit, and can be pinned to a step. By adding a photo you release it under CC BY-SA 4.0.

## Status levels

| Status | Means |
|---|---|
| `draft` | Not yet cited. Hidden unless "Show unsourced drafts" is on. |
| `cited` | Every spec footnoted to a source. |
| `shop-verified` | Cited, **and** confirmed on a real vehicle. Requires `verifiedBy`. |
| `factory-sourced` | Cited to the manufacturer's own service documentation. |

## Entry format

One JSON file per entry: `data/kb/<folder>/<id>.json`. The file name must match the `id`.

```json
{
  "id": "chevy-350-water-pump",
  "type": "procedure",
  "title": "Water pump replacement, Chevy 350 (long pump)",
  "summary": "One line on what this is.",
  "status": "cited",
  "applies": [
    { "make": "CHEVROLET", "models": ["C10", "K10"], "years": [1969, 1972], "engine": "350 V8" }
  ],
  "tools": ["..."],
  "parts": ["..."],
  "warnings": ["..."],
  "specs": [
    { "name": "Water pump bolts", "value": "30", "unit": "ft-lb", "src": [1] }
  ],
  "steps": [
    "Plain step.",
    { "text": "A step that needs a citation.", "src": [1] }
  ],
  "body": "Free-text notes. Blank line between paragraphs.",
  "sources": [
    { "title": "1972 Chevrolet Light Duty Truck Service Manual", "publisher": "Chevrolet Motor Division", "citation": "Section 6, p. 6-24", "url": "" }
  ],
  "author": "Your name or shop",
  "tags": ["cooling", "water pump"]
}
```

- `type`: `procedure`, `spec`, `known-issue` or `source`.
- `applies[].make`: as NHTSA writes it (`CHEVROLET`, `MERCEDES-BENZ`), or `"*"` for anything (generic procedures).
- `applies[].models`: optional. Matches any NHTSA model name that contains it, so `"F-150"` matches `F-150 SUPER CREW`.

The **Add knowledge** form in the app builds this for you.

## Pull requests

1. `npm run validate` must pass. CI runs it, plus `npm test`, on every PR.
2. One topic per PR is easiest to review.
3. Maintainers check citations, not just formatting. Expect questions like "which page?"

## Code

React (Vite) frontend in `web/`, Express server in `server/`, data in `data/`. Keep dependencies few; this has to run on a tired shop PC.

Commit messages are plain English describing the change.
