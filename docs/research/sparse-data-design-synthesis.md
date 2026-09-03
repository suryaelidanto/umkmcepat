# Sparse-data web design research: from fewer facts to better form

**Status:** synthesis complete
**Collection:** 100 Firecrawl captures, reviewed source by source
**Research root:** `.firecrawl/sparse-data-research/`
**Citation map:** [`sparse-data-source-review.md`](sparse-data-source-review.md)

## Executive conclusion

Sparse business data should narrow the factual surface, not the design ambition. A site can feel specific and finished without inventing a testimonial, a location, a product benefit, a photograph, or a larger catalog. The design has other material to work with: hierarchy, typography, spacing, rhythm, contrast, grouping, interaction, and the order in which true information appears.

The strongest conclusion from this collection is:

> A distinctive site gives a small set of true facts an unmistakable visual and interaction grammar.

That grammar must help people understand the business and take the next step. Novelty is not the goal. Clear purpose, credible details, a coherent visual point of view, accessible presentation, and reliable behavior matter more than unusual layouts or decorative volume.

Five decisions follow from the evidence:

1. **Treat facts as a permission system.** An owner-confirmed fact may render. A suggestion, inference, unknown, or declined field may shape a question or an internal design decision, but it must not become customer-facing copy.
2. **Use form to create distinction.** Scale, whitespace, type, alignment, color roles, line work, material references, and interaction states can make a page recognizable without adding claims.
3. **Give the first screen one job.** Say what the business is, show the most useful confirmed detail, and make the next action obvious. Use specific labels rather than generic calls to action. [S001] [S026] [S077]
4. **Make absence honest and useful.** Do not fill missing data with plausible content. Omit it, ask for confirmation, or use a quiet composition that lets the available facts carry more weight. When an application has an actual empty or error state, explain the state, the reason, and the next action. [S002] [S017] [S027] [S036]
5. **Separate hard gates from taste.** Code can reject unsupported claims, broken routes, inaccessible contrast, invalid assets, and build failures. Human review must judge whether the resulting form feels coherent, specific, and appropriate for its audience. [S044] [S084] [S098] [S099]

This report is a research artifact and recommendation set. It does not authorize a new implementation pass. The existing project rules remain the authority for any future work.

## 1. Scope and method

The collection contains 100 sources in six groups:

| Group             |   Sources | Count | Main question                                                                            |
| ----------------- | --------: | ----: | ---------------------------------------------------------------------------------------- |
| Foundations       | S001-S016 |    16 | How do hierarchy, content, clarity, trust, and recognition work?                         |
| Design systems    | S017-S043 |    27 | Which reusable rules make layouts legible, responsive, and consistent?                   |
| Accessibility     | S044-S058 |    15 | What must survive contrast, zoom, keyboard use, assistive technology, and small screens? |
| Philosophy        | S059-S069 |    11 | How can restraint, negative space, and adaptable form carry meaning?                     |
| Content and trust | S070-S079 |    10 | How do credibility, homepage purpose, and plain language affect decisions?               |
| AI workflows      | S080-S100 |    21 | How should an AI system plan, use context, render, evaluate, and remain accountable?     |

The Firecrawl run produced 100 of 100 expected files and 3,372,255 bytes of extracted Markdown after correcting stale or non-substantive captures for Section 508 typography, the NN/g homepage and web-writing articles, GOV.UK writing guidance, Microsoft HAX, and the WebGen-Agent paper. A source is called **verified** here when the capture exists, the manifest URL resolves to substantive source material, and the capture contains usable evidence. That does not make every recommendation universal or equally strong.

The source weights used in this report are:

- **Normative or primary technical guidance:** W3C, MDN, NIST, government design systems, and the ACM paper. Use these for accessibility requirements, risk controls, and technical boundaries. [S037-S058] [S096-S098]
- **Empirical or research summaries:** NN/g, Stanford, RIT, and the WebGen-Agent paper. Use these for observed behavior, tested patterns, and hypotheses. Check age, sample, task, and evaluation limits. [S001-S016] [S064] [S070] [S078] [S099]
- **Design-system and practitioner guidance:** Material, Carbon, Atlassian, SAP, Primer, Google PAIR, Microsoft HAX, OpenAI, and Anthropic. Use these for operational patterns and workflow design. Treat vendor guidance as informed practice, not as a universal law. [S017-S043] [S080-S095]
- **Essays and editorial examples:** Vitsœ, A List Apart, Smashing Magazine, Toptal, Webflow, and Unbounce. Use these to generate design hypotheses and vocabulary. Do not treat examples or marketing pages as controlled evidence. [S059-S069] [S074] [S076]

