# ASTRA — Detailed Live Technical Presentation Script
### Flipkart Grid · Team: Puneet & Monalisha

> **How to use this:** Every section shows exactly what is on screen, exactly what to say (in quotes), and exactly what to click. Practise the demo flow until it's muscle memory. The technical sections (Sections 8–11) are where judges separate strong teams from outstanding ones — know the numbers cold.

---

## OPENING SETUP — Before You Begin

Have the app open in a browser at the Vercel URL. Ensure:
- Simulator tab is active
- Form is blank / default state
- Map is centred on Bengaluru

---

## SECTION 1 · The Hook  *(~1.5 minutes)*

**[App is visible in the background. Speak directly to the panel.]**

> "Let me start with a scenario. It's 6:15 PM. A truck has broken down at Silk Board Junction — Bengaluru's busiest intersection. The road is partially blocked.
>
> A traffic officer gets the call. They need to answer three questions instantly:
> How severe is this going to get?
> How long will it last?
> How many officers, barricades, and patrol vehicles do I send — and exactly where?
>
> Today, that officer answers all three questions from memory and experience. They make a call. They dispatch resources. And they find out if they were right two hours later.
>
> There is no tool. There is no number. There is no system.
>
> We built that system. It's called ASTRA — Autonomous Strategic Traffic Response Assistant.
>
> One sentence: feed ASTRA one event, and in under 15 milliseconds, you get a complete, explainable, deployable response plan — severity score from zero to a hundred, ML-predicted duration with a confidence band, a map showing which specific junctions will be hit and how badly, a ranked diversion plan, and a to-the-junction resource deployment order.
>
> And when the incident is over, ASTRA learns from it.
>
> I'm Puneet, and I'm going to show you this live — and then take you under the hood to every piece of how it works."

---

## SECTION 2 · The Problem — Why This Matters  *(~1.5 minutes)*

**[Keep the app visible. Talk through the three gaps.]**

> "The problem Flipkart gave us — event-driven congestion management — has three documented gaps.
>
> **Gap one: No quantification.** When an event happens, there's no tool that says how severe it is, how far it will spread, or how long it will last. Decisions are made on gut feel, not numbers.
>
> **Gap two: Experience-driven resourcing.** Officers are deployed based on what worked last time, not based on what this specific situation actually requires. You end up with five officers at a junction that needed two, and two at a junction that needed eight.
>
> **Gap three: No learning loop.** After an event is resolved, nothing happens with what was learned. The next officer who handles a waterlogging incident at Silk Board at 6 PM has no idea what the last ten incidents at Silk Board at 6 PM actually required.
>
> The stakes are not abstract. Every minute of unnecessary congestion is thousands of vehicles burning fuel, people missing work, and — most critically — emergency vehicles stuck. In Bengaluru, an ambulance delayed by ten minutes at the wrong junction can be a life-or-death situation.
>
> ASTRA closes all three gaps. Let me show you."

---

## SECTION 3 · Live Demo — The Simulator  *(~4 minutes)*

**[Full attention on the screen now. This is the most important section.]**

> "I'm a traffic officer. I just got a call. Waterlogging at Silk Board Junction. Road is closed. Six PM on a Friday."

**[Step by step on the left form panel:]**
- **Cause** → select `Water Logging`
- **Junction** → select `SilkBoardJunc`
- **Hour** → drag slider to 18 (or type 18)
- **Day** → click `Fri`
- **Road Closure** → click to turn ON (shows red "ON")
- **Priority** → High

**[Hit "Run Simulation"]**

> "One click."

**[Wait for the result to populate — the map and right panel fill in. Then speak:]**

