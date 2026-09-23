import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { contracts, allChunks } from '../lib/documents/contracts';
import { retrieveRelevantChunks } from '../lib/documents/retrieval';
import { answerSchema, validateAnswer } from '../lib/agent/schema';
import {
  readToolSelection,
  recoverModelOutput,
} from '../lib/agent/model-validation';
import { executeTool } from '../lib/agent/tools';
import type { Claim } from '../lib/types';
import { callOpenRouter, DEFAULT_MODEL } from '../lib/agent/openrouter';
import { sealTicket, openTicket } from '../lib/server/analysis-ticket';
import {
  documentFromPages,
  validatePages,
  safeFilename,
} from '../lib/documents/ingestion';
import { summaryChunks } from '../lib/agent/tools';

void test('uploaded text preserves original page numbers, Unicode, stable IDs and warns about blank pages', () => {
  const doc = documentFromPages('upload_test', 'Review.pdf', [
    { page: 1, text: '' },
    {
      page: 2,
      text: 'Payment is due in 21 days. المبلغ مستحق خلال واحد وعشرين يوما.',
    },
  ]);
  assert.equal(doc.pages, 2);
  assert.equal(doc.chunks[0].page, 2);
  assert.equal(doc.chunks[0].sourceId, 'upload_test-p2-c1');
  assert.match(doc.warnings![0], /page 1/);
  assert.equal(safeFilename('../folder\\bad\u202e\u0000.pdf'), 'bad.pdf');
});
void test('PDF limits reject empty text, malformed page order, too many pages and excessive text', () => {
  assert.throws(() => validatePages([{ page: 1, text: '  ' }]), /PDF_NO_TEXT/);
  assert.throws(
    () => validatePages([{ page: 2, text: 'hello' }]),
    /PDF_INVALID/,
  );
  assert.throws(
    () =>
      validatePages(
        Array.from({ length: 26 }, (_, i) => ({ page: i + 1, text: 'words' })),
      ),
    /PDF_PAGES/,
  );
  assert.throws(
    () => validatePages([{ page: 1, text: 'x'.repeat(100001) }]),
    /PDF_TEXT_LIMIT/,
  );
});
void test('chunking never crosses pages and summaries cap context while covering first and last passages', () => {
  const doc = documentFromPages('upload_long', 'Long.pdf', [
    { page: 1, text: 'Alpha text '.repeat(3000) },
    { page: 2, text: 'Omega text '.repeat(3000) },
  ]);
  assert.ok(
    doc.chunks.every(
      (c) =>
        c.text.length <= 1600 &&
        !(c.text.includes('Alpha') && c.text.includes('Omega')),
    ),
  );
  assert.equal(
    new Set(doc.chunks.map((c) => c.sourceId)).size,
    doc.chunks.length,
  );
  const picked = summaryChunks(doc.chunks);
  assert.equal(picked.length, 18);
  assert.equal(picked[0], doc.chunks[0]);
  assert.equal(picked.at(-1), doc.chunks.at(-1));
});
void test('upload retrieval uses its own corpus and tools cannot access unselected IDs', () => {
  const a = documentFromPages('upload_a', 'Same.pdf', [
    {
      page: 1,
      text: 'Orion invoices are due Net 21 and annual fees are 7200 dollars.',
    },
  ]);
  const b = documentFromPages('upload_b', 'Same.pdf', [
    {
      page: 1,
      text: 'Other invoices are due Net 60 with fees of 900 dollars.',
    },
  ]);
  const hits = retrieveRelevantChunks('payment invoices', ['upload_a'], {}, [
    ...a.chunks,
    ...b.chunks,
  ]);
  assert.ok(hits.length);
  assert.ok(hits.every((c) => c.documentId === 'upload_a'));
  const result = executeTool(
    'summarize_document',
    { documentId: 'upload_a' },
    'Summarize',
    ['upload_a'],
    () => {},
    Date.now(),
    [a, b],
  );
  assert.deepEqual(result.sources, a.chunks);
  assert.throws(
    () =>
      executeTool(
        'summarize_document',
        { documentId: 'upload_b' },
        'Summarize',
        ['upload_a'],
        () => {},
        Date.now(),
        [a, b],
      ),
    /INVALID_TOOL/,
  );
});

