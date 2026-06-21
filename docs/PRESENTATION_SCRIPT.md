# ASTRA — Hackathon Presentation / Video Script

**Project:** ASTRA — Autonomous Strategic Traffic Response Assistant
**Team:** *[your team name]* — Puneet & Monalisha
**Track:** Flipkart Grid — Event-Driven Congestion (Planned & Unplanned)
**Target runtime:** ~7 minutes (timings are guides; sections marked ⏬ can be trimmed first)

> Format — each beat: **[TIME]** · **[ON SCREEN]** what the viewer sees · **[VOICE]** what you say. Speak to the numbers; let the live demo carry the middle.

---

## 0 · Cold Open — the hook  ·  0:00–0:20

**[ON SCREEN]** A real Bengaluru junction snarled in traffic; then a single red dot blooms outward across a dark city map.

**[VOICE]**
> "Right now, somewhere in Bengaluru, a truck has broken down. A traffic officer is looking at it and making three guesses: how bad is this, how long will it last, and how many people do I send. They're guessing from memory. **We built the thing that replaces the guess.**"

---

## 1 · Project Introduction  ·  0:20–0:45

**[ON SCREEN]** Title card: **ASTRA** · "Autonomous Strategic Traffic Response Assistant" · team names.

**[VOICE]**
> "We're *[team name]* — Puneet and Monalisha — and this is **ASTRA**.
> One line: **ASTRA turns a one-line traffic event into a complete, second-by-second response plan — severity, spread, diversions, and exactly how many officers to send and where — and it learns from every incident it handles.**"

---

## 2 · Problem Statement  ·  0:45–1:30

**[ON SCREEN]** Three stark cards animate in: *"No quantification"* · *"Experience-driven resourcing"* · *"No learning"*.

**[VOICE]**
> "Here's the problem. Bengaluru traffic police handle **thousands of planned and unplanned events every year** — breakdowns, accidents, processions, waterlogging, VIP movements. And the official problem statement says it plainly: **event impact is not quantified in advance, resource deployment is experience-driven, and there is no post-event learning system.**
>
> So *who* faces this? Every field officer and control-room operator — they deploy resources from gut feel, with no number to point at. And *why does it matter?* Because in a city this size, an extra ten minutes of congestion is thousands of vehicles, hundreds of litres of fuel, and — when an ambulance is stuck behind it — lives. The cost of guessing wrong is enormous, and today there's no tool that closes that gap."

---

## 3 · Solution Overview  ·  1:30–2:10

**[ON SCREEN]** The Simulator: type an event → hit Run → the whole right rail and map populate in under a second.

**[VOICE]**
> "ASTRA is a **decision-support system** for traffic police. You feed it one event — cause, location, time, whether the road is closed — and in **under a second** it gives you a complete package: a **0-to-100 severity score**, an **ML-predicted duration**, **how far the jam will spread in kilometres**, **exactly which junctions get hit and how badly**, **which corridors to divert traffic onto**, **how many officers, barricades and patrol vehicles to deploy and at which junctions** — and, critically, **what happened the last fourteen times something like this occurred.**
>
> And the design principle that makes it trustworthy: **we use machine learning in exactly one place** — duration — because it's the only thing in the data with a real label to train against. Everything else is a **transparent formula** an officer can inspect, question, and override. It's a co-pilot, not a black box."

---

## 4 · Key Features  ·  2:10–2:50

**[ON SCREEN]** Quick montage flicking through the seven tabs.

**[VOICE]**
> "It's a command centre with seven views:
> - **Simulator** — the core: run an event, *stack several simultaneous events*, see severity, resources and diversions on a live map.
> - **ASTRA Impact** — a side-by-side replay of the same jam **with versus without ASTRA**.
> - **Interventions** — a ranked action set: which closure or diversion relieves the most vehicles.
> - **What-If** — a digital twin: drag eight sliders — severity, weather, lanes, volume — and watch the spread re-compute live.
> - **Emergency** — priority dispatch: routes an ambulance down a **green corridor** from the nearest of **179 real Bengaluru hospitals**.
> - **Post-Event** — log what actually happened; an LLM turns your note into training data.
> - **Overview** — the city-wide risk picture."

---

## 5 · Live Demo — the user journey  ·  2:50–5:00  *(the heart of the video)*

**[VOICE — set up]**
> "Let me show you a real run. I'm an officer. There's **waterlogging at Silk Board, road closed, 6 PM on a Friday.**"

**[ON SCREEN — Simulator]** Fill the form, hit **Run**.

**[VOICE]**
> "One click. ASTRA says: **severity 88 — CRITICAL.** Expected duration with its worst-case planning band. Impact radius in kilometres. And look at the map — it's not drawing a circle, it's lighting up the **actual junctions** the congestion will reach, colour-coded by how badly. The 'Why this prediction' panel breaks down *why* it's critical. On the right: the **resource plan** — point-duty officers here, perimeter there, barricades, patrol vehicles — and a ranked list of **diversion corridors** with real road routes."