> "Look at this.
>
> **Top right — Severity: CRITICAL.** The Event Severity Index is 91 out of 100. I will explain exactly how that number was computed in a few minutes, but here's the headline: waterlogging, evening peak hour, road closed, Silk Board — this is as bad as it gets.
>
> **Duration band.** P10 is the best case — one and a half hours. P90 is the worst case — this is what ASTRA plans against — about four and a half hours. There's also a long-event probability. This tells the officer: there's a percentage chance this doesn't resolve in six hours. We plan on the P90, always the worst case.
>
> **The map.** This is the key part — look at it. It is not drawing a circle. It is lighting up the actual named junctions that congestion will propagate to, colour-coded: red is critical, orange is high, yellow is medium. Each junction has a congestion percentage on it. That is the output of a real road network graph running over 294 Bengaluru junctions. Not a geometric approximation — a graph traversal.
>
> **Impact radius** — 4.2 kilometres. That's how far the physical slowdown reaches from the epicentre.
>
> **'Why this prediction' panel.** Every component is listed. You can see cause score, duration contribution, closure penalty, time-of-day score, junction risk. A field officer can read this and understand exactly why the system said Critical. No black box.
>
> **Resource plan.** Specific numbers: nine point-duty officers at these specific junctions, three on the perimeter, two barricades at the site, four patrol vehicles. Below that — a per-junction deployment table, ranked by severity. This is not 'send seven officers.' It is 'send two to Marathahalli, one to BTM Layout, one to HSR Layout.'
>
> **Diversion corridors.** Three ranked alternatives. Top one is Outer Ring Road with 78% confidence. Score is computed from load factor, historical reliability, and available capacity."

---

### SECTION 3A · Similar Events  *(~30 seconds)*

**[Point to the Similar Events panel at the bottom right.]**

> "And the Similar Events panel. The system ran a weighted k-NN lookup — a nearest-neighbours search — against all 8,173 historical Bengaluru incidents and found the 15 most comparable past events. You see their cause, location, actual observed duration, and ESI. An officer can look at this and say: the last time something like this happened at Silk Board on a Friday evening, it took three hours and eight officers. I should plan around that.
>
> This is experience — codified, searchable, and accessible instantly."

---

### SECTION 3B · Stacking Multiple Events  *(~1 minute)*

**[Click "+ Add another event". Add second incident:]**
- Cause → `Accident`
- Junction → `KRPuramJunc`
- Hour → 18 (same)
- Closure → ON

**[Hit Run Simulation again.]**

> "Real traffic emergencies don't happen one at a time. Let me add a simultaneous accident at KR Puram — same hour, same evening.
>
> Watch what changes. The affected junctions from both incidents are unioned on the map. The ESI escalates — not by simple addition, but by computing the compound probability of both corridors being blocked simultaneously. The resource counts sum across both incidents. Both epicentres are on the map.
>
> One coordinated plan for two simultaneous crises. Each of the two cards in the left panel is a separate event. Every subsequent tab knows about both of them."

---

## SECTION 4 · ASTRA Impact Tab — The Value Case  *(~1.5 minutes)*

**[Click "ASTRA Impact" tab at the top.]**

> "This is the tab that answers the question every decision-maker asks: what does this actually save?
>
> This is a side-by-side replay of the same incident.
>
> Left panel — without ASTRA. The jam propagates. Junctions go red. They stay red. No coordinated diversion. No optimised deployment. The congestion just dissipates on its own over time.
>
> Right panel — with ASTRA. Watch the timeline move. As each junction receives a deployed team and a diversion route is activated, the congestion clears — the junction transitions from red to green, and the map shifts.
>
> The headline counters at the top tell you the delta: minutes of average delay avoided per vehicle, total vehicles freed from the jam, litres of fuel not burned, and rupees of economic productivity not lost.
>
> These aren't made-up numbers. They're computed from the predicted duration reduction, the number of affected vehicles estimated from the impact radius, average fuel consumption per kilometre of delay, and a per-minute economic productivity value calibrated to Bengaluru."

---

## SECTION 5 · What-If Tab — The Digital Twin  *(~1 minute)*

**[Click "What-If" tab.]**

> "The What-If tab is a digital twin. It lets an officer ask: what happens if conditions change?
>
> Watch this. I drag the weather slider from Clear to Heavy Rain."