void test('analysis continuations are encrypted and reject tampering and other secrets', async () => {
  const context = { question: 'payment', reasoning: 'private test context' };
  const ticket = await sealTicket(context, 'test-secret');
  assert.ok(!atob(ticket).includes('private test context'));
  assert.deepEqual(await openTicket(ticket, 'test-secret'), context);
  const modified =
    ticket.slice(0, 20) + (ticket[20] === 'A' ? 'B' : 'A') + ticket.slice(21);
  await assert.rejects(openTicket(modified, 'test-secret'), /INVALID_TICKET/);
  await assert.rejects(openTicket(ticket, 'wrong-secret'), /INVALID_TICKET/);
  await assert.rejects(openTicket('invalid', 'test-secret'), /INVALID_TICKET/);
});

void test('OpenRouter transport uses the chosen model, preserves tool reasoning and rejects incomplete answers', async () => {
  const message = {
    role: 'assistant',
    content: null,
    tool_calls: [
      {
        id: 'call-1',
        type: 'function',
        function: {
          name: 'search_documents',
          arguments: '{"query":"payment","documentIds":["acme"]}',
        },
      },
    ],
    reasoning_details: [{ type: 'reasoning.text', text: 'test fixture' }],
  };
  const fakeFetch: typeof fetch = async (url, init) => {
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
    const body = JSON.parse(init?.body as string);
    assert.equal(body.model, 'z-ai/glm-5.3-flash');
    assert.equal(body.reasoning.effort, 'low');
    assert.equal(body.provider.require_parameters, true);
    assert.equal(body.parallel_tool_calls, undefined);
    assert.ok(!JSON.stringify(body).includes('test-key'));
    assert.equal(
      new Headers(init?.headers).get('Authorization'),
      'Bearer test-key',
    );
    return Response.json({
      choices: [{ finish_reason: 'tool_calls', message }],
    });
  };
  const settings = { key: 'test-key', model: DEFAULT_MODEL };
  const signal = new AbortController().signal;
  assert.deepEqual(
    await callOpenRouter({ messages: [] }, signal, settings, fakeFetch),
    message,
  );
  await assert.rejects(
    callOpenRouter({}, signal, { model: DEFAULT_MODEL }, fakeFetch),
    /AI_NOT_CONFIGURED/,
  );
  for (const finish_reason of ['length', 'content_filter', 'error']) {
    await assert.rejects(
      callOpenRouter({}, signal, settings, async () =>
        Response.json({
          choices: [
            {
              finish_reason,
              message: { role: 'assistant', content: '{"partial":true}' },
            },
          ],
        }),
      ),
      /INVALID_MODEL_OUTPUT/,
    );
  }
});

void test('OpenRouter errors are mapped without exposing provider responses or keys', async () => {
  const settings = { key: 'test-key', model: DEFAULT_MODEL };
  for (const [status, code] of [
    [401, 'AI_AUTH_FAILED'],
    [402, 'AI_CREDITS_REQUIRED'],
    [404, 'AI_MODEL_UNAVAILABLE'],
    [429, 'AI_CAPACITY'],
    [500, 'AI_REQUEST_FAILED'],
  ] as const) {
    await assert.rejects(
      callOpenRouter(
        {},
        new AbortController().signal,
        settings,
        async () => new Response('private provider diagnostics', { status }),
      ),
      new RegExp(code),
    );
  }
  await assert.rejects(
    callOpenRouter({}, new AbortController().signal, settings, async () =>
      Response.json({ error: { message: 'private provider diagnostics' } }),
    ),
    /INVALID_MODEL_OUTPUT/,
  );
});

