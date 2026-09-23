'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { PdfUploader } from './pdf-uploader';
import { ProductTour } from './product-tour';
import {
  Activity,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Check,
  ChevronRight,
  FileSearch,
  Files,
  FileText,
  GitCompareArrows,
  LoaderCircle,
  RotateCcw,
  ScanText,
  ShieldCheck,
  X,
  Trash2,
  Download,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type {
  ActivityEvent,
  Answer,
  Claim,
  Contract,
  SourceChunk,
} from '@/lib/types';
const shortName = (id: string, filename?: string) =>
  id === 'nova'
    ? 'NovaCloud'
    : id === 'acme'
      ? 'Acme'
      : id === 'apex'
        ? 'Apex'
        : filename || 'Uploaded document';
const mergeDocs = (current: Contract[], added: Contract[]) =>
  Array.from(
    new Map([...current, ...added].map((d) => [d.documentId, d])).values(),
  );
const prompts = [
  {
    label: 'Compare payment and termination terms',
    question:
      'Compare the termination and payment terms across these contracts and tell me which contract presents the highest risk.',
    icon: GitCompareArrows,
  },
  {
    label: 'Which contract has the highest risk?',
    question:
      'Which contract has the highest risk for the customer? Consider payment, termination, renewal, liability and SLA obligations.',
    icon: ShieldCheck,
  },
  {
    label: 'Compare liability clauses',
    question:
      'Compare liability clauses across these contracts, including caps, exclusions and customer exposure.',
    icon: FileSearch,
  },
  {
    label: 'Summarize the NovaCloud agreement',
    question: 'Summarize the NovaCloud contract.',
    icon: ScanText,
  },
];
type Turn = { id: string; question: string; answer?: Answer; error?: string };
function requestError(error: unknown) {
  if (error instanceof Error && error.name === 'TimeoutError')
    return 'This analysis took too long. Please try again.';
  return error instanceof Error
    ? error.message
    : 'The request could not be completed. Please retry.';
}
function ActivityPanel({
  events,
  hits,
  openSource,
}: {
  events: ActivityEvent[];
  hits: SourceChunk[];
  openSource: (s: SourceChunk) => void;
}) {
  return (
    <>
      <div className="panel-title">
        <span>
          <Activity size={16} /> Agent Activity
        </span>
        <span className="count">
          {events.some((e) => e.status === 'error')
            ? 'STOPPED'
            : events.some((e) => e.status === 'running')
              ? 'LIVE'
              : events.length
                ? 'DONE'
                : 'READY'}
        </span>
      </div>
      <p className="activity-intro">
        Follow the agent from question to evidence.
      </p>
      {!events.length ? (
        <div className="activity-empty">
          <GitCompareArrows size={29} strokeWidth={1.2} />
          <h3>Ready when you are</h3>
          <p>
            Ask a question to see which documents the agent searches and the
            passages it uses.
          </p>
        </div>
      ) : (
        <div className="activity-list" role="log" aria-label="Agent operations">
          {events.map((e) => (
            <div key={e.id} className={`activity-step ${e.status}`}>
              <span className="step-mark">
                {e.status === 'running' ? (
                  <LoaderCircle className="spin" size={12} />
                ) : e.status === 'error' ? (
                  <X size={12} />
                ) : (
                  <Check size={12} />
                )}
              </span>
              <div>
                {e.label}
                {e.detail && <small>{e.detail}</small>}
              </div>
            </div>
          ))}
        </div>
      )}
      {!!hits.length && (
        <>
          <p className="retrieval-heading">
            RETRIEVED PASSAGES · {hits.length}
          </p>
          {hits.map((s) => (
            <button
              className="retrieval-hit"
              key={s.sourceId}
              onClick={() => openSource(s)}
            >
              <strong>
                {shortName(s.documentId, s.filename)} · {s.section}
                <span>p. {s.page}</span>
              </strong>
              <p>{s.text}</p>
            </button>
          ))}
        </>
      )}
    </>
  );
}
function AnswerView({
  answer,
  openSource,
}: {
  answer: Answer;
  openSource: (s: SourceChunk) => void;
}) {
  const name = (id: string) =>
    shortName(id, answer.sources.find((s) => s.documentId === id)?.filename);
  const citation = (id: string) => {
    const s = answer.sources.find((x) => x.sourceId === id);
    return s ? (
      <button
        key={id}
        className="citation"
        onClick={() => openSource(s)}
        aria-label={`Open ${s.filename}, page ${s.page}, ${s.section}`}
      >
        <FileText size={10} />
        {name(s.documentId)}, p. {s.page}
      </button>
    ) : null;
  };
  const claim = (c: Claim) => (
    <>
      {c.text}
      <span className="claim-citations"> {c.sourceIds.map(citation)}</span>
    </>
  );
  return (
    <article className="answer" data-tour="answer">
      <div className="answer-brand">
        <ScanText size={22} /> Document Intelligence{' '}
        <small>Grounded in your documents</small>
      </div>
      <h2>Executive summary</h2>
      <p>{claim(answer.summary)}</p>
      {answer.operation === 'compare_documents' &&
        answer.documents.length > 0 && (
          <>
            <h2>Contract comparison</h2>
            <div className="comparison-table">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>CONTRACT</TableHead>
                    <TableHead>PAYMENT</TableHead>
                    <TableHead>TERMINATION</TableHead>
                    <TableHead>RENEWAL</TableHead>
                    <TableHead>RISK</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {answer.documents.map((d) => (
                    <TableRow key={d.documentId}>
                      <TableCell>
                        <strong>{name(d.documentId)}</strong>
                      </TableCell>
                      <TableCell>{claim(d.paymentTerms)}</TableCell>
                      <TableCell>{claim(d.terminationTerms)}</TableCell>
                      <TableCell>{claim(d.renewalTerms)}</TableCell>
                      <TableCell>
                        <span
                          className={`risk-badge risk-${d.riskLevel === 'not_assessed' ? 'none' : d.riskLevel}`}
                        >
                          {d.riskLevel === 'not_assessed'
                            ? 'Not assessed'
                            : d.riskLevel.charAt(0).toUpperCase() +
                              d.riskLevel.slice(1)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      {answer.findings.map((f, i) => (
        <section key={i}>
          <h2>{f.title}</h2>
          <p>{claim(f.claim)}</p>
        </section>
      ))}
      {answer.operation === 'compare_documents' &&
        answer.documents.map((d) => (
          <section key={d.documentId}>
            <h2>{name(d.documentId)} · liability & risk</h2>
            <p>{claim(d.liability)}</p>
            <p>{claim(d.riskReason)}</p>
          </section>
        ))}
      <div className="recommendation">
        <h2>
          {answer.highestRiskDocumentId
            ? 'Highest risk: ' + name(answer.highestRiskDocumentId)
            : 'Assessment'}
        </h2>
        <p>{claim(answer.recommendation)}</p>
      </div>
      <div className="answer-sources">
        <p>
          {answer.sources.length
            ? `${answer.sources.length} source passages · Select a citation to inspect the exact text`
            : 'No supporting passages found for this answer. This is a limitation of the retrieved evidence, not proof that every page lacks the information.'}
        </p>
        {answer.sources.map((s) => citation(s.sourceId))}
      </div>
    </article>
  );
}
export function Workbench() {
  const [documents, setDocuments] = useState<Contract[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [uploadsReady, setUploadsReady] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [documentError, setDocumentError] = useState('');
  const [removing, setRemoving] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [hits, setHits] = useState<SourceChunk[]>([]);
  const [source, setSource] = useState<SourceChunk | null>(null);
  const [page, setPage] = useState(1);
  const [loadError, setLoadError] = useState('');
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const lock = useRef(false);
  const openSource = (s: SourceChunk) => {
    setSource(s);
    setPage(s.page);
  };
  async function loadDemo() {
    setLoading(true);
    setLoadError('');
    try {
      const response = await fetch('/api/documents', {
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error();
      const data = (await response.json()) as { documents: Contract[] };
      setDocuments((prev) => mergeDocs(prev, data.documents));
      setSelectedIds(data.documents.map((d) => d.documentId));
      try {
        sessionStorage.setItem('demo-contracts-loaded', 'true');
      } catch {}
      return data.documents as Contract[];
    } catch {
      setLoadError('The demo contracts could not be loaded. Please try again.');
      return [];
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      let restored: Contract[] = [];
      try {
        const response = await fetch('/api/uploads', {
          signal: controller.signal,
        });
        const data = (await response.json()) as {
          error?: string;
          documents: Contract[];
        };
        if (!response.ok) throw new Error(data.error);
        restored = data.documents;
        if (!controller.signal.aborted) setUploadsReady(true);
      } catch {
        if (!controller.signal.aborted)
          setDocumentError(
            'Your private uploads could not be loaded. Refresh the page to retry. Demo contracts are still available.',
          );
      }
      try {
        if (sessionStorage.getItem('demo-contracts-loaded') === 'true') {
          const response = await fetch('/api/documents', {
            signal: controller.signal,
          });
          if (!response.ok) throw new Error();
          restored = mergeDocs(
            restored,
            ((await response.json()) as { documents: Contract[] }).documents,
          );
        }
      } catch {
        if (!controller.signal.aborted)
          setLoadError(
            'The demo contracts could not be restored. Load them again to continue.',
          );
      }
      if (!controller.signal.aborted) {
        setDocuments((prev) => mergeDocs(prev, restored));
        setSelectedIds((prev) =>
          prev.length ? prev : restored.slice(0, 3).map((d) => d.documentId),
        );
      }
    })();
    return () => controller.abort();
  }, []);
  function clearAnalysis() {
    setTurns([]);
    setEvents([]);
    setHits([]);
    setSource(null);
  }
  function addUpload(doc: Contract) {
    setDocuments((prev) => mergeDocs(prev, [doc]));
    setSelectedIds((prev) => {
      const uploads = prev.filter((id) => id.startsWith('upload_'));
      return [...new Set([...uploads, doc.documentId])].slice(0, 3);
    });
    setDocumentError('');
    clearAnalysis();
  }
  function toggleDocument(id: string) {
    if (busy || uploading || removing) return;
    if (!selectedIds.includes(id) && selectedIds.length >= 3) {
      setDocumentError(
        'Select up to 3 documents per analysis. Deselect one first.',
      );
      return;
    }
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
    setDocumentError('');
    clearAnalysis();
  }
  async function removeUpload(id: string) {
    setRemoving(id);
    setDocumentError('');
    try {
      const response = await fetch(`/api/uploads/${id}`, {
        method: 'DELETE',
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok)
        throw new Error(((await response.json()) as { error?: string }).error);
      setDocuments((prev) => prev.filter((d) => d.documentId !== id));
      setSelectedIds((prev) => prev.filter((x) => x !== id));
      clearAnalysis();
    } catch {
      setDocumentError(
        'The PDF could not be removed. Please retry, or refresh to check its status.',
      );
    } finally {
      setRemoving('');
    }
  }
  useEffect(() => {
    if (!source) return;
    const t = setTimeout(
      () =>
        document
          .getElementById('source-' + source.sourceId)
          ?.scrollIntoView({ block: 'center' }),
      150,
    );
    return () => clearTimeout(t);
  }, [source, page]);
  async function ask(q: string, demo = false) {
    if (lock.current || uploading || removing || !q.trim() || q.length > 1200)
      return;
    if (!demo && documents.length && !selectedIds.length) {
      setDocumentError('Select at least one document to analyze.');
      return;
    }
    lock.current = true;
    setBusy(true);
    setEvents([
      {
        id: 'request',
        label: 'Sending request to the agent',
        status: 'running',
        elapsedMs: 0,
      },
    ]);
    setHits([]);
    setQuestion('');
    const id = crypto.randomUUID();
    setTurns((prev) => [...prev.slice(-7), { id, question: q }]);
    try {
      const docs =
        demo || !documents.length
          ? await loadDemo()
          : documents.filter((d) => selectedIds.includes(d.documentId));
      if (!docs.length) throw new Error('Select a document and try again.');
      let completed = false;
      const applyEvent = (event: {
        type: string;
        event?: ActivityEvent;
        sources?: SourceChunk[];
        answer?: Answer;
        message?: string;
      }) => {
        if (event.type === 'activity' && event.event) {
          const activity = event.event;
          setEvents((prev) => {
            const index = prev.findIndex((e) => e.id === activity.id);
            return index < 0
              ? [...prev, activity]
              : prev.map((e, i) => (i === index ? activity : e));
          });
        }
        if (event.type === 'sources' && event.sources) setHits(event.sources);
        if (event.type === 'answer' && event.answer) {
          completed = true;
          setTurns((prev) =>
            prev.map((t) => (t.id === id ? { ...t, answer: event.answer } : t)),
          );
        }
        if (event.type === 'error') throw new Error(event.message);
      };
      const send = async (payload: unknown) => {
        const response = await fetch('/api/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(195000),
        });
        const result = (await response.json()) as {
          events?: Parameters<typeof applyEvent>[0][];
          error?: string;
          ticket?: string;
        };
        if (Array.isArray(result.events)) result.events.forEach(applyEvent);
        if (!response.ok || result.error)
          throw new Error(
            result.error ||
              'The analysis service is unavailable. Please retry.',
          );
        return result;
      };
      const prepared = await send({
        phase: 'prepare',
        question: q,
        documentIds: docs.map((d) => d.documentId),
      });
      if (typeof prepared.ticket !== 'string')
        throw new Error('The document search was interrupted. Please retry.');
      setEvents((prev) =>
        prev.map((e) => (e.id === 'request' ? { ...e, status: 'done' } : e)),
      );
      setEvents((prev) => [
        ...prev,
        {
          id: 'answer-request',
          label: 'Generating answer from retrieved passages',
          status: 'running',
          elapsedMs: 0,
        },
      ]);
      await send({ phase: 'answer', ticket: prepared.ticket });
      setEvents((prev) =>
        prev.map((e) =>
          e.id === 'answer-request' ? { ...e, status: 'done' } : e,
        ),
      );
      if (!completed)
        throw new Error(
          'The analysis ended before an answer arrived. Please retry.',
        );
    } catch (error) {
      setTurns((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, error: requestError(error) } : t,
        ),
      );
      setEvents((prev) =>
        prev.map((e) =>
          e.status === 'running' ? { ...e, status: 'error' } : e,
        ),
      );
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  const docList = (
    <div className="document-list">
      {documents.map((d) => (
        <div
          className={`document-item ${selectedIds.includes(d.documentId) ? 'selected' : ''}`}
          key={d.documentId}
        >
          <input
            type="checkbox"
            checked={selectedIds.includes(d.documentId)}
            onChange={() => toggleDocument(d.documentId)}
            disabled={busy || uploading || !!removing}
            aria-label={`Select ${d.filename}`}
          />
          <div className="document-details">
            <button
              className="document-open"
              onClick={() => openSource(d.chunks[0])}
            >
              <strong>{d.filename}</strong>
            </button>
            <small>
              {d.pages} pages ·{' '}
              {d.kind === 'upload' ? 'Private PDF' : 'Demo contract'}
            </small>
            <small className="doc-ready">
              <Check size={11} />{' '}
              {selectedIds.includes(d.documentId)
                ? 'Selected for analysis'
                : 'Ready to analyze'}
            </small>
            {!!d.warnings?.length && (
              <small className="document-warning">Some pages need OCR</small>
            )}
            {d.kind === 'upload' && (
              <button
                className="remove-document"
                disabled={busy || uploading || !!removing}
                onClick={() => void removeUpload(d.documentId)}
                aria-label={`Remove ${d.filename}`}
              >
                {removing === d.documentId ? (
                  <LoaderCircle size={12} className="spin" />
                ) : (
                  <Trash2 size={12} />
                )}{' '}
                Remove
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
  const activity = (
    <ActivityPanel events={events} hits={hits} openSource={openSource} />
  );
  const sourceDoc = documents.find((d) => d.documentId === source?.documentId);
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <ScanText size={25} strokeWidth={1.5} />
          </div>
          <div>
            <strong>AI Document Intelligence</strong>
            <small>Document analysis workspace</small>
          </div>
        </div>
        <div className="header-meta">
          <span>Evidence behind every answer</span>
          <span className="demo-badge">PORTFOLIO DEMO</span>
        </div>
        <ProductTour
          disabled={busy || uploading || loading || !!removing || !!source}
          documents={documents}
          onLoadDemo={loadDemo}
          onStartDemo={() => void ask(prompts[0].question, true)}
        />
      </header>
      <div className="workspace">
        <aside className="document-sidebar" data-tour="documents">
          <div className="panel-title">
            <span>
              <Files size={16} /> Documents
            </span>
            <span className="count">{documents.length}</span>
          </div>
          {documents.length ? (
            docList
          ) : (
            <div className="empty-documents">
              <FileText size={29} strokeWidth={1.2} />
              <p>
                Your documents live here.
                <br />
                Upload PDFs or load the demo.
              </p>
            </div>
          )}
          <div className="sidebar-note">
            <strong>
              <ShieldCheck size={14} /> Your private workspace
            </strong>
            Select up to 3 documents for each analysis. Uploads stay in this
            browser’s session for 24 hours; clearing cookies removes access.
            Demo contracts are fictional.
          </div>
        </aside>
        <main className="main-column">
          <div className="workspace-title">
            <div>
              <h1>Document analysis</h1>
              <p>
                {documents.length
                  ? `${documents.length} documents · ${documents.reduce((n, d) => n + d.pages, 0)} source pages`
                  : 'Your evidence, connected'}
              </p>
            </div>
            {turns.length > 0 && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  setTurns([]);
                  setEvents([]);
                  setHits([]);
                }}
              >
                <RotateCcw size={13} /> New analysis
              </button>
            )}
          </div>
          <div data-tour="upload">
            <PdfUploader
              disabled={busy || loading || !!removing || !uploadsReady}
              count={documents.filter((d) => d.kind === 'upload').length}
              onDocument={addUpload}
              onBusy={setUploading}
            />
          </div>
          {documentError && (
            <div className="error-box" role="alert">
              {documentError}
              <button onClick={() => setDocumentError('')}>Dismiss</button>
            </div>
          )}
          <details className="mobile-panels" data-tour="documents">
            <summary>Documents · {documents.length}</summary>
            {documents.length ? (
              docList
            ) : (
              <p className="activity-intro">
                Load the demo contracts to start.
              </p>
            )}
          </details>
          <div className="conversation">
            {turns.length === 0 ? (
              <div className="welcome">
                <div className="welcome-symbol">
                  <FileSearch size={29} strokeWidth={1.4} />
                </div>
                <h2>
                  Turn complex documents
                  <br />
                  into clear decisions.
                </h2>
                <p className="lede">
                  Analyze, compare, and extract information from documents using
                  AI.
                </p>
                <div className="load-row">
                  {
                    <button
                      className="primary-button"
                      disabled={
                        loading || busy || uploading || !!removing || !hydrated
                      }
                      onClick={() => void loadDemo()}
                    >
                      {loading ? (
                        <LoaderCircle size={16} className="spin" />
                      ) : (
                        <Files size={16} />
                      )}{' '}
                      {loading ? 'Loading contracts…' : 'Load Demo Contracts'}{' '}
                      {!loading && <ArrowRight size={16} />}
                    </button>
                  }
                  <small>3 fictional agreements · 4 pages each</small>
                </div>
                {loadError && (
                  <div className="error-box" role="alert">
                    {loadError}
                    <button onClick={() => void loadDemo()}>Try again</button>
                  </div>
                )}
                {selectedIds.some((id) => id.startsWith('upload_')) && (
                  <div className="own-prompts">
                    <p className="examples-label">
                      Ask about your selected PDFs
                    </p>
                    {[
                      'Summarize the selected document and highlight key facts.',
                      'Compare the selected documents and highlight the most important differences.',
                      'What key obligations, dates, and risks are stated in these documents?',
                    ].map((q) => (
                      <button
                        className="prompt-row"
                        key={q}
                        disabled={busy || uploading || !!removing}
                        onClick={() => void ask(q)}
                      >
                        <FileSearch size={16} />
                        <span>{q}</span>
                        <ArrowRight size={14} />
                      </button>
                    ))}
                  </div>
                )}
                <p className="examples-label">
                  Try an example · uses demo contracts
                </p>
                <div className="prompt-list">
                  {prompts.map((p) => (
                    <button
                      className="prompt-row"
                      key={p.label}
                      onClick={() => void ask(p.question, true)}
                      disabled={!hydrated || busy || uploading || !!removing}
                    >
                      <p.icon size={17} />
                      <span className="prompt-label-desktop">{p.label}</span>
                      <span className="prompt-label-mobile">
                        {p.label.startsWith('Compare payment')
                          ? 'Compare contract terms'
                          : p.label.startsWith('Which contract')
                            ? 'Find the highest-risk contract'
                            : p.label.startsWith('Summarize')
                              ? 'Summarize NovaCloud'
                              : p.label}
                      </span>
                      <ArrowRight size={15} />
                    </button>
                  ))}
                </div>
                <p className="welcome-note">
                  <BookOpen size={13} /> Every citation opens the original
                  source passage.
                </p>
              </div>
            ) : (
              turns.map((t) => (
                <div key={t.id}>
                  <div className="question-bubble">{t.question}</div>
                  {t.answer && (
                    <AnswerView answer={t.answer} openSource={openSource} />
                  )}{' '}
                  {t.error && (
                    <div className="error-box" role="alert">
                      {t.error}
                      <button
                        disabled={busy}
                        onClick={() => void ask(t.question)}
                      >
                        Retry analysis{' '}
                        <ChevronRight size={13} className="inline" />
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
            {busy && (
              <output className="thinking">
                <LoaderCircle size={18} className="spin" />
                {events.find((e) => e.status === 'running')?.label ||
                  'Preparing your request…'}
              </output>
            )}
            <details
              className="mobile-activity"
              data-tour="activity"
              open={busy || events.length > 0}
            >
              <summary>
                Agent Activity ·{' '}
                {busy
                  ? 'Working'
                  : events.some((e) => e.status === 'error')
                    ? 'Stopped'
                    : events.length
                      ? 'Finished'
                      : 'Ready'}
              </summary>
              {activity}
            </details>
          </div>
          <div className="composer-wrap" data-tour="question">
            <form
              className="composer"
              onSubmit={(e) => {
                e.preventDefault();
                void ask(question);
              }}
            >
              <label htmlFor="question" className="sr-only">
                Ask a question about your documents
              </label>
              <textarea
                id="question"
                placeholder="Ask a question about your selected documents…"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                maxLength={1200}
                disabled={busy || uploading || !!removing}
                onKeyDown={(e) => {
                  if (
                    e.key === 'Enter' &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    void ask(question);
                  }
                }}
              />
              <div className="composer-bottom">
                <span className="count-label">
                  <Files size={13} />
                  {documents.length
                    ? `${selectedIds.length} of ${documents.length} documents selected`
                    : 'Demo contracts load automatically'}
                </span>
                <button
                  className="send-button"
                  type="submit"
                  aria-label="Analyze question"
                  disabled={
                    !hydrated ||
                    busy ||
                    uploading ||
                    !!removing ||
                    !question.trim()
                  }
                >
                  {busy ? (
                    <LoaderCircle size={15} className="spin" />
                  ) : (
                    <ArrowUp size={18} />
                  )}
                </button>
              </div>
            </form>
            <p className="composer-footnote">
              AI analysis can make mistakes. Check the cited sources. Not legal
              advice.
            </p>
          </div>
        </main>
        <aside className="activity-sidebar" data-tour="activity">
          {activity}
        </aside>
      </div>
      <Sheet
        open={!!source}
        onOpenChange={(open) => {
          if (!open) setSource(null);
        }}
      >
        <SheetContent className="source-sheet">
          <SheetHeader className="source-header">
            <span className="ready-label">
              <BookOpen size={15} /> Original source
            </span>
            <SheetTitle>{sourceDoc?.filename}</SheetTitle>
            <SheetDescription>
              {sourceDoc?.kind === 'upload'
                ? 'Private PDF · Extracted text with original page numbers'
                : `Fictional contract · Effective ${sourceDoc?.effectiveDate}`}
            </SheetDescription>
            <div className="page-controls">
              {Array.from(
                { length: sourceDoc?.pages || 0 },
                (_, i) => i + 1,
              ).map((n) => (
                <button
                  className={page === n ? 'active' : ''}
                  key={n}
                  onClick={() => setPage(n)}
                  aria-label={`View page ${n}`}
                  aria-pressed={page === n}
                >
                  Page {n}
                </button>
              ))}
            </div>
            {sourceDoc && (
              <a
                className="source-download"
                href={
                  sourceDoc.kind === 'upload'
                    ? `/api/uploads/${sourceDoc.documentId}`
                    : `/demo/${sourceDoc.documentId}.pdf`
                }
                download
              >
                <Download size={14} /> Download original PDF
              </a>
            )}
            {sourceDoc?.warnings?.map((w) => (
              <p className="document-warning" key={w}>
                {w}
              </p>
            ))}
          </SheetHeader>
          <div className="source-body">
            <div className="source-page">
              <div className="source-page-label">
                <span>
                  {sourceDoc?.kind === 'upload'
                    ? 'UPLOADED DOCUMENT'
                    : 'DEMO AGREEMENT'}
                </span>
                <span>
                  PAGE {page} / {sourceDoc?.pages}
                </span>
              </div>
              {sourceDoc?.chunks
                .filter((c) => c.page === page)
                .map((c) => (
                  <section
                    key={c.sourceId}
                    id={'source-' + c.sourceId}
                    className={`source-section ${c.sourceId === source?.sourceId ? 'highlighted' : ''}`}
                  >
                    <h3>{c.section}</h3>
                    <p>{c.text}</p>
                  </section>
                ))}
              {sourceDoc && !sourceDoc.chunks.some((c) => c.page === page) && (
                <p className="activity-intro">
                  No readable text on this page. Download the original PDF to
                  inspect it. OCR may be needed.
                </p>
              )}
            </div>
            <p className="activity-intro">
              Exact stored source text. The highlighted section is the passage
              attached to your citation.
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