**[Drag weather slider to Heavy Rain.]**

> "The entire spread recomputes live — more junctions turn red, the impact radius grows, the resource numbers go up.
>
> I push the severity slider higher."

**[Drag severity slider up.]**

> "The ESI escalates, the P90 duration extends, the diversion recommendations shift.
>
> This is what no static dashboard can do: answer the question 'what will happen if this gets worse?' An officer facing a developing situation can use this tab to stress-test their plan before conditions deteriorate. It's the difference between reactive and proactive management."

---

## SECTION 6 · Emergency Tab — Ambulance Dispatch  *(~1.5 minutes)*

**[Click "Emergency" tab.]**

> "The Emergency tab addresses the highest-stakes scenario — getting an ambulance through.
>
> For each incident currently in the simulation — and because we stacked two events, you'll see two separate dispatches — ASTRA runs the following process:
>
> It searches the **179 real, geocoded Bengaluru hospitals** in the dataset and finds the nearest one to that specific incident location. Not the nearest hospital in general — the nearest to where the event is happening.
>
> It then calls the Mappls route_eta API to get a real road route from that hospital to the incident — actual road geometry, not a straight line. It draws that route on the map as a **green priority corridor**.
>
> Along that corridor, it identifies the signals and junctions where officers need to be stationed to hold green. Those are marked on the map with officer icons.
>
> The dispatch panel on the right shows exactly how many officers and barricades are needed for this emergency corridor, and the time saved versus normal traffic routing.
>
> Those are real hospitals. Real road routes. Real signals. The dataset and the routing come from actual Bengaluru geography."

---

## SECTION 7 · Post-Event Tab — The Learning Loop  *(~1.5 minutes)*

**[Click "Post-Event" tab.]**

> "Every great system learns. This is how ASTRA does it.
>
> After an incident is resolved, the officer comes to this tab. They log the actual outcome:
> - Real duration: how many hours did it actually take?
> - Resources used: how many officers were actually deployed?
> - Diversion: did the recommended corridor work?
> - And a free-text field note — in plain English, whatever the officer observed.
>
> Let me type a realistic note."

**[Type in the text field:]**
`Heavy waterlogging, tow truck arrived 45 minutes late, Sarjapur Road diversion worked well, Marathahalli signal needed extra officer`

**[Hit Submit.]**

> "This is where Gemini 2.5 Flash comes in.
>
> We send this free-text note to Gemini using the structured output API — not just a prompt, but a schema-constrained request. Gemini reads the note and returns a JSON object that maps exactly to our dataset schema: delay factors tagged and categorised, the effective diversion corridor noted, the inferred actual duration, cause category confirmed.
>
> That structured JSON row is appended to our historical data file. The next time the build pipeline runs — which is triggered on every deployment — the LightGBM model retrains on the expanded dataset.
>
> This is a closed learning loop. Every incident ASTRA handles, every note an officer writes, makes every future prediction more accurate. The system is designed to improve with use without requiring any manual data engineering."

---

## SECTION 8 · Overview Tab  *(~30 seconds)*

**[Click "Overview" tab.]**

> "And the Overview tab gives the control room the city-wide picture — total events in the dataset, distribution by risk level, mean severity score across all historical incidents, the top junctions by risk score, and corridor-level stats. This is the macro view — useful for commanders planning shifts and resource allocation across the city."

---

## SECTION 9 · System Architecture  *(~2 minutes)*

**[Switch to the architecture diagram — show the 5-layer flowchart from the README.]**