## 2. What excellent and distinctive mean under sparse data

### Excellent

An excellent site does four things at once:

- **It is true.** Business assertions, prices, service areas, contact routes, capabilities, and media have a traceable authority.
- **It is easy to understand.** A visitor can identify the business, its relevant offer, and the next action without decoding the page.
- **It is easy to use.** Navigation, links, forms, states, keyboard focus, responsive reflow, and error recovery work as expected.
- **It is worth trusting.** The page looks cared for because it is organized, current where dates are provided, honest about limits, and free of avoidable errors.

NN/g, Stanford, USWDS, W3C, and Baymard reach this from different directions. Their common point is that visual polish cannot rescue a page that makes the visitor guess, blocks the task, hides the source of a claim, or fails at the edges. [S007] [S014] [S037] [S047] [S070] [S073]

### Distinctive

Distinctiveness is not the same as visual novelty. It is the ability to recognize a page's point of view after its content is removed from a template gallery. That point of view can come from:

- a consistent relationship between type sizes and information importance;
- a particular use of whitespace and alignment;
- a small set of color roles rather than a pile of accents;
- a material or editorial metaphor that fits the subject without making factual claims;
- a repeatable rhythm for facts, actions, and supporting detail;
- a deliberate interaction pattern, such as a direct contact route or a useful disclosure;
- a calm, exact voice that belongs to the audience and the business.

Distinctiveness fails when the design uses an unusual layout only to look different, when every element competes for attention, or when a visual device implies evidence that the business never supplied. NN/g's homepage guidance favors clear purpose, representative examples, action prompts, and simple conventions. A List Apart makes the complementary point that the web's flexibility is a strength when the design accepts different screens, text sizes, and reading conditions. [S067] [S077]

### Sparse

Sparse data means the known fact set is small. It does not mean the business is small, poor, new, or less credible. The system must not infer those things. It only means the page has fewer approved statements to display.

A useful distinction is:

- **Content can be sparse.** There may be one product, one price range, one service area, and one contact route.
- **Form can be rich.** Those facts can receive careful hierarchy, grouping, scale, typography, responsive behavior, and clear interaction.
- **Claims must stay narrow.** Form cannot smuggle in a promise. A photo of a delivery vehicle implies delivery. A map implies a location. A star rating implies measured customer feedback. A badge implies a certification. None belongs without approval.

## 3. Findings that converge across the collection

### 3.1 Hierarchy is the first creative act

NN/g defines visual hierarchy as organizing elements so the eye consumes them in an intended order. Color and contrast, scale, and grouping provide the main levers. Proximity makes relationships legible, but responsive changes can accidentally destroy those relationships. [S001] [S006]

Material, Carbon, USWDS, RIT, and Toptal describe the same problem through layout, type, tokens, or negative space. Size should signal importance. Whitespace should group and separate. A design with ten equally loud elements has no priority. [S021-S023] [S029] [S038] [S064] [S066]

**Practical rule:** rank the facts and actions before choosing the layout. The first visual weight should go to the business name or literal offer, the next to the most useful confirmed detail, and the next to the action that moves the visitor forward. Do not let an invented headline outrank the facts.

### 3.2 Content is part of the interface

NN/g's content strategy defines content as an intentional system with a purpose, audience, structure, maintenance plan, and retirement path. Its writing guidance and the GOV.UK guidance emphasize clear, direct language. The classic NN/g web-writing study found better measured usability when the test content was concise, scannable, and objective rather than promotional. The study is old and used a narrow test site, but its direction fits current plain-language guidance. [S003] [S010] [S013] [S075] [S078] [S079]

The page should not reserve the visual center for a slogan and push the useful information away. It should let a visitor scan:

- what this is;
- what is available or confirmed;
- what it costs, if a price is confirmed;
- where it applies, if an area is confirmed;
- how to act next.

A useful CTA names the result of the action. "Hubungi lewat WhatsApp" tells a visitor more than "Learn more" or "Explore." The exact Indonesian wording should follow the owner-approved content and audience. [S026] [S077] [S078]

### 3.3 Trust is behavior, not a visual effect

