# Verification record

## PDF upload release — September 5, 2026

Tested on the actual public Sites URL with PDF.js in the browser and native Sites D1/R2 storage:

- A new two-page fictional Orion PDF uploaded through the file chooser; source text retained original page numbers and selected the upload instead of demo contracts.
- Real OpenRouter/GLM Q&A correctly reported Net 21, USD 7,200/year and 14-day termination notice. Actual retrieval appeared before synthesis. Clicking its citation opened and highlighted the correct page-2 passage.
- Comparing two uploaded PDFs (Orion and an uploaded Acme PDF) produced two grounded rows, correctly contrasting Net 21/Net 30 and the different convenience-termination provisions. Citations used upload IDs and actual uploaded page text, not demo IDs.
- Password-protected, image-only, damaged, 26-page and oversized PDFs each produced the intended actionable error without disturbing earlier documents. A 25-page PDF succeeded. A partly readable two-page PDF succeeded with an explicit warning about its blank second page.
- Selecting a fourth document was blocked with a clear explanation. The fifth private upload succeeded, the sixth was rejected without losing the successful upload.
- Direct public API checks: identical bytes deduplicated to the existing document ID; same-session listing restored the document; original PDF download was byte-identical; another session could neither list, download nor analyze it; missing session, foreign origin and unsupported request content type were rejected. Removal revoked downloads and repeated removal remained safe. Test-created API uploads were removed.
- The three downloadable four-page demo PDFs were checked against every canonical source page; a rendered sample was visually inspected.
- Empty and renamed non-PDF files were rejected; retrying an existing PDF at full capacity still deduplicated successfully. Browser refresh restored all five uploads. The blank-page source view explicitly explained why no passage was available.
- A fresh upload after the final storage changes succeeded. A non-contract summary correctly returned its USD 850 budget and explicitly disclosed the unreadable second page. Single-document output used “Assessment”, not a spurious highest-risk label. Canonical source IDs echoed into prose by the provider are now stripped while retaining the structural citations.
- Original three-contract comparison retest: one generated response was rejected by source validation; the visible retry action produced all three comparison rows and a NovaCloud highest-risk assessment. Row-specific citation instructions were tightened; validation still rejects invalid output rather than rendering it. All temporary browser test uploads were removed afterward.
- Final anonymous public API check after citation refinements: homepage and demo load passed, real retrieval completed at 22.1 seconds, full comparison at 31.9 seconds, three rows and 14 citations exactly matching canonical records, NovaCloud assessed highest risk. The upload allowance was subsequently increased to 20/hour per IP to accommodate trials/replacements; storage and global limits remain bounded.
- Seventeen automated checks cover chunk/page boundaries, Unicode, filename sanitization, text/page limits, scoped upload retrieval, bounded summaries, citation integrity, tool restrictions, encrypted tickets and AI transport errors. Authored-source lint, TypeScript and production build pass.

Limits: OCR, layout-perfect table extraction, file-virus scanning, cross-device recovery, induced storage outages, provider outages and a real 24-hour expiry soak are not covered. Expiry is enforced at every read/analysis; physical cleanup is opportunistic. Summaries of long PDFs use representative passages, not guaranteed exhaustive coverage. Client extraction is treated as untrusted submitted text, not a server-attested PDF transcription. No real client documents were used in testing.

## Public deployment — September 5, 2026

Public URL: https://ai-document-intelligence-agent.mina299222.chatgpt.site

OpenRouter is activated using a Sites server secret with model `z-ai/glm-5.3-flash`. No API credential is present in project source or client assets.