> "Now I'll take you under the hood. The entire system is a five-layer stateless pipeline. A prediction flows top to bottom in just 15 milliseconds, with zero disk I/O.
>
> **Layer 1 — Data Foundation:** We process 8,173 historical incidents offline into engineered Parquet files, risk tables, a pickled graph, and the trained model. At startup, all of this is loaded into Pandas memory. Because the dataset is under 10 MB, we don't use a database—in-memory lookup is orders of magnitude faster.
>
> **Layer 2 — Intelligence Core:** Three things run here. The **LightGBM model** predicts duration. The **ESI formula** calculates a 0-100 severity score. And a **k-NN search** retrieves the 15 most similar past events.
>
> **Layer 3 — Spatial & Decision Engines:** We compute the physical **Impact Radius**. Then, a **NetworkX Spillover Graph** across 294 junctions simulates congestion cascade to map the exact affected areas. Finally, the **Diversion Engine** ranks alternative corridors, calling the Mappls API for live road routes.
>
> **Layer 4 — Resource Planner:** Converts the impact radius and affected junctions into an exact dispatch plan of point-duty officers, barricades, and patrol vehicles, capped at 50 police.
>
> **Layer 5 — React UI:** All seven tabs consume a single unified `Prediction` object from the FastAPI backend.
>
> **The Side Loops:** Two external APIs close the system. Mappls injects live routing, and Gemini 2.5 Flash handles the learning loop—parsing free-text post-event notes into structured data to automatically retrain the model."

---

## SECTION 10 · ESI — The Severity Score, Explained  *(~1.5 minutes)*

**[Show the Why panel in the app — the breakdown of ESI components is visible there.]**

> "ESI—the Event Severity Index—is the spine of the system. Let me be clear about what it is: it is **not** a machine learning model. It is a data-derived formula.
>
> Why not ML? Because there is no 'severity' label in the historical data to train against. An ML model trained on a label we invented ourselves would just be a black box hiding our own assumptions. 
>
> But isn't a formula just guessing? No. The rules aren't invented—the data gave us the rules. Every parameter in ESI is derived from patterns in 8,173 real incidents. The data dictates the formula.
>
> Here are the five weighted components:
>
> - **Cause (30%):** Scores range from vehicle breakdown (15) to waterlogging (85). These aren't arbitrary—waterlogging historically runs 15.8 times longer than the median, so the data dictates its high penalty.
> - **Duration (25%):** Our LightGBM model predicts the P90 duration. This is how ML directly feeds into the severity score. 
> - **Road Closure (20%):** A binary penalty (100 if closed, 20 if open) because full closures force massive rerouting.
> - **Time of Day (15%):** Evening peaks score 100; night shifts score 5, mapping exactly to Bengaluru's traffic volume.
> - **Junction Risk (10%):** A historically computed score for each junction, shrunk towards the city mean.
>
> These combine into a 0–100 score. 
> 
> **The evolution path:** ESI is rule-based today. But as field officers log actual severity ratings in the Post-Event tab, we build that missing label. With enough data, ESI transitions into a fully trained ML model."

---

## SECTION 11 · The ML Model — LightGBM, Explained  *(~1.5 minutes)*

**[This is the most technical section. Speak slowly and confidently.]**