Stanford's ten guidelines include verifiability, a real organization, expertise, honest people, contact information, professional design, usefulness, current content, restraint with promotion, and error avoidance. NN/g similarly points to design quality, upfront disclosure, correct and current content, and a coherent connection to the wider web. [S007] [S008] [S070]

These sources do not justify manufacturing proof. If there is no approved address, publish no address. If there is no approved review, publish no review. If there is no certification, publish no badge. A contact number, a clear product label, an exact price range, and a direct action can build more trust than a decorative trust panel.

Trust grows through repeated correct behavior. The page must keep its promises, show useful feedback, recover from errors, and avoid making the visitor provide information before the visitor understands what the business offers. [S008] [S014] [S070]

### 3.4 Good emptiness tells the truth

Empty-state guidance agrees on a compact structure:

1. say what state the visitor is seeing;
2. explain why the state exists when that helps;
3. provide the next useful action.

NN/g calls empty states opportunities for status, learning, and direct pathways. Material, Carbon, Atlassian, and SAP distinguish first use, no results, completed actions, permissions problems, configuration gaps, and system errors. They also warn against adding more explanation than the situation needs. [S002] [S017] [S027] [S033-S036]

A public business page with few facts is not automatically an application empty state. Do not display "No products yet" or "Coming soon" unless the owner has confirmed that statement and wants it shown. The safer pattern is to omit unavailable material and give the confirmed information more room.

### 3.5 Systems create coherent difference

A design system does not flatten a page into sameness. It gives the page a controlled vocabulary. Material, Carbon, USWDS, Primer, and NN/g all connect consistency with learnability and lower cognitive load. Carbon's token model separates a role from its color value. USWDS describes tokens as a small, deliberate selection from a much larger range of possible values. [S016] [S028] [S029] [S032] [S039] [S042]

For sparse-data generation, the system should define roles such as:

- page background;
- primary text;
- muted text;
- border or rule;
- action;
- action-on-color;
- state feedback;
- focus indicator.

A direction can then make a specific choice about how those roles relate. Distinction comes from the relation between tokens, type, space, and content, not from adding an arbitrary color to every component.

Material's button guidance also supports one visually prominent action per context. That does not mean every business must have only one possible action. It means the page should rank actions instead of presenting a flat row of competing buttons. [S026]

### 3.6 Accessibility is part of the visual idea

WCAG requires at least 4.5:1 contrast for normal text and 3:1 for large text. Reflow should preserve information and function at a 320 CSS pixel width, except where a two-dimensional layout is necessary for meaning or use. Focus must remain visible. W3C also warns against color as the only signal and recommends clear, consistent navigation, labels, feedback, headings, spacing, and media alternatives. [S044-S048]

Section 508, WebAIM, Digital.gov, ASU, MDN, and web.dev add practical checks for text resizing, line length, layout, images, semantic structure, keyboard use, and responsive media. Typography guidance does not require one fashionable typeface. It requires legibility, relative sizing, contrast, and a layout that survives user adjustments. [S049-S055]

Responsive design is not a smaller desktop composition. Material's responsive patterns include reflow, reveal, transform, divide, expand, and position. A List Apart argues that the web's inability to behave like a fixed printed page is an accessibility advantage when designers let the page adapt. [S024] [S045] [S053] [S067]

### 3.7 AI needs transparency and control

Carbon for AI says users should know where AI appears, access explanations in context, and not mistake AI styling for decoration. Microsoft's HAX guidelines group 18 practices by initial interaction, regular interaction, failure, and change over time. The group includes setting expectations about capability and quality, timing actions to context, showing relevant information, making invocation, dismissal, correction, uncertainty, and explanations efficient, remembering interactions carefully, accepting granular feedback, exposing global controls, and notifying users about changes. [S031] [S092] [S093]

Google PAIR, Google's AI principles, NIST, and the HCAI paper make the same point at a broader level: design for human goals, oversight, privacy, fairness, explanations, feedback, and the ability to challenge or override a result. These controls matter even more when an AI system can write customer-facing claims or modify a codebase. [S094-S097] [S100]

## 4. A fact-to-form workflow

This workflow translates the research into an operating method for a sparse-data website generator.

### Step 0: establish the data contract

Create a ledger with at least:

- field name;
- exact value;
- provenance or owner message;
- status such as `owner_confirmed`, `suggested`, `unknown`, or `declined`;
- render permission;
- last accepted snapshot.

