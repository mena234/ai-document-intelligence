# AI Document Intelligence

An AI workspace for asking questions about PDFs, comparing documents, and generating summaries with page-level source citations. Start with three fictional contracts or upload text-based PDFs.

**[Open the live demo](https://ai-document.ramzy.tech/)** · [Developer guide](DEVELOPMENT.md)

## What you can explore

- Document summaries, questions and answers, and side-by-side contract comparisons.
- Clickable citations that open the passage supporting an answer.
- Visible retrieval and analysis activity, plus a guided product tour.
- Browser-session uploads with private storage and a 24-hour access window.

## Try the demo

1. Open the demo and select **Load demo contracts**.
2. Try a suggested comparison or ask about payment and termination terms.
3. Open a citation and compare the answer with the original source passage.

## Technology

React, TypeScript, Vinext, Tailwind CSS, shadcn/ui, PDF.js, OpenRouter, Drizzle, Cloudflare Workers, D1, and R2.

## Run locally

Use Node.js 24 and npm. A local copy needs your own server-side OpenRouter key and initialized local D1 storage. The hosted demo does not require visitors to supply a key.

```sh
git clone https://github.com/mena234/ai-document-intelligence.git
cd ai-document-intelligence
npm ci
npm run build
```

Copy `.env.example` to an ignored `.env` file and supply `OPENROUTER_API_KEY`. Then initialize a **new local database** using the two committed migrations:

```sh
npx wrangler d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_medical_shotgun.sql
npx wrangler d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_moaning_stepford_cuckoos.sql
npx wrangler dev --config dist/server/wrangler.json --persist-to .wrangler/state --env-file .env --ip 127.0.0.1 --port 8787
```

Open **http://127.0.0.1:8787/**. If Wrangler cannot locate `.env`, pass its absolute path. D1 and R2 are emulated locally. The generated configuration declares `DB` and `FILES`; it is a Worker application, so serving static files alone is insufficient. An absent key produces a configuration message rather than a generated answer.

## Checks

```sh
npm test
npm run typecheck
npm run build
```

## Scope and limitations

AI interpretations still need source review. OCR is not included: scanned PDFs need text extraction first. Upload limits are 5 PDFs per session, 10 MB and 25 pages per file, and up to 3 selected documents per question. Chat history clears on refresh; uploads remain accessible in the same browser for 24 hours. Selected document text is sent to OpenRouter for analysis. Shared usage limits can temporarily prevent requests.

## More detail

The [developer guide](DEVELOPMENT.md) explains retrieval, citations, storage, upload handling, and deployment. [QA.md](QA.md) records earlier verification and limitations.