> "We use ML in exactly one place: predicting event duration. Why? Because duration is the only metric in this dataset with a real, measured label. We don't train models against invented labels; we use transparent formulas for those. One ML model, one ground truth.
>
> **The Features:** We engineer 21 features. Crucially, we use continuous latitude/longitude so the model understands proximity. We also use cyclic sine/cosine encoding for hour and weekday—so the model knows 11 PM and midnight are adjacent, preserving the circular topology of time.
>
> **The Model:** We chose LightGBM for its microsecond inference and feature explainability. But we don't output a single, false-precision number. We train four models to output a P10 to P90 quantile band, plus a binary classifier for events exceeding 6 hours. The entire system plans against the P90 worst-case.
>
> **Honest Validation:** Most teams skip this. We publish our uncomfortable findings. Our model doesn't beat a simple median guess on short events. Where it wins is long-event detection, with an ROC-AUC of 0.87. Our P10–P90 band has a 79% calibrated coverage—exactly hitting the theoretical 80% mark.
>
> **Graph & Rules Validation:** We validated the Spillover Graph against historical co-occurrences. Its top predictions happen 1.4 to 1.6 times more often than random chance. Every coefficient we use is derived from data—closures run 1.46x longer, waterlogging runs 15.8x longer.
>
> **The Honest Admission:** The only assumptions we make are the impact radius multipliers, because 92% of the dataset lacks affected distance data. We sensitivity-test those, but we don't pretend they are data-derived. In a decision-support tool, earned trust beats false precision."
>
> ---
>
> ## SECTION 12 · The Spillover Graph — Mechanics  *(~30 seconds)*
>
> **[Show the map with the affected junctions visible.]**
>
> > "Our Spillover Graph is a directed NetworkX network over 294 junctions. Edges use two rules: same-corridor (0.5 multiplier if within 3km) and cross-corridor (1.0 multiplier if within 1.5km). Propagation uses the formula: source_congestion * e^(-2 * cost) * corridor_factor, stopping when congestion drops below 10%. Sensitivity-testing kappa from 1.0 to 3.0 proves our ranking is highly robust, maintaining a Jaccard similarity of 0.91 to 0.99 for top-10 junctions."
>
> ---
>
> ## SECTION 13 · Resource Planner — The Formula  *(~30 seconds)*
>
> > "For resource planning, we use a transparent formula, not ML. Why? Because there's no historical ground-truth for 'correct' deployment. Auditable rules build trust.
> > 
> > We calculate three categories:
> > - **Officers:** Point-duty by severity—two for high, one for medium; perimeter duty by radius; and site duty by cause, capped at fifty.
> > - **Barricades:** Four for full closures, one for partial, and four per kilometer of radius.
> > - **Patrols:** One vehicle per eight square kilometers, capped at eight.
> > 
> > This ensures every deployment is logical, predictable, and fair."
>
> ---
>
> ## SECTION 14 · Diversion Engine & Similar Events  *(~30 seconds)*
>
> > "The diversion engine scores candidate corridors within 2× impact radius using: 40% load, 30% reliability, and 30% capacity.
> >
> > The Similar Events engine uses a 5-weight k-NN: 35% cause, 25% distance, 20% closure, 12% hour, and 8% weekday. We use circular geometry for hours and weekdays so 11 PM and midnight, or Sunday and Monday, are close. We fetch 15 neighbors, filtering out any above a 0.4 distance threshold."
>
> ---
>
> ## SECTION 15 · Technology Stack  *(~1 minute)*
>
> > "The complete technology stack:
> >
> > **Frontend:** React 19 with TypeScript, built with Vite. The Mappls Vector Map SDK for the interactive junction map. Axios for API calls. No external state management library — all state lives in React hooks in App.tsx.
> >
> > **Backend:** Python 3.11 with FastAPI. Stateless — no database, no sessions, no shared state between requests.
> >
> > **ML and Analytics:** LightGBM for the four quantile duration models. scikit-learn for the k-NN retrieval. NetworkX for the spillover graph. SciPy for the resource optimiser. Pandas for all data handling. Parquet for serialised DataFrames, joblib for the model, pickle for the graph.
> >
> > **AI integration:** Google Gemini 2.5 Flash with structured output mode — the response schema exactly matches our dataset row structure.
> >
> > **Maps and routing:** Mappls API — the MapMyIndia platform. Used for live route_eta calls in the diversion and emergency tabs, and for the 179 hospital routing.
> >
> > **Infrastructure:** AWS EC2. Nginx serves the built React frontend from `frontend/dist` and proxies all `/api/` requests to the FastAPI backend running on port 8001, managed as a systemd service called `astra-backend`.
> >
> > **CI/CD:** GitHub Actions. Two workflows: one that runs pytest and TypeScript type-check on every push, one that rsyncs code to EC2 and runs the deploy script on every push to main."

---

## SECTION 16 · What Makes ASTRA Different  *(~1.5 minutes)*