Only `owner_confirmed` values may enter customer-facing source. Raw conversation remains useful for nuance and follow-up questions, but it does not grant render permission. Preserve the ledger and the accepted snapshot so a later edit can explain why a value appeared.

### Step 1: identify the visitor's job

Ask what a visitor needs to decide or do. A local seller may need a visitor to identify the product and contact the seller. A service provider may need a visitor to understand the category and start a conversation. Do not make a pricing table, service catalog, map, blog, or testimonial section merely because the template expects one.

Use the answer to choose one primary path. Secondary paths can exist, but they should not compete with it.

### Step 2: choose a visual direction from facts, not from gaps

A direction is an aesthetic decision, not a new business fact. It should explain:

- the visual subject;
- the relationship between type and space;
- the material or editorial reference, if any;
- the action hierarchy;
- what the design will deliberately leave out.

For example, a seller with one confirmed product, price range, area, and phone number could use a product-led ledger or editorial direction. The page can treat the price as a visible piece of information and arrange the other facts as a small record. That direction does not claim quality, freshness, delivery speed, origin, or scale.

Run direction exploration before broad generation. Keep the chosen direction and its reason in the accepted snapshot. A visual direction that exists only in the model's transient context will drift on the next turn.

### Step 3: build the content architecture

Use the smallest useful structure:

1. business or product name;
2. a literal description of what is offered;
3. the most useful confirmed fact or facts;
4. the primary action with a valid target;
5. supporting confirmed details, if they help the decision;
6. a clear route back or onward if the site has more than one page.

NN/g recommends specific content examples on a homepage. Under sparse data, a confirmed product line, price range, or service category can be that example. Do not replace examples with generic categories, invented cards, or vague benefits. [S077]

### Step 4: make a visual grammar

Choose a small set of rules before styling individual components:

- a type scale with a clear relationship between title, section heading, body, label, and action;
- a spacing scale that groups related facts and separates different tasks;
- a grid or alignment rule that works at narrow and wide widths;
- semantic color roles with tested contrast;
- one or two shape and border decisions;
- a rhythm for repeated facts;
- a rule for where the main action sits;
- motion only when it explains change or supports orientation.

Use the domain as a source of formal relationships, not as an excuse to draw a literal scene. A grain, ledger, workshop, menu, route, or archive can guide rhythm and grouping. It must not imply a facility, provenance, process, or capability that the owner did not confirm.

### Step 5: implement the states people will encounter

Design the complete path, not only the successful screenshot:

- initial load;
- no optional content;
- invalid or missing data at an internal boundary;
- failed request;
- successful contact or navigation;
- keyboard focus;
- reduced motion;
- unknown route;
- narrow viewport and increased text size.

The state should tell the truth about what happened. If an action failed, say what failed and what the visitor can do next. Do not use a generic success message when the operation did not complete. [S014] [S027] [S035]

### Step 6: apply deterministic gates

Before a human reviews taste, reject:

- unsupported business claims or softened promotional variants;
- unapproved photos, logos, icons, or embedded image data;
- fake prices, dates, hours, addresses, ratings, certificates, awards, guarantees, or quantities;
- ambiguous or hash-only business CTA targets;
- broken routes, empty source files, invalid imports, or failed builds;
- inadequate text and focus contrast;
- horizontal overflow or loss of content during reflow;
- missing alt text where an approved image exists;
- unhandled error and loading states.

A deterministic gate should report the exact offending value or location. It should not ask a model to decide whether an unsupported claim feels harmless.

### Step 7: review the rendered result as a human

Capture at least one narrow and one wide viewport. Review the page without reading the implementation. Ask:

- Is the business or offer clear immediately?
- Does the visual hierarchy match the visitor's job?
- Does the design feel specific without making a new claim?
- Does the page look intentionally sparse rather than unfinished?
- Does every visual element earn its space?
- Can a visitor reach the next action without hunting?
- Does the design survive long labels, zoom, keyboard focus, and reduced motion?

UICrit's critique dataset groups human feedback into layout, color contrast, buttons, learnability, and readability. WebGen-Agent shows why screenshot feedback and GUI testing catch failures that code execution misses. Neither source makes an automatic visual score a substitute for a human decision about domain fit or truth. [S098] [S099]

### Step 8: preserve the decision trail

