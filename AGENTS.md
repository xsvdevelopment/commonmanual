# AGENTS.md: instructions for AI coding agents

You've been pointed at OpenBay, a free, open-source repair database for vehicles from 1960 to now. Someone is donating their usage to move it forward. Thank you. Read this whole file before you change anything.

## The one rule that matters

**OpenBay publishes only facts that come from a source you actually opened in this session.**

- Never write a spec, torque value, capacity, step, cause or code definition from memory or "general knowledge". Not even when you're confident. A wrong torque value can break an engine or hurt someone.
- Your job is to **find, read and transcribe** public sources, not to author knowledge. If you can't open the source, you don't write the fact.
- Every spec gets `"src": [n]` and every procedure step gets `{"text": ..., "src": [n]}`, pointing at a numbered entry in `sources` that names the document, the publisher, the page/table/paragraph, and a URL. `npm run validate` enforces this.
- Write in your own words. Paraphrase steps; don't paste paragraphs. Facts (numbers, sequences) carry over exactly.
- If a source contradicts an existing entry, don't silently overwrite it. Add your source and explain in the PR.

## Sources you may use

| Good | Notes |
|---|---|
| NHTSA manufacturer communications (TSBs) | `node scripts/bulletins.js <year> <MAKE> "<MODEL>" [keyword]` lists them with PDF links. The PDFs on `static.nhtsa.gov` are the manufacturers' own documents, published by NHTSA. Cite them; don't copy them into the repo. |
| US government technical manuals (TM 9-xxxx, Navy NAVEDTRA, Air Force TOs) | Public domain. Search archive.org (`https://archive.org/advancedsearch.php`); full OCR text is at `https://archive.org/download/<id>/<id>_djvu.txt`. Cite TM number, table/paragraph, and the archive.org item URL. |
| NHTSA recalls, complaints, investigations; EPA fueleconomy.gov | Already wired into the app. |
| Published manufacturer or parts-maker spec sheets that are freely available | Cite URL and date accessed. |

**Never use:** ALLDATA, Mitchell, Identifix, Chilton/Haynes text, paid factory portals, or any site that hosts pirated manuals. No screenshots or diagrams from copyrighted manuals. One takedown could erase everyone's work.

## Workflow

1. **Pick a task.** `gh issue list --label agent-task --state open` (or browse Issues on GitHub). Comment "claiming" on it so others don't duplicate it. If you have no GitHub access, choose a draft from the citation queue: `npm run dev`, then open `#/drafts`, or grep `"status": "draft"` in `data/kb/`.
2. **Set up.** `npm install`, then `npm run dev` (http://localhost:4747).
3. **Do the work** in `data/kb/<specs|procedures|known-issues|sources>/<id>.json`. See `CONTRIBUTING.md` for the format and the existing cited entries as examples:
   - `data/kb/specs/dodge-318-truck-1976-77-specs.json` (Army manual tables)
   - `data/kb/procedures/dodge-318-cylinder-head-install.json` (step-by-step, every step footnoted)
   - `data/kb/known-issues/gm-24-ecotec-oil-consumption.json` (factory TSBs)
4. **Set the status honestly.** `factory-sourced` if every fact comes from the manufacturer's own documents (TSBs, factory manuals); `cited` for other published sources. Never `shop-verified`: that means a human confirmed it on a real vehicle.
5. **Disclose.** Set `"author"` to the person running you plus ` (AI-assisted)`, e.g. `"Jane Doe (AI-assisted)"`.
6. **Check.** `npm run validate && npm test` must pass.
7. **Open a PR** that references the issue and lists every document you opened. One topic per PR, kept small enough for a human to check the citations.

## Citing a draft

Drafts (`"status": "draft"`) were written without sources. To promote one:
- Find a source for each fact. Keep what you can cite. **Delete what you can't** and say so in the entry's `body`.
- Narrow `applies` to what the source actually covers (years, models, engines). Don't extend a source's facts to vehicles it doesn't mention.
- The entry ID should describe what the entry now says. Rename the file if it no longer fits.

## Code changes

React + Vite in `web/`, Express in `server/`, data in `data/`. Keep dependencies minimal: this runs on old shop PCs. Don't hand-edit `data/dtc/codes.json`; regenerate it with `scripts/build-dtc.js`. Plain commit messages, no AI attribution trailers.

## Don't

- Don't invent, estimate or "fill in typical values".
- Don't mark your own work as verified.
- Don't add AI-generated "common causes" or advice text.
- Don't bulk-reformat files you didn't otherwise change.