void test('the source corpus has three complete four-page contracts and stable unique IDs', () => {
  assert.equal(contracts.length, 3);
  assert.equal(
    new Set(allChunks.map((s) => s.sourceId)).size,
    allChunks.length,
  );
  for (const doc of contracts) {
    assert.deepEqual([...new Set(doc.chunks.map((s) => s.page))], [1, 2, 3, 4]);
    assert.ok(
      doc.chunks.every(
        (s) =>
          s.documentId === doc.documentId &&
          s.filename === doc.filename &&
          s.text.length > 400,
      ),
    );
  }
});
void test('payment retrieval finds all three actual payment clauses', () => {
  const hits = retrieveRelevantChunks('What are the payment terms?', [
    'acme',
    'nova',
    'apex',
  ]);
  for (const id of ['acme', 'nova', 'apex'])
    assert.ok(hits.some((s) => s.sourceId === `${id}-p2-payment`));
});
void test('risk comparison preserves cancellation, renewal, liability and SLA evidence', () => {
  const hits = retrieveRelevantChunks(
    'Compare the termination and payment terms and highest risk',
    ['acme', 'nova', 'apex'],
    { broad: true },
  );
  for (const id of ['acme', 'nova', 'apex'])
    for (const suffix of [
      'p2-payment',
      'p3-termination',
      'p3-renewal',
      'p4-liability',
      'p4-sla',
    ])
      assert.ok(hits.some((s) => s.sourceId === `${id}-${suffix}`));
});
void test('search scopes documents and reports no evidence for an unrelated topic', () => {
  assert.ok(
    retrieveRelevantChunks('liability cap', ['nova']).every(
      (s) => s.documentId === 'nova',
    ),
  );
  assert.deepEqual(
    retrieveRelevantChunks('photosynthesis chlorophyll', ['nova']),
    [],
  );
});
void test('summary tool returns the full named document and emits actual search events', () => {
  const events: unknown[] = [];
  const result = executeTool(
    'summarize_document',
    { documentId: 'nova' },
    'Summarize NovaCloud',
    ['acme', 'nova', 'apex'],
    (e) => events.push(e),
    Date.now(),
  );
  assert.equal(result.sources.length, 8);
  assert.ok(result.sources.every((s) => s.documentId === 'nova'));
  assert.equal(events.length, 3);
  assert.throws(() =>
    executeTool('shell', {}, '', ['nova'], () => {}, Date.now()),
  );
  assert.throws(() =>
    executeTool(
      'summarize_document',
      { documentId: 'apex' },
      '',
      ['nova'],
      () => {},
      Date.now(),
    ),
  );
});
const claim: Claim = {
  evidence: 'supported',
  text: 'Invoices are due Net 15.',
  sourceIds: ['nova-p2-payment'],
};
const valid = () => ({
  summary: claim,
  documents: [],
  findings: [{ title: 'Payment', claim }],
  highestRiskDocumentId: null,
  recommendation: claim,
});
void test('citations are hydrated exclusively from retrieved canonical metadata', () => {
  const answer = validateAnswer(
    valid(),
    allChunks,
    ['nova'],
    'search_documents',
  );
  assert.equal(answer.sources.length, 1);
  assert.equal(answer.sources[0].page, 2);
  assert.equal(answer.sources[0].filename, 'NovaCloud Services Agreement');
});
void test('rejects invented sources, missing comparison rows, malformed claims and cross-document citations', () => {
  assert.throws(() =>
    validateAnswer(
      { ...valid(), summary: { ...claim, sourceIds: ['nova-p99-secret'] } },
      allChunks,
      ['nova'],
      'search_documents',
    ),
  );
  assert.throws(() =>
    validateAnswer(
      { ...valid(), summary: { ...claim, sourceIds: [] } },
      allChunks,
      ['nova'],
      'search_documents',
    ),
  );
  assert.throws(() =>
    validateAnswer(valid(), allChunks, ['nova'], 'compare_documents'),
  );
  assert.throws(() =>
    validateAnswer(
      {
        ...valid(),
        documents: [
          {
            documentId: 'acme',
            paymentTerms: claim,
            terminationTerms: claim,
            renewalTerms: claim,
            liability: claim,
            riskLevel: 'high',
            riskReason: claim,
          },
        ],
      },
      allChunks,
      ['acme', 'nova'],
      'compare_documents',
    ),
  );
});
void test('absence of evidence is allowed only with explicit uncertainty', () => {
  const absent = {
    evidence: 'not_found',
    text: 'Not found in the retrieved passages.',
    sourceIds: [],
  };
  const answer = validateAnswer(
    { ...valid(), summary: absent, recommendation: absent, findings: [] },
    allChunks,
    ['nova'],
    'search_documents',
  );
  assert.equal(answer.sources.length, 0);
});
void test('a single-document answer never presents a highest-risk ranking', () => {
  const answer = validateAnswer(
    {
      ...valid(),
      highestRiskDocumentId: 'nova',
      documents: [
        {
          documentId: 'nova',
          paymentTerms: claim,
          terminationTerms: claim,
          renewalTerms: claim,
          liability: claim,
          riskLevel: 'medium',
          riskReason: claim,
        },
      ],
    },
    allChunks,
    ['nova'],
    'search_documents',
  );
  assert.equal(answer.highestRiskDocumentId, null);
});
void test('provider-echoed source IDs are removed from prose without losing structural citations', () => {
  const answer = validateAnswer(
    {
      ...valid(),
      summary: {
        evidence: 'supported',
        text: 'Invoices are due Net 15 (nova-p2-payment).',
        sourceIds: ['nova-p2-payment'],
      },
    },
    allChunks,
    ['nova'],
    'search_documents',
  );
  assert.equal(answer.summary.text, 'Invoices are due Net 15.');
  assert.deepEqual(answer.summary.sourceIds, ['nova-p2-payment']);
  assert.equal(answer.sources[0].page, 2);
});