Record the ledger version, direction, prompt version, model snapshot, generated source hash, deterministic gate results, visual review, and accepted changes. Anthropic's long-running-agent research supports progress artifacts, incremental work, clean handoffs, and browser verification rather than relying on a model's memory or a claim that the work is done. [S085] [S088]

## 5. Proposed quality rubric

This is an operational rubric derived from the sources. It is not a validated benchmark. Use it to make human review more consistent, not to turn taste into a false number.

### Hard gates

All of these must pass before a site can ship:

- every rendered business assertion traces to an allowed fact;
- every business action has a real, approved target;
- no unapproved media or visual proof appears;
- routes, imports, assets, and builds work;
- text, focus, keyboard use, and reflow meet the project's accessibility bar;
- loading, error, empty, and success states describe reality;
- the first screen identifies the offer and the next action.

### Scored dimensions

Score each dimension from 0 to 4:

| Dimension                | 0                            | 2                                     | 4                                                                        |
| ------------------------ | ---------------------------- | ------------------------------------- | ------------------------------------------------------------------------ |
| Truth and provenance     | Unsupported or fabricated    | Mostly grounded with review gaps      | Every claim is traceable and rendered at the approved scope              |
| Job clarity              | Visitor must guess           | Offer or next step is partly clear    | Offer, useful detail, and next action are clear at a glance              |
| Hierarchy and scanning   | Competing or chaotic         | Some priority is visible              | Scale, contrast, grouping, and spacing create a reliable reading order   |
| Distinctive form         | Generic or decorative        | A direction exists but drifts         | A coherent visual grammar fits the domain without implying new facts     |
| Fact-to-space efficiency | Filler dominates             | Some modules have weak purpose        | Every visible module helps recognition, decision, action, or orientation |
| Interaction and states   | Paths fail or mislead        | Main path works, edge states are weak | Actions, feedback, correction, errors, and empty conditions are clear    |
| Trust and calibration    | Overpromises or hides limits | Basic contact and content are present | The page is exact, current where applicable, transparent, and error-free |
| Accessibility and reflow | Major blockers               | Minor issues or one weak viewport     | Contrast, focus, semantics, zoom, motion, and narrow layouts hold up     |
| Technical integrity      | Broken build or route        | Works in the main path                | Build, routes, assets, performance, and security checks pass together    |
| System coherence         | Styles are ad hoc            | Repeated patterns partly agree        | Tokens and component rules make future changes predictable               |

A proposed release floor is: all hard gates pass, no score below 3 for truth, job clarity, interaction, or accessibility, and a human reviewer approves the direction. The average score can help prioritize revisions, but it must not compensate for a fabricated claim or an accessibility blocker.

## 6. Sparse-data design patterns

These are design patterns, not copy to insert into a project.

### A single-product local seller

**Known:** business name, product name, price range, service area, phone number, and perhaps a few owner-approved product statements.
**Form:** put the name and product in the first viewport, treat the price as a primary information object, and make the phone or messaging route direct. Use a fact list or small record for the remaining confirmed details.
**Do not add:** a product catalog, product photography, map, delivery promise, customer quote, quality superlative, or "starting from" label unless each one is confirmed.

A ledger or editorial direction can make this page memorable. It can use aligned values, deliberate rules, generous gaps, and a restrained type pairing. The visual system supplies character. It does not enlarge the business's factual footprint.

### A service business with only a category and phone number

**Known:** business name, service category, and contact route.
**Form:** make the category literal, keep the contact action visible, and use a calm composition with clear reading order. A short page is better than a fabricated service menu.
**Do not add:** process steps, years of experience, portfolio items, customer outcomes, operating hours, service radius, or guarantees.

### A maker with a logo but no approved photography

**Known:** name, logo asset, product or category, and perhaps a contact route.
**Form:** use the approved logo and build a typographic or geometric visual language around confirmed words and relationships. If an abstract shape is used, keep it visibly illustrative rather than evidence of the product or facility.
**Do not add:** a stock image, a generated product scene, a workshop image, a package mockup that implies real packaging, or a lifestyle photograph.

### An incomplete record

**Known:** only a subset of core fields.
**Form:** render the smallest useful page from the confirmed subset or pause for an owner question. Keep unconfirmed fields out of customer-facing output.
**Do not add:** a placeholder sentence that sounds like a business statement, a fake "coming soon" status, or a decorative block that suggests content exists elsewhere.

## 7. Philosophy and working mindset

### Restraint is an active design choice