**[ON SCREEN]** Click **"+ Add another event"**, add a second incident.

**[VOICE]**
> "Real cities don't have one event at a time. Watch — I stack a second incident. ASTRA **unions the affected junctions, escalates the severity, and sums the resources** across both. Two epicentres, one coordinated plan."

**[ON SCREEN — ASTRA Impact tab]** Hit play on the timeline scrubber; both maps animate.

**[VOICE]**
> "This is the tab that sells it. Same incident, two timelines. On the **left, without ASTRA**, the jam spreads outward and stays red. On the **right, with ASTRA**, as each junction clears, a **green diversion corridor lights up and moves on** — and the headline counters show the delta: **minutes saved, vehicles spared, fuel, and rupees of economic loss avoided.**"

**[ON SCREEN — What-If tab]** Drag the **weather → Heavy** and **severity → High** sliders.

**[VOICE]**
> "What if it gets worse? This is a digital twin. I turn the weather to heavy, severity to high — and the whole spread **re-computes live**, more junctions turn red, the radius grows. This is the question no dashboard can answer: *what will happen if I do this?*"

**[ON SCREEN — Emergency tab]** Show the green corridor from a hospital placemarker to the incident.

**[VOICE]**
> "And the human stakes. The Emergency tab finds the **nearest of 179 real hospitals**, routes a **priority green corridor** to the incident, marks **exactly which signals to hold green**, and shows the officers and barricades to dispatch — with the time saved versus normal traffic."

**[ON SCREEN — Post-Event tab]** Type a free-text note, submit; tags + 'added to dataset' appear.

**[VOICE]**
> "Then the loop closes. The event resolves, the officer types a plain-English note — *'heavy rain, tow truck was late, Sarjapur reroute worked.'* **Gemini** reads it, extracts the delay factors, **turns it into a structured dataset row**, and the model **retrains in the background.** Every incident makes the next prediction sharper."

---

## 6 · System Architecture  ·  5:00–5:45  *(diagram first — before the deep-dive)*

**[ON SCREEN]** The end-to-end architecture diagram (the colour-coded five-layer flow).

**[VOICE]**
> "Here's how it's wired. One input flows **top to bottom** through five layers in a single 15-millisecond pass.
> **One — Data & Memory:** 8,173 historical incidents become 21 features and a set of risk tables, built once and held in memory.
> **Two — Intelligence Core:** the LightGBM duration model, the ESI severity score, and a k-NN lookup of similar past events.
> **Three — Spatial & Decision engines:** impact radius, the NetworkX spillover graph that cascades congestion across 294 junctions, and the diversion engine pulling **live routes from Mappls**.
> **Four — Resource Planner:** a small optimiser turning all of that into officer and barricade counts.
> **Five — the seven-tab command centre.**
> And two side loops: **Mappls** for real road geometry, and the **Gemini learning loop** feeding resolved events back into the data store. The backend is **stateless and database-free** — the whole dataset is under 10 MB, so it lives in memory and a prediction touches zero disk."

---

## 7 · Under the Hood — how we actually built it  ·  5:45–6:45  *(the complicated stuff)*

**[ON SCREEN]** Split panels: a features table → the model → the validation numbers.

**[VOICE]**
> "Now the part most teams skip. **How do we extract the ML features?** Each raw incident becomes **21 numeric features** — cause, corridor, road-closure, latitude/longitude instead of sparse junction names, and **cyclic sine/cosine encodings of hour and weekday** so the model knows 11 PM is next to midnight. **How is it used?** We deliberately train **one** model — duration — as **four quantiles plus a long-event classifier**, so we get a *calibrated risk band*, not a fake-precise point.
>
> **How is it stored and served?** Offline, one build script preprocesses the data, trains the model, and prebuilds the spillover graph into parquet, joblib, and pickle. At startup the backend loads them **once into memory** — so a live prediction is pure compute, ~15 ms.
>
> And here's our edge: **we don't ship magic numbers.** A validation script regenerates an audit that *derives every coefficient from the data* — closure events really do run **1.46× longer**; cause is a **28× driver**. We **validated the spread model** against held-out co-occurrence — its top predictions co-occur **1.4 to 1.6× above chance**, and it survives a non-circular test. We **sensitivity-tested** the decay constant: ±50% and the rankings don't flip. And we report duration **honestly** — it doesn't beat a naive median on short events, so we *say so*, and we win where it's real: **long-event detection at 0.87 ROC-AUC and a 79% calibrated risk interval.** That honesty *is* the credibility."

---

## 8 · Technology Stack  ·  6:45–7:05

**[ON SCREEN]** Logo grid grouped by layer.