> "Let me be direct about what separates ASTRA from a traffic dashboard — and I'll be honest about the tradeoffs we made.
>
> **One — ML exactly where it belongs, rules exactly where they belong.** The old system was experience-driven because officers estimated duration from memory. We replaced that with LightGBM trained on 8,173 incidents. For severity scoring, we use a rule-based formula — not because we didn't think to use ML, but because the dataset has no severity label to train against. A model trained on an invented label is not better science. It's just less explainable. Every rule we wrote is auditable, challengeable, and derived from what the data actually shows.
>
> **Two — it's consistent where the old system was not.** Two officers seeing the same event at the same junction at the same time now get the same plan. That alone removes one of the three problems in the original system.
>
> **Three — honest validation.** We published the uncomfortable findings — duration model doesn't beat a naive baseline on short events — because that honesty is what earns the trust to actually deploy a tool like this.
>
> **Four — it's operational, not just predictive.** Most ML projects stop at the severity score. We go all the way to specific officers at specific junctions, specific diversion routes with real road geometry, hospital dispatch with a green signal corridor. Deployable today.
>
> **Five — it's designed to learn and evolve.** The Gemini learning loop converts every resolved incident to training data. And as the Post-Event tab accumulates officer-assessed severity ratings, ESI itself transitions from a rule-based formula to a fully trained ML model. The architecture is built for that evolution."

---

## SECTION 17 · Closing  *(~30 seconds)*

**[Switch back to the Simulator tab with a live prediction visible on screen.]**

> "ASTRA is live right now. You can open it on your phone.
>
> Feed it one event. Get back a complete, explainable, deployable response plan in 15 milliseconds. And every time an officer logs a resolved incident, the next prediction is sharper.
>
> We replaced the guess with a number you can trust. Thank you."

---

## ⚡ KEY NUMBERS — Memorise Every One

| Stat | Value | Where it appears |
|---|---|---|
| Historical incidents | **8,173** | Dataset size |
| Dataset columns | **45** | Data richness |
| Features per event | **21** | Feature engineering |
| Pipeline latency | **~15 ms** | Architecture |
| Junctions in graph | **294** | Spillover graph |
| Hospitals in dataset | **179** | Emergency tab |
| Long-event ROC-AUC | **0.87** | Model validation |
| Interval coverage | **79%** (P10–P90) | Calibration |
| Spillover signal | **1.4–1.6×** above chance | Graph validation |
| Decay kappa | **2.0** | Spillover formula |
| Closure duration ratio | **1.46×** longer (measured) | Derived coefficient |
| Waterlogging ratio | **15.8×** longer than median | Cause analysis |
| Cause range | **28×** total spread | Duration analysis |
| ESI weights | cause 30%, duration 25%, closure 20%, time 15%, junction 10% | ESI formula |
| Similarity weights | cause 35%, location 25%, closure 20%, hour 12%, weekday 8% | k-NN engine |
| Diversion weights | load 40%, reliability 30%, capacity 30% | Diversion engine |
| Similar events retrieved | **k=15** | k-NN retrieval |
| Police cap | **50 officers** | Resource planner |
| Patrol vehicle cap | **8 vehicles** | Resource planner |
| Model algorithm | **LightGBM** | ML section |
| AI model | **Gemini 2.5 Flash** | Learning loop |
| Maps provider | **Mappls / MapMyIndia** | Maps section |
| Backend framework | **FastAPI** | Tech stack |

---

## 🎯 Prepared Q&A — Detailed Answers

**Q: Why LightGBM and not XGBoost or a neural network?**
> "LightGBM uses histogram-based splits which are significantly faster to train than XGBoost's exact split method at this data scale. On 8,000 rows with 21 features, it trains in under two seconds. Versus a neural network: at this data volume, a neural net would likely overfit and wouldn't give us the feature importance interpretability we need for a tool that officers have to trust. LightGBM hits the sweet spot of speed, accuracy, and explainability."

**Q: Why quantile regression instead of just predicting the mean?**
> "A mean prediction gives one number — which is almost certainly wrong. A quantile regressor trained at alpha=0.90 learns to output a value such that 90% of actual outcomes fall below it. That's precisely what we need for planning: a number you can say 'I'm confident 90% of incidents like this will be over in this many hours.' The P10–P90 band has 79% empirical coverage on held-out data, which matches the theoretical target. A mean prediction gives false precision."