"Less" is not the absence of decisions. Rams's principles, Vitsœ's interpretation, and the Design Museum account of good design all treat restraint as a way to remove what does not help the object or its use. Negative space is active. It shapes attention, relationships, and reading. [S059-S065]

The right question is not "How do we fill the page?" It is "Which true thing deserves more room?"

### Use conventions for orientation and difference for recognition

People bring expectations from other sites. Consistent navigation, recognizable controls, descriptive links, and ordinary responsive behavior reduce the work of learning the page. The design can then spend its originality on type, rhythm, material reference, and content emphasis. [S004] [S014-S016] [S042] [S077]

### Do not confuse visual confidence with evidence

A polished badge, photo, testimonial, or number feels authoritative because visual form affects credibility. That makes it more important to control what form implies. The designer is responsible for the meaning a composition suggests, not only for the literal words it contains. [S007] [S012] [S070]

### Let the audience set the tone

NN/g found measurable effects from tone, but also found that a playful voice does not work for everyone. The best tone depends on audience, message, and brand. Plain and factual does not require cold or robotic language. A local Indonesian business can sound direct and warm without inflated promotion. [S009] [S010] [S078]

### Keep the owner in control

The system may suggest a direction, a question, or a layout. It must not silently turn a suggestion into a public fact. Human oversight is not a final checkbox. It belongs at the point where the system decides what it is allowed to say and what it is allowed to imply. [S031] [S092-S097] [S100]

### Design for the next revision

A sparse site often gains facts later. Use tokens, component rules, data boundaries, and snapshots so the page can grow without losing its identity. Do not build a one-off visual trick that only works for the current text length. [S016] [S039] [S067] [S081] [S085]

## 8. AI and system-prompt guidance

### The prompt should define authority before style

The model needs a clear order of authority:

1. safety, security, and platform constraints;
2. owner-confirmed facts and approved assets;
3. accepted project direction and design system;
4. user request and current task;
5. model suggestions and aesthetic exploration.

A suggestion can influence a direction. It cannot become a claim. If two confirmed values conflict, stop and ask for resolution. If a needed value is unknown, omit it or ask the owner. Do not tell the model to "make the site feel complete" without defining what completion may and may not include.

### A useful system-prompt shape

The following is a template for future prompt work. It is intentionally a contract outline rather than a drop-in implementation string.

```xml
<identity>
You are a restrained web design and implementation agent.
Optimize for visitor understanding, truthful content, accessibility, and reliable behavior.
Use visual decisions to create character. Do not use invented facts to create richness.
</identity>

<authority>
Only fields marked owner_confirmed may appear in customer-facing source.
Suggestions, unknown fields, declined fields, raw-chat inferences, and model assumptions
may guide questions or internal design exploration but may not render.
Approved assets are limited to the asset manifest.
</authority>

<task>
Understand the visitor's job. Choose one primary path. Choose one visual direction that
is an aesthetic interpretation of the approved facts, not a new business assertion.
</task>

<design_rules>
Use hierarchy, grouping, whitespace, typography, semantic color roles, and responsive
constraints deliberately. Prefer clear conventions for navigation and controls. Make
business actions specific and point them to approved targets. Omit unsupported sections
instead of filling them with generic copy, proof, imagery, or promotional claims.
</design_rules>

<workflow>
Read the project references and existing design system. Extract the fact ledger. Ask a
focused owner question when a required fact is missing or conflicts. Record the chosen
direction. Generate against the schema. Run deterministic claim, asset, route, contrast,
reflow, and build checks. Review the rendered result at narrow and wide viewports. Repair
only the failed concern. Save the ledger, direction, source hash, and review evidence.
</workflow>

<output>
Return the structured direction, rendered fact IDs, omitted fact IDs, assumptions that
were rejected, gate results, visual review findings, and the next owner decision.
</output>

<stop_conditions>
Stop instead of guessing when authority is unclear, a claim has no source, an asset is
not approved, an action has no valid target, or a verification gate fails.
</stop_conditions>
```

### Use context as a budget

Anthropic's context-engineering guidance treats context as finite and recommends the smallest high-signal set that can support the task. It recommends a balance between brittle if-then instructions and vague aspirations, structured sections, canonical examples, progressive disclosure, and just-in-time retrieval. [S081]

For this system, that means:

- put invariant policies and the current accepted ledger near the task;
- load detailed design references only when the direction needs them;
- keep raw chat available for provenance and follow-up, not as an undifferentiated prompt dump;
- use file names, IDs, and snapshots as durable references;
- compress old turns without dropping accepted facts, rejected claims, unresolved conflicts, or verification results;
- give tools narrow contracts and token-efficient results.

Agent Skills makes the same case through progressive disclosure: short metadata first, full instructions only when relevant, then deeper reference files or scripts as needed. [S086] [S087]

### Prefer a simple workflow before an autonomous agent

Anthropic's agent research says simple, composable workflows often work better than complex frameworks. Prompt chaining, routing, parallel review, and evaluator-optimizer loops each have a use, but an autonomous agent adds cost and failure modes. [S080]

A sparse-data site generator has a natural sequence:

1. fact extraction and owner questions;
2. direction selection;
3. contract or schema generation;
4. source generation;
5. deterministic qualification;
6. rendering and browser review;
7. bounded repair;
8. owner acceptance and publish.

Use parallel agents for independent research or independent checks, not because more agents sound more capable. Anthropic reports that parallel research can help broad, separable questions, but also reports much higher token use and coordination costs. Those internal results are not a reason to parallelize every generation. [S083]

### Give tools and outputs clear contracts

Tool descriptions should explain purpose, parameters, examples, edge cases, and boundaries. Tools should return useful, compact context and make incorrect use difficult. Deterministic code should handle sorting, validation, path checks, and other operations that do not benefit from token generation. [S082] [S086]

Use structured output for facts, gates, and review records. Use natural language for design reasoning and owner questions. Do not require a model to place large source files inside deeply escaped JSON if a file artifact or a schema-backed object is safer.

### Version prompts and evaluate behavior

OpenAI recommends keeping production prompt builders in code, pinning model snapshots when repeatability matters, and building representative tests and evaluations before changing prompts. It also recommends explicit context boundaries, examples, and a clear output format, with the level of specificity adjusted for the model family. [S089] [S091]

Prompt changes should have:

- a version identifier;
- representative sparse-data fixtures;
- positive cases where a confirmed fact renders;
- negative cases where an unknown, suggested, declined, or unsupported value stays out;
- cases with missing imagery and no valid CTA fallback;
- route, build, contrast, reflow, and state checks;
- a human visual review for direction and specificity.

### Do not make visual evaluation the only judge

UICrit provides a useful vocabulary for critique, including layout, contrast, buttons, learnability, and readability. WebGen-Agent provides evidence that screenshot feedback and GUI-agent tests expose visual and interaction failures that execution-only feedback misses. Both support a layered review, not an automatic definition of taste. [S098] [S099]

Anthropic's evaluation guidance recommends deterministic graders where possible, model graders for open-ended dimensions, and human calibration for subjective judgments. It recommends testing both cases where a behavior should happen and cases where it should not. [S084]

For claim safety, "should not render" is a deterministic case. For distinctiveness, use a human rubric. Do not let a high visual score overrule a failed truth gate.

## 9. Evaluation plan

A practical evaluation suite should contain small, representative cases rather than a large collection of artificial prose.

### Mechanical checks

- Fact IDs in generated source all exist in the accepted ledger.
- Every rendered value has `owner_confirmed` permission.
- Unknown, declined, and suggested values never cross the render boundary.
- Unsupported claim scanning returns no match, including softened promotional variants.
- Business CTAs resolve to approved, non-placeholder targets.
- Approved asset paths resolve and unapproved embedded media is rejected.
- The generated app compiles, builds, and serves its expected routes.
- Contrast, visible focus, semantic labels, keyboard paths, and reduced-motion behavior pass.
- Narrow layouts reflow without two-dimensional reading scroll.
- Loading, error, empty, success, and unknown-route states remain truthful.

### Human review

Use a two-pass review:

1. **Usability and trust pass.** Review first-screen clarity, content order, CTA comprehension, labels, contact expectations, error recovery, and responsive behavior.
2. **Craft pass.** Review visual thesis, typography, spacing, rhythm, composition, domain fit, restraint, and whether the page feels specific without semantic overreach.

The reviewer should see the rendered site and the approved facts, but not rely on the generator's self-description. Ask the reviewer to identify the first three things they understand and the first three things they would change. This tests hierarchy without requiring a brittle screenshot comparison.

### Repeated-run reliability

For nondeterministic behavior, distinguish "passes at least once" from "passes consistently." Anthropic describes these as `pass@k` and `pass^k`. A site generator may care about both, but customer-facing truth and routing should use the consistency standard. A single lucky run is not enough for a claim gate. [S084]