void test('natural missing-information answers use explicit evidence status without fabricated citations', () => {
  for (const text of [
    'The supplied excerpts contain no bank account or routing details.',
    'No banking instructions appear in the material returned by the search.',
    'Contact the provider for details that these excerpts do not supply.',
  ]) {
    const absent = { text, sourceIds: [], evidence: 'not_found' };
    const answer = validateAnswer(
      { ...valid(), summary: absent, recommendation: absent, findings: [] },
      allChunks,
      ['acme', 'nova', 'apex'],
      'search_documents',
    );
    assert.equal(answer.summary.text, text);
    assert.equal(answer.sources.length, 0);
    assert.throws(() =>
      validateAnswer(
        { ...valid(), summary: { ...absent, evidence: 'supported' } },
        allChunks,
        ['nova'],
        'search_documents',
      ),
    );
    assert.throws(() =>
      validateAnswer(
        { ...valid(), summary: { ...absent, sourceIds: ['nova-p2-payment'] } },
        allChunks,
        ['nova'],
        'search_documents',
      ),
    );
  }
});
void test('zero-hit retrieval is a valid tool result and uses a schema that forbids citations', () => {
  const result = executeTool(
    'search_documents',
    { query: 'chlorophyll photosynthesis', documentIds: ['nova'] },
    'chlorophyll photosynthesis',
    ['nova'],
    () => {},
    Date.now(),
  );
  assert.deepEqual(result.sources, []);
  const schema = answerSchema([], ['nova']);
  assert.equal(schema.properties.summary.properties.sourceIds.maxItems, 0);
  const absent = {
    text: 'No matching passages were returned.',
    evidence: 'not_found',
    sourceIds: [],
  };
  assert.equal(
    validateAnswer(
      { ...valid(), summary: absent, recommendation: absent, findings: [] },
      [],
      ['nova'],
      'search_documents',
    ).sources.length,
    0,
  );
  assert.throws(() =>
    validateAnswer(valid(), [], ['nova'], 'search_documents'),
  );
});
void test('malformed tool arguments and unselected IDs are rejected before retrieval', () => {
  const make = (args: string) => ({
    role: 'assistant' as const,
    content: null,
    tool_calls: [
      {
        id: 'call',
        type: 'function' as const,
        function: { name: 'search_documents', arguments: args },
      },
    ],
  });
  for (const args of ['not JSON', 'null', '[]', '{"documentIds":["acme"]}'])
    assert.throws(
      () => readToolSelection(make(args), ['nova']),
      /INVALID_TOOL/,
    );
  assert.deepEqual(
    readToolSelection(make('{"documentIds":["nova"],"query":"payment"}'), [
      'nova',
    ]).args.documentIds,
    ['nova'],
  );
});
void test('model repair succeeds once, shares its budget across phases and never retries service failures', async () => {
  const budget = { used: false };
  let calls = 0,
    retries = 0;
  const result = await recoverModelOutput(
    async (repair) => {
      calls++;
      if (!repair) throw new SyntaxError('test malformed JSON');
      return 'valid';
    },
    budget,
    () => retries++,
  );
  assert.equal(result, 'valid');
  assert.equal(calls, 2);
  assert.equal(retries, 1);
  await assert.rejects(
    recoverModelOutput(
      async () => {
        calls++;
        throw new Error('INVALID_MODEL_OUTPUT');
      },
      budget,
      () => retries++,
    ),
    /INVALID_MODEL_OUTPUT/,
  );
  assert.equal(calls, 3);
  assert.equal(retries, 1);
  const fresh = { used: false };
  await assert.rejects(
    recoverModelOutput(
      async () => {
        throw new Error('AI_CREDITS_REQUIRED');
      },
      fresh,
      () => retries++,
    ),
    /AI_CREDITS_REQUIRED/,
  );
  assert.equal(fresh.used, false);
});