**Q: How do you validate the spillover graph if you have no ground truth?**
> "Great question — and this is the honest part of the answer. We don't have GPS traces or real propagation measurements. What we do have is the historical co-occurrence signal — we can ask: do incidents at junction A tend to be followed by incidents at junction B within three hours? We build a co-occurrence matrix from historical data, hold out a test portion, build the graph on the training portion only, and test whether the graph's top-3 predictions for any given junction appear more often in the test co-occurrences than chance would predict. They appear 1.4–1.6× above chance, which is a meaningful signal. It's not perfect — it's the best validation possible without a real measurement system."

**Q: The dataset has 92% missing affected-distance. How can you compute impact radius?**
> "We can't use it as a training label — and we're transparent about that. The impact radius formula uses duration, closure, peak hour, and cause as inputs, with multipliers that are sensitivity-tested against the distribution of event outcomes. The closure multiplier of 1.8 and peak multiplier of 1.6 are not data-derived — we say so explicitly. What we can validate is that varying these by ±50% doesn't change the top-10 affected junction ranking materially. We treat them as documented, defensible assumptions rather than pretending we derived them from data we don't have."

**Q: What happens if the feedback loop receives bad data?**
> "The feedback store uses Bayesian shrinkage with a K factor of 3.0 toward the neutral correction factor of 1.0. This means a single report can only move the correction factor by a bounded amount, and the factor is clamped between 0.5 and 2.0 regardless. You need at least three consistent reports at the junction+cause level before the junction-specific factor kicks in — below that threshold, only the cause-level factor applies, which is more statistically stable. So the system is designed to be resistant to outlier reports."

**Q: Why is the backend stateless? What happens if two officers submit at the same time?**
> "FastAPI with uvicorn handles concurrent requests on separate event loop threads with Python asyncio. Each request to `/api/predict` is fully self-contained — it reads from the in-memory DataFrames (read-only) and returns a result. The only shared write state is the feedback.jsonl append-only file, which uses a file-level append that's atomic enough for the concurrency level expected in this use case. For production scale, we'd move the feedback store to DynamoDB with single-digit millisecond writes."

**Q: Isn't ESI just experience encoded as rules — how is that different from the existing experience-driven system?**
> "That's the sharpest question you can ask, and I want to answer it honestly. Conceptually, both encode past observations. But there are three meaningful differences. First — the old system used one officer's memory across maybe 500 career incidents. ESI's scores are derived from 8,173 incidents — 16 times more data, systematically aggregated. Second — the old system was completely opaque. ESI shows you every component. A supervisor can challenge any number. Third — the old system was inconsistent across officers. ESI is identical for every officer every time. And there's one part that is genuinely ML, not rules: the duration prediction — the most subjective and experience-driven judgement — is replaced entirely by LightGBM. ESI is rule-based for severity because there's no severity label in the data to train against. Once the feedback loop accumulates officer-rated severity outcomes, ESI becomes a trained model. The rules are the honest starting point; the learning loop is the evolution path."

**Q: Why not make ESI an ML model from the start?**
> "Because we'd have to invent the training label. The dataset has no 'severity' column. If we created a label — say, a weighted formula of duration and closure — and then trained a model against it, we'd be training ML against our own rule. The model would learn to replicate the rule, not to discover new patterns. It would be harder to interpret, slower to run, and not more accurate. The rule-based formula is the honest starting point. When we have real severity labels from the Post-Event tab — officer-reported 1-to-10 severity ratings after each incident — we can train a genuine model against genuine ground truth."

**Q: The black screen issue — did your app crash?**
> "That was a one-time deployment configuration issue during the Vercel migration — the ngrok tunnel required a bypass header to skip its browser interstitial page. We identified it within minutes, added the header to the Vercel proxy config, and redeployed. The app has been stable since."