### Evidence to retain

Keep the input fixture, ledger snapshot, direction, prompt and model version, generated source hash, gate output, browser evidence, human review, and final decision. If a later revision changes the direction, preserve the previous accepted record rather than silently overwriting it.

## 10. Contrarian views and tensions

### Minimalism can become generic

Removing content does not automatically create quality. NN/g's homepage guidance still asks sites to show what they do, reveal representative content, and prompt useful actions. A page with one vague sentence and a large blank field may be restrained, but it is not informative. Use confirmed facts as examples and let hierarchy make them legible. [S002] [S027] [S077]

### Whitespace is not a universal virtue

Negative space improves grouping and comprehension when it matches the content and task. Too much space can separate related items or force unnecessary scrolling. Dense operational work may need a tighter layout than an editorial landing page. Use audience, task, and content length to set density. [S006] [S021] [S024] [S062-S064]

### Novel navigation is usually a bad place to be original

NN/g and GOV.UK favor standards, consistency, and predictable paths. A distinctive type scale or content rhythm can coexist with an ordinary header and familiar links. Make people learn the business, not the navigation system. [S014] [S016] [S056] [S077]

### Photo-first guidance has a boundary

NN/g and OpenAI's frontend guidance value relevant imagery, and they reject generic decorative media. That does not mean every sparse business page should receive a generated or stock image. In a fact-controlled system, an image can imply a real product, facility, person, or capability. If no approved media exists, a typographic or abstract visual system can be more honest. [S007] [S077] [S090]

### Objective copy is not one fixed voice

The NN/g writing study found gains for concise, scannable, objective text in its test conditions. NN/g's tone research also says tone depends on audience, message, and brand. The right conclusion is to remove hype and make the facts easy to scan, then choose a human voice that fits the audience. [S009] [S078]

### More agents do not guarantee better design

Parallel agents can widen research, but they spend more tokens and create coordination problems. A single generator with a fact gate, a visual review, and a clean handoff may be safer than a group of agents that all improvise. [S080] [S083] [S085]

### Automated visual scores can reward the wrong thing

A model may prefer contrast, density, cards, imagery, or decoration because those patterns appear often in its examples. A visual score can detect blank screens, broken alignment, missing content, and obvious overlap. It cannot decide alone whether a motif is culturally appropriate, whether a photo implies an unsupported claim, or whether the page's restraint is intentional. [S084] [S098] [S099]

### Trust is not a badge checklist

Stanford lists contact information, organizational signals, and third-party support as credibility factors. That guidance assumes those signals are real. A generated badge or fabricated address is worse than their absence. Trust controls should expose actual evidence and actual contact routes, never fill a template slot. [S070]

## 11. Open questions

1. How can a reviewer measure distinctiveness without rewarding novelty for its own sake?
2. Which visual forms increase trust while carrying little unintended factual meaning?
3. How much confirmed content is enough for a useful page in different Indonesian business categories?
4. Which sparse-data layouts work best for visitors arriving from WhatsApp, search, or social links on low-end phones?
5. How should a ledger record the semantic risk of an approved asset, not only its file path?
6. Can a deterministic checker detect visual implications such as a map implying an address or a package mockup implying real packaging?
7. How should a system evaluate warm, local Indonesian language without equating professionalism with formal or promotional wording?
8. Which parts of visual review can a model grade reliably, and where do human reviewers disagree most often?
9. How can prompt and design-direction changes be evaluated without overfitting to one business, one model, or one visual trend?
10. What is the smallest durable snapshot that preserves enough context for a later agent without retaining noisy raw history?

## 12. Recommendations if implementation is reactivated

The research favors small, direction-level changes rather than a broad rewrite:

1. Keep the fact ledger and accepted handoff as separate authority layers.
2. Keep raw chat for provenance, not as automatic render permission.
3. Put the fact-to-form workflow and the stop conditions in the generator's system guidance.
4. Keep deterministic source, route, asset, accessibility, and build gates independent from model prose.
5. Keep visual review separate from release qualification, with the proposed rubric as a human checklist.
6. Persist direction, ledger, prompt version, source hash, and review evidence across retries and edits.
7. Use the research findings to refine examples and workflow instructions before adding new visual components or content fallbacks.

No implementation change was made as part of this research synthesis.