**[VOICE]**
> "The stack: **Frontend** — React 19, TypeScript, Vite, Tailwind, with the Mappls vector map SDK. **Backend** — Python and FastAPI. **ML** — LightGBM, scikit-learn, NetworkX for the graph, SciPy for the resource optimiser. **AI** — Google **Gemini 2.5 Flash** structures the field notes. **Maps** — MapMyIndia for live routing. **Data** — no database; in-memory parquet, because at 10 MB that's faster and simpler. **Cloud** — AWS EC2 with nginx and systemd, and a **GitHub Actions CI/CD** that tests, type-checks, and deploys on every push."

---

## 9 · Innovation / USP  ·  7:05–7:35

**[ON SCREEN]** Four bold callouts.

**[VOICE]**
> "What makes ASTRA different from a dashboard?
> **One — it's explainable by design.** Exactly one ML model; everything else is a formula you can audit. **Two — it answers 'what if I do this' —** the with-vs-without replay and the live digital twin. **Three — it validates its spread model**, which almost no team does. **Four — it closes the loop with an LLM**, turning a human's messy note into clean training data automatically. We didn't just predict — we built the **operational, learning command centre** around the prediction."

---

## 10 · Impact & Benefits  ·  7:35–8:00

**[ON SCREEN]** Before/after metric counters: delay ↓, fuel ↓, ₹ loss ↓.

**[VOICE]**
> "The benefit to the officer: a defensible number instead of a hunch, and a deployment plan in one second. The social impact: **less time lost, less fuel burned, lower economic loss**, and a faster path for emergency vehicles. And the expected outcome the problem statement asked for — a system that **finally quantifies impact in advance and learns after the fact.**"

---

## 11 · Scalability & Future Scope  ·  8:00–8:25  ⏬

**[ON SCREEN]** A roadmap strip.

**[VOICE]**
> "It scales cleanly — the backend is stateless, so it's just more containers behind a load balancer; the one shared file moves to S3 or DynamoDB. Next up: a **live GPS/sensor feed** to replace static history with real-time volume, **continuous automatic retraining**, a **mobile companion** for field officers, and **per-city recalibration** — the formulas are tuned to Bengaluru, but the framework is city-agnostic."

---

## 12 · Challenges & Learnings  ·  8:25–8:50  ⏬

**[ON SCREEN]** A short "what we learned" list.

**[VOICE]**
> "Our biggest challenge was *honesty*. The dataset has **no ground truth** for how far a jam spreads or whether a diversion worked — so the temptation is to invent a label and train a black box. We refused. We built transparent, **data-derived** rules and then *validated and stress-tested* them. We also learned to test **behaviour, not magic numbers**, so improving the model never breaks the build. The lesson: in a decision-support tool, **earned trust beats false precision.**"

---

## 13 · Conclusion + Thank You  ·  8:50–9:10

**[ON SCREEN]** ASTRA logo, the live URL, team names.

**[VOICE]**
> "So that's ASTRA: feed it one event, get back a complete, explainable, second-by-second response plan — severity, spread, diversions, resources, emergency routing — and it gets smarter every time it's used. We replaced the guess with a number you can trust.
>
> It's live, it's open, and it's a co-pilot for the people keeping our cities moving. Thank you."

---

## ✅ Completeness Review (self-check before recording)

| Required section | Covered in | ✓ |
|---|---|---|
| Project intro — team / name / one-line pitch | §1 | ✓ |
| Problem — what / who / why | §2 | ✓ |
| Solution overview — what it does / how | §3 | ✓ |
| Key features | §4 | ✓ |
| Live demo — full user journey, all core features | §5 (Simulator → stacking → Impact → What-If → Emergency → Post-Event) | ✓ |
| System architecture — diagram + component interaction | §6 (diagram **before** deep-dive, as requested) | ✓ |
| ML feature extraction / use / storage / workflow ("the complicated stuff") | §7 | ✓ |
| Tech stack — FE / BE / DB / cloud / AI-ML | §8 | ✓ |
| Innovation / USP | §9 | ✓ |
| Impact & benefits — user / social / outcomes | §10 | ✓ |
| Scalability & future scope | §11 | ✓ |
| Challenges & learnings | §12 | ✓ |
| Conclusion + thank you | §13 | ✓ |

**Refinement notes after review:**
1. The architecture diagram (§6) deliberately precedes the technical deep-dive (§7) — per the brief.
2. Numbers to **not** fumble: severity **88 / CRITICAL**, **1.46×** closure, **28×** cause, **1.4–1.6×** spread vs chance, **ROC-AUC 0.87**, **79%** interval, **179** hospitals, **294** junctions, **8,173** events, **~15 ms**. (A `[VISUAL]` lower-third should show each as you say it.)
3. If you must cut to ~5 min: drop §11 and §12, and tighten §5 to Simulator + ASTRA Impact + Emergency only.
4. Replace *[your team name]* throughout and confirm the live URL on the closing card.
