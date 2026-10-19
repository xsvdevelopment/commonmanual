# Common Manual

### The repair manual belongs to the people holding the wrench.

Started by **Cj Racki** ([XSV Development](https://github.com/xsvdevelopment)). Built in the open by everyone who adds to it.

> *In a world where the knowledge to fix what we own is slipping through our fingers, locked behind subscriptions, licenses and login screens, we rise to put it back in the hands of the willing.*

Every vehicle on the road was built from documented engineering. Firing orders. Torque values. Fluid capacities. The order the parts come off and the order they go back on. None of it is secret. It has been written down since the first one rolled off the line, and there is more of it on record today than ever before.

And still, the independent mechanic running a two-bay shop pays a toll every month just to read it.

**That ends here.**

> *"I got tired of asking Skippy how this shit works, so I put my restless minions on the task."*

Common Manual is a free, open-source repair database for every car and truck from **1960 to today**. Recalls, owner-reported pattern failures, VIN decoding, factory configurations, trouble codes, and a growing body of procedures, specs and known issues written by the mechanics who actually do the work.

It isn't for sale and it never will be.

**Try it now: [commonmanual.netlify.app](https://commonmanual.netlify.app)**. Type a car and what it's doing, e.g. *"2013 Ford F-150 rattles on cold start"*.

---

## The Code

**1. Facts only. Every one footnoted.**
Every spec in Common Manual points to a numbered source: a factory manual with a page number, a TSB, a public-domain military manual, a government database. Anything without a citation is labeled **Draft**, hidden by default, and sent to the citation queue until somebody proves it.

**2. No machines guessing.**
> *"We're always going to need to get around. Why fuck with models that will hallucinate the correct answer when we have it all documented here?"*

Common Manual contains no AI-generated answers. It shows what has been documented and nothing else. If we don't know, it says so.

**3. Open forever.**
The code is MIT. The data is CC BY-SA 4.0. Anyone can use it, copy it or build on it, and nobody can lock it back up.

**4. Clean hands.**
Facts can't be owned, but someone else's exact words and diagrams can. We write procedures in our own words, cite where the facts came from, and link to the source. We do not paste in copyrighted manuals. That discipline is what keeps this project from being taken down, and it protects everyone who contributes.

---

## We need you

**This only works if you add to it.** Every shop has a notebook, a whiteboard, or a head full of the things the manuals got wrong or never said. Put them here, and the next mechanic at 9 p.m. with a car on the lift doesn't have to figure it out alone.

- **Wrench for a living?** Add the job you did today. Steps, specs, the gotcha that cost you an hour.
- **Own a factory manual?** Work through the [citation queue](#how-to-contribute). Check a draft against your book, add the page number, and it goes live.
- **Found a public-domain manual?** Military TMs, pre-1964 publications that were never renewed, government documents. Add it as a source.
- **Write code?** Issues are open. Offline sync, wiring diagram support, more data sources, a phone layout for under the hood.
- **Got AI usage to spare?** Clone the repo, open it in Claude Code, Codex, Cursor, Copilot, Gemini or whatever you run, and say *"work on Common Manual."* [AGENTS.md](AGENTS.md) tells it exactly what to do: pick a task from the [agent-task queue](https://github.com/xsvdevelopment/commonmanual/issues?q=is%3Aopen+label%3Aagent-task), dig the facts out of public-domain manuals and factory bulletins, footnote every one, and open a pull request. Agents transcribe from documents they've opened. They never write from memory, and a human reviews every citation before it merges.
- **None of the above?** Star the repo and send it to a mechanic.

**Put this in the consumer's hands. Help us build it.**

---

## Describe the problem, get the records

Type the vehicle and the symptom in plain words: *"2010 Chevy Equinox burning oil"*, *"2005 F-250 no start"*, *"rattles on cold start, P0016"*. Common Manual searches every factory bulletin, recall, defect investigation, owner complaint and cited repair entry on file for that vehicle, using shop vocabulary (rattle, tick, tap and knock all match), and ranks what it finds. It's a search of documented records: it shows you the factory TSB and the PDF, not a guess.

## What's inside

| Source | What it gives you | Years |
|---|---|---|
| NHTSA product catalog + Common Manual classic catalog | Year / make / model picker | 1960+ |
| NHTSA vPIC | VIN decoding: engine, trans, drive, plant | 1981+ (17-digit VINs) |
| NHTSA recalls | Every recall campaign, remedy and "park it" warning | All years on file |
| NHTSA owner complaints | Thousands of owner reports grouped by component, so pattern failures stand out | All years on file |
| **Factory technical service bulletins** | Every TSB and service message filed with NHTSA, searchable, with a link to the manufacturer's own PDF | All years on file |
| NHTSA defect investigations | What the government investigated, and which recalls came out of it | All years on file |
| EPA fueleconomy.gov | Engine, transmission and drivetrain configurations | 1984+ |
| **Trouble codes** | 12,000+ codes: every generic OBD-II code plus manufacturer-specific codes for 30+ makes, each definition footnoted with how many public datasets agree | 1996+ |
| Factory service sites | Direct links to every automaker's own repair-info site; most sell short-term passes | Current |
| Public-domain military manuals | Factory-level specs and procedures for the military versions of civilian trucks | 1960s-1980s |
| **The Common Manual knowledge base** | Procedures, specs, known issues and photos from mechanics, every fact footnoted | Everything we can cite |

Government data is cached on disk, so anything you've looked up keeps working when the shop's internet doesn't.

---

## Run it

You need [Node.js](https://nodejs.org) 20 or newer.

**Windows:** double-click `CommonManual.bat`. On first run it installs and builds, then opens Common Manual in your browser.

**Anywhere:**
```bash
npm install
npm run build
npm start          # http://localhost:4747
```

Developing: `npm run dev` (live reload). Tests: `npm test`. Check data files: `npm run validate`.

---

## How to contribute

The knowledge base is plain JSON files, one per entry, in [`data/kb/`](data/kb). See [CONTRIBUTING.md](CONTRIBUTING.md) for the format and the rules.

1. Use **Add knowledge** in the app. It writes a correctly formatted file into `data/kb/shop/`.
2. Fork this repo, commit that file, and open a pull request.
3. CI checks that every spec has a footnote. A maintainer reviews it and it ships to every shop running Common Manual.

The **Citation queue** page lists every draft waiting for a source. That's the quickest way to help.

---

## License

Code: [MIT](LICENSE). Data in `data/`: [CC BY-SA 4.0](data/LICENSE). Vehicle data from NHTSA and EPA is US government work in the public domain.

Common Manual is not affiliated with any automaker or any commercial repair-information provider. Repair work is dangerous. Verify specs against the cited source and use proper safety equipment.
