# AI Document Intelligence Agent

Live demo: [https://ai-document.ramzy.tech/](https://ai-document.ramzy.tech/)


Public Site: https://ai-document-intelligence-agent.mina299222.chatgpt.site

**AI activated:** OpenRouter is configured as a Sites server secret with `z-ai/glm-5.3-flash`. See `QA.md` for live verification and limitations.

A React/TypeScript portfolio demo hosted as one ChatGPT Site. Three fictional four-page contracts support source-grounded comparison, Q&A and summaries. No visitor account or visitor API key is required .

## Architecture

Site UI → AI Agent → Agent Tools → Document Retrieval → Source Chunks → OpenRouter / GLM-5.3-Flash → Structured Response + Citations

- **UI:** React 19 in the native Vinext starter; accessible Shadcn source drawer and comparison table. Responsive document and activity panels. The current conversation is transient and clears on refresh; a device-local flag reloads the immutable demo corpus.
- **Server:** Sites' managed Cloudflare Worker runs the route handlers. No separately deployed backend, localhost dependency, managed-by-user database, container or worker process.
- **Sources:** `lib/documents/contracts.ts` is the immutable demo corpus: 3 agreements, 12 authored pages, 24 passages. Downloadable PDFs in `public/demo` match those exact pages. Uploaded PDFs are extracted by PDF.js in a browser Web Worker; page text is validated and split into bounded, overlapping chunks on the Sites server. Every chunk has a server-generated source ID, document ID, filename, original page number, section and text. The same canonical chunks power retrieval and the source viewer.
- **Retrieval:** `retrieveRelevantChunks(query, documentIds)` uses BM25-style lexical ranking, section boosts, commercial-topic synonyms and per-document coverage. Comparison broadens retrieval to retain payment, termination, renewal, liability and SLA context. This is lexical RAG, not vector search. There is no external vector service. Replace this interface to adopt semantic retrieval later.
- **Agent:** A real OpenRouter Chat Completions function call selects `search_documents`, `summarize_document` or `compare_documents`. Server-side tools enforce allowed document IDs. A second model request consumes the actual tool result and returns strict JSON-schema output. Normally two model calls, with one shared recovery attempt for malformed tool arguments or invalid answer output (three calls maximum). No multi-agent framework or background jobs.
- **Grounding:** Each claim explicitly declares supported evidence or information not found. Supported claims require retrieved source IDs; absence statements use no fabricated citations and do not depend on a particular phrase. Empty searches still receive a real model response that explains the evidence limitation. Runtime validation rejects missing material citations, invented references, wrong-document citations and incomplete comparison rows. Canonical metadata supplies page numbers and filenames; the model cannot author that metadata. These checks establish citation integrity, not a guarantee that every interpretation is correct. The UI asks readers to verify the evidence.
- **Activity:** Two bounded requests separate real tool selection/retrieval from model synthesis. Sites buffers streamed bodies, so the UI displays the actual retrieval results before making the answer request. No artificial timers or prerecorded results are used. An AES-GCM encrypted, five-minute continuation carries the server-generated context between requests; model reasoning never appears in plaintext in browser responses. No background worker or new database table is needed.
- **Storage:** Sites-managed D1 holds usage counters and private upload metadata/chunks; Sites-managed R2 holds original PDFs. An unpredictable HttpOnly, Secure, SameSite cookie identifies the browser session, hashed in storage. Every list, download, removal and analysis checks ownership and expiry; encrypted continuations are also session-bound for uploads. No public object URLs are exposed. Prepared conditional statements enforce 8 analysis phase requests/minute, 40/hour per hashed IP and 300/day globally (normally 4, 20 and 150 analyses). Uploads have separate 20/hour per-IP and 100/day global limits. Raw IPs are not stored. Limits are fixed-window portfolio safeguards, not enterprise abuse prevention.
- **Secrets:** `OPENROUTER_API_KEY` is read only in server modules from Sites runtime secrets. `OPENROUTER_MODEL` defaults to `z-ai/glm-5.3-flash`. Requests prioritize provider throughput and require support for tools and structured output; low reasoning effort is used because this model requires reasoning. Reasoning details are preserved across the tool round trip but never sent to the UI; no secrets are sent to browser code. No native model capability was documented in the inspected Sites starter/add-ons, so the supported HTTP API path is used.
- **Safety:** 1,200-character questions, 30 KB request-body cap (including encrypted continuation tokens), same-origin browser requests, fixed document allowlist, request timeout, server-only provider URL, model-output validation and user-facing retry states. Source text and user input are treated as untrusted. React escapes rendered model text. Each question is independent; previous conversation turns are not sent to the model.

## Development

Install with the existing npm lockfile. `npm run dev` runs the Sites development environment. `npm run build` creates the managed Worker and client assets. `npm run db:generate` creates Drizzle migrations, which Sites applies during deployment. `npm test` checks source integrity, retrieval coverage, tool constraints and citation validation. `npm run typecheck` verifies TypeScript.

Create or reuse an OpenRouter API key at https://openrouter.ai/settings/keys, then set `OPENROUTER_API_KEY` as a secret through Sites environment settings. A new deployment applies the environment revision. Do not enter keys into public app forms or commit local environment files. The app explicitly reports an activation requirement when the secret is missing; it never substitutes hardcoded AI answers.

## Deployment

The existing `.openai/hosting.json` identifies this Site and declares managed `DB` and `FILES` bindings. Append-only Drizzle migrations provision metadata tables. Use the Sites build, source push, version save and production deployment flow. Package compiled output with the Sites packaging helper. Public access must be set through Sites. All frontend API URLs are relative to the deployed origin.

## Product tour

A six-step onboarding dialog introduces document selection, questions, real agent activity, citations and PDF uploads. It appears on the first visit and can be replayed from **Product tour**. A versioned local preference remembers dismissal; unavailable browser storage does not prevent use. The tour uses the existing accessible dialog primitive for focus containment, Escape and focus return, with responsive control highlights and a scrollable mobile card. The citation exercise retrieves an actual public demo passage. Only **Load demo contracts** changes the selected corpus, and only **Start demo analysis** starts AI processing; ordinary navigation and dismissal preserve the conversation. Existing uploads are retained. Demo and example fetch failures offer recovery without trapping the visitor.

## PDF upload behavior

Upload or drop up to 5 PDFs, then select up to 3 documents per question. Demo documents remain available and demo suggestions explicitly select the demo corpus. The first upload selects uploaded documents instead of silently analyzing the demos. Identical bytes in the same session deduplicate; identical filenames with different content remain separate. Uploads survive refresh in that browser for 24 hours. Conversations are transient. Clearing cookies loses access; there is no cross-device recovery or account system.

Limits: 10 MB, 25 pages and 100,000 extracted characters per PDF. Password-protected, invalid, empty, image-only, over-limit and timed-out files receive actionable errors. Partial text extraction warns about pages without text. Scanned pages need OCR before upload; OCR is not included. Multi-column layouts, unusual font encodings, figures and tables may lose reading order or content during text extraction. The original PDF remains downloadable for verification. Summaries use up to 18 representative passages and comparisons up to 6 per document; the model is instructed to disclose limited coverage and unreadable pages.

Extraction runs locally to avoid consuming the Sites Worker memory budget. The browser sends original bytes plus extracted text; the server validates size, signature, page shape and text bounds, then generates canonical chunk/citation metadata. Submitted extraction is **untrusted user content**, not a server-verified transcription of the PDF. Neither document instructions nor filenames grant tool access or override server ownership checks. Only selected retrieved text is sent to OpenRouter for analysis. The original PDF is stored privately within Sites. PDF.js worker, character maps and standard fonts are bundled locally by `scripts/pdf-assets.mjs` during builds; there is no PDF CDN dependency.

Expired uploads become inaccessible after 24 hours. Physical R2/D1 cleanup runs in bounded batches on upload/list requests, so byte deletion is opportunistic rather than guaranteed exactly at expiry. Removal immediately revokes access and deletes the object and metadata; interrupted saves retain pending metadata for cleanup. No scheduled worker or external infrastructure is required.

## Acceptance checklist

Open the production URL anonymously, load all three contracts, select the payment/termination comparison, observe activity, verify a grounded table and risk assessment, click citations, inspect matching source text, reload, try summary and liability prompts, and check mobile layout. Also verify missing-key and malformed-input errors without exposing stack traces. See `QA.md` for the actual test status and any remaining activation dependency.

## Production evolution

A larger installation could replace the retrieval and storage adapters with FastAPI, PostgreSQL, pgvector, Redis, worker queues and object storage for extraction, embeddings, tenant isolation and durable audit trails. None of those services is implemented or required by this hosted demo.

OpenRouter integration references: https://openrouter.ai/docs/guides/features/tool-calling and https://openrouter.ai/docs/guides/features/structured-outputs. Model availability and capabilities were verified against https://openrouter.ai/api/v1/models on September 5, 2026. No automatic model substitution is configured.


