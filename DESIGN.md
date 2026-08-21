# Koma design system

Koma uses a Hallmark-inspired **atmospheric workbench** system: the product interface is the visual center, not a SaaS marketing shell.

## Design intent

- Audience: people turning video into summaries, structured data, subtitles, reports, and reusable files.
- Primary job: submit a video, specify the extraction, and inspect/reopen the result with minimal ceremony.
- Tone: technical, restrained, nocturnal, operator-focused.
- Macrostructure: asymmetric workbench. A compact explanatory rail sits beside a dominant analysis panel.

## Tokens

The implementation lives in `src/client/hallmark.css` and must remain token-driven.

- Background: near-black green-neutral.
- Panels: low-contrast raised surfaces, separated mainly by hairline borders rather than shadows.
- Accent: Koma acid-lime. Use it for active state, focus, progress, and key status only.
- Danger: warm red reserved for destructive or failed states.
- Display type: system display sans.
- Body type: Geist/system sans.
- Technical metadata: system monospace.
- Spacing: 4px base scale.
- Radius: restrained, generally 5–12px. Avoid pill-shaped containers except when semantically necessary.

## Interaction rules

- Keep motion to opacity and transform.
- Keep UI motion short and quiet; no bounce or overshoot.
- `:focus-visible` must remain obvious.
- Respect `prefers-reduced-motion`.
- Interactive labels should stay on one line on mobile.
- Never introduce horizontal page scrolling; use `overflow-x: clip`.

## Anti-patterns

Do not drift back toward generic AI/SaaS styling:

- no gradient hero backgrounds or glowing radial blobs;
- no oversized marketing hero competing with the actual analysis form;
- no rows of decorative feature cards when the workbench itself demonstrates the product;
- no fake browser/IDE chrome;
- no gratuitous all-caps section kickers;
- no invented metrics or social proof;
- no excessive floating shadows or pill containers;
- no italic display headings.

## Product consistency

The public app, history dialogs, result pages, and administration console share the same tokens. Dense admin surfaces can be more utilitarian, but they should not become a separate visual product.

Preserve routes, copy intent, analysis behavior, ownership rules, provider configuration, and data contracts when changing presentation.