- Anonymous homepage request: HTTP 200, no sign-in redirect.
- Load Demo Contracts in the production browser: all three agreements loaded, 12 source pages total.
- Primary comparison in the production browser: real model answer, three comparison rows, qualitative risk recommendation, clickable citations.
- Repeated primary comparison through the public API: retrieval available at 7.2 seconds; validated answer at 23.0 seconds; selected `compare_documents`, 18 retrieved chunks, 15 canonical source records used, NovaCloud assessed highest risk.
- Summary through the public API: selected `summarize_document`, retrieved only NovaCloud's eight chunks; answer at 9.5 seconds; all eight source records matched the canonical corpus.
- Payment Q&A through the public API: selected `search_documents`, 12 retrieved chunks; answer at 19.7 seconds; all 11 used source records matched the canonical corpus.
- Production browser: liability suggested prompt generated a new comparison covering the caps and customer exposure.
- Production browser: a model-generated NovaCloud termination citation opened the exact stored termination text on page 3, with the cited section emphasized.
- Production browser: refresh restored all three contracts; a subsequent suggested question worked.
- Malformed empty question: HTTP 400.
- Eleven automated checks pass, including retrieval coverage, tool scope, citation identity, provider errors, and encrypted continuation tampering/wrong-key rejection. TypeScript, authored-source lint and production build passed.
- Final client bundle scan: no API key variable, credential prefix, provider API URL, bearer credential or localhost string.
- Successful live requests exercised the hosted D1 quota service. Maximum-window quota exhaustion was not load-tested against the public demo.

## Runtime adaptation

Initial attempts exposed a 95-second model timeout and buffered streamed responses. Throughput-prioritized routing, focused retrieval and concise synthesis improved the measured comparison. The final application uses two real, bounded HTTP requests: tool selection/retrieval first, then answer generation. This makes actual evidence available before synthesis completes without depending on streaming or background workers. A five-minute AES-GCM encrypted continuation preserves context between phases; plaintext model reasoning is not sent to the browser. Both phases count toward the shared usage limits.

## Missing-information regression — version 10, September 5, 2026

- Fixed empty retrieval being treated as an exception, and replaced phrase-dependent absence validation with explicit evidence status. Supported claims still require canonical retrieved references. One shared recovery attempt handles malformed model output across both phases.
- All 21 automated checks, TypeScript, authored-source lint and production build passed before publication.
- Deployed source `92b5fe88ab93d1b505f0f1d0747e61091022ae6d` as version 10 on the existing public URL, retaining environment revision 2.
- The exact reported banking question completed through the public API and the browser. It reported no account/routing numbers found and cited existing payment sections and Acme's bank-detail-change restriction. No account numbers were invented. The API run completed in 17.5 seconds; source records matched the immutable corpus.
- The browser citation opened Acme page 2 and the exact suspension/invoice-remedies passage. Real search and validation activity completed successfully.
- Positive payment Q&A completed in 13.0 seconds with Net 30/15/45 and nine canonical source records.
- Original three-contract comparison completed in 16.7 seconds with three rows, 16 canonical citations and NovaCloud highest risk.
- Exact query `photosynthesis chlorophyll` retrieved zero passages and completed with a real model answer, explicit not-found evidence and zero citations. A longer unrelated question also completed successfully.
- Model wording remains variable: mixed statements can combine absence with cited related facts, and some outputs overgeneralize beyond retrieved coverage. Structural checks validate reference identity, not semantic entailment or exhaustive absence. Provider outages and repeated stochastic failures remain possible; no hardcoded answers were introduced.

## Product tour — September 9, 2026

- Published version 11 from source `8ed9b1efc20cccc716903fe4491aa7dee56e5041`, retaining the same public custom domain and AI environment.
- A six-step tour covers purpose, selection, questions, activity, citations and uploads. First-visit welcome, optional demo loading, a canonical source exercise, dismiss/replay, and an explicit live-demo action are implemented without dependencies or storage migrations.
- TypeScript, tour/workbench lint, all 21 existing regression checks and the production build passed.
- Local browser confirmed automatic welcome, readable narrow-screen card, focus on the dialog heading, navigation to document selection and the actual loading state. The browser connection then disappeared, so complete interactive traversal, viewport resize, Escape/focus return, persistence after refresh and the final tour button were not independently verified in the browser. These remain browser QA limitations, not claimed passes.
- Public custom-domain check returned the new Product tour control and existing upload controls. Demo retrieval succeeded; a real comparison completed in 27.7 seconds with three rows, 12 citations exactly matching canonical source records and NovaCloud assessed highest risk.

## General limitations

Measured timings are individual test observations, not latency guarantees. Citation validation guarantees references map to stored passages, not that every AI interpretation is correct. The model can still overgeneralize or omit qualifications; readers must check the source passages. Provider outages, exhausted credits, and broad load/soak testing were not induced against the active credential. Error mapping and malformed-output rejection have automated coverage.
