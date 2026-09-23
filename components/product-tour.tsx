'use client';

import { useEffect, useRef, useState } from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Compass,
  Files,
  LoaderCircle,
  MessageSquare,
  ScanText,
  Upload,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Contract, SourceChunk } from '@/lib/types';

const preferenceKey = 'document-intelligence-tour-v1';
const steps = [
  {
    title: 'Meet your document analyst',
    label: 'Welcome',
    icon: ScanText,
    target: null,
    description:
      'Ask questions about PDFs, compare agreements, and find the passages behind an answer. This short tour shows you where to start.',
  },
  {
    title: 'Choose the evidence',
    label: 'Documents',
    icon: Files,
    target: 'documents',
    description:
      'Select up to three documents for each question. Start with Acme, NovaCloud, and Apex: three fictional contracts with deliberately different terms.',
  },
  {
    title: 'Ask in your own words',
    label: 'Your question',
    icon: MessageSquare,
    target: 'question',
    description:
      'Ask for a summary, a specific fact, or a comparison. The AI uses your selected documents. Each question is independent, so include the details it needs.',
  },
  {
    title: 'Follow the work',
    label: 'Agent Activity',
    icon: Activity,
    target: 'activity',
    description:
      'Agent Activity shows the actual search steps and retrieved passages. You can inspect the evidence as the AI prepares its answer. An analysis can take a little time.',
  },
  {
    title: 'Check the source, not just the answer',
    label: 'Citations',
    icon: BookOpen,
    target: 'answer',
    description:
      'Click a citation beside an answer to open the original page and highlighted passage. Check important claims yourself. If information is not found, the answer should say so.',
  },
  {
    title: 'Bring your own PDFs',
    label: 'Your documents',
    icon: Upload,
    target: 'upload',
    description:
      'Upload or drop a text-based PDF, then select it and ask your question. Keep up to five PDFs in this browser session for 24 hours, with up to three selected per analysis.',
  },
] as const;

type Position = { top: number; left: number; width: number; height: number };

export function ProductTour({
  disabled,
  documents,
  onLoadDemo,
  onStartDemo,
}: {
  disabled: boolean;
  documents: Contract[];
  onLoadDemo: () => Promise<Contract[]>;
  onStartDemo: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [demoLoaded, setDemoLoaded] = useState(false);
  const [loadedSample, setSample] = useState<SourceChunk | null>(null);
  const sample =
    loadedSample ||
    documents
      .find((d) => d.documentId === 'acme')
      ?.chunks.find((c) => c.section.includes('Fees'));
  const [sampleError, setSampleError] = useState(false);
  const [sampleAttempt, setSampleAttempt] = useState(0);
  const [showPassage, setShowPassage] = useState(false);
  const [highlight, setHighlight] = useState<Position | null>(null);
  const [placement, setPlacement] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const attemptedWelcome = useRef(false);
  const loadLock = useRef(false);
  const returnScroll = useRef(0);
  const current = steps[step];
  const Icon = current.icon;

  useEffect(() => {
    if (disabled || attemptedWelcome.current) return;
    // This is only a browser preference, never an account or upload identifier.
    try {
      if (localStorage.getItem(preferenceKey)) {
        attemptedWelcome.current = true;
        return;
      }
    } catch {
      // A blocked preference store must not prevent the tour from working.
    }
    const frame = requestAnimationFrame(() => {
      attemptedWelcome.current = true;
      returnScroll.current = window.scrollY;
      setOpen(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [disabled]);

  function dismiss() {
    setOpen(false);
    try {
      localStorage.setItem(preferenceKey, 'seen');
    } catch {}
    window.scrollTo({ top: returnScroll.current, behavior: 'instant' });
  }

  function start() {
    returnScroll.current = window.scrollY;
    setStep(0);
    setError('');
    setDemoLoaded(false);
    setShowPassage(false);
    setOpen(true);
  }

  function go(next: number) {
    setStep(next);
    setShowPassage(false);
    setError('');
    setSampleError(false);
    card.current?.scrollTo({ top: 0 });
  }

  useEffect(() => {
    if (!open) return;
    heading.current?.focus({ preventScroll: true });
    const targets = current.target
      ? [
          ...document.querySelectorAll<HTMLElement>(
            `[data-tour="${current.target}"]`,
          ),
        ]
      : [];
    const target = targets.find(
      (el) =>
        el.getClientRects().length && el.getBoundingClientRect().height > 0,
    );
    // Open the existing mobile disclosure while explaining its contents.
    const disclosure = target instanceof HTMLDetailsElement ? target : null;
    const wasOpen = disclosure?.open;
    if (disclosure) disclosure.open = true;
    target?.scrollIntoView({
      block: window.innerWidth <= 760 ? 'start' : 'center',
      behavior: 'instant',
    });
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const box = target?.getBoundingClientRect();
        const vw = document.documentElement.clientWidth;
        const vh = window.innerHeight;
        const width = card.current?.offsetWidth || Math.min(432, vw - 24);
        const height = card.current?.offsetHeight || 440;
        const pad = 12;
        if (!box || !target?.getClientRects().length) {
          setHighlight(null);
          setPlacement(null);
          return;
        }
        const rect = {
          top: Math.max(8, box.top - 6),
          left: Math.max(8, box.left - 6),
          width: Math.min(vw - 16, box.width + 12),
          height: Math.min(vh - 16, box.height + 12),
        };
        setHighlight(rect);
        // Narrow screens use a scrollable bottom card; desktop anchors beside the control.
        if (vw <= 760) {
          setPlacement(null);
          return;
        }
        let left = (vw - width) / 2;
        let top = (vh - height) / 2;
        if (box.right + 24 + width < vw - pad) {
          left = box.right + 24;
          top = box.top;
        } else if (box.left - 24 - width > pad) {
          left = box.left - 24 - width;
          top = box.top;
        } else if (box.top - height - 24 > pad) {
          top = box.top - height - 24;
        } else if (box.bottom + height + 24 < vh - pad) {
          top = box.bottom + 24;
        }
        setPlacement({
          left: Math.max(pad, Math.min(left, vw - width - pad)),
          top: Math.max(pad, Math.min(top, vh - height - pad)),
        });
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (target) observer.observe(target);
    if (card.current) observer.observe(card.current);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      if (disclosure) disclosure.open = !!wasOpen;
    };
  }, [open, current]);

  useEffect(() => {
    if (!open || step !== 4 || sample) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch('/api/documents', {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(15000),
          ]),
        });
        if (!response.ok) throw new Error();
        const data = (await response.json()) as { documents: Contract[] };
        const passage = data.documents
          .find((d) => d.documentId === 'acme')
          ?.chunks.find((c) => c.section.includes('Fees'));
        if (!passage) throw new Error();
        if (!controller.signal.aborted) setSample(passage);
      } catch {
        if (!controller.signal.aborted) setSampleError(true);
      }
    })();
    return () => controller.abort();
  }, [open, step, sample, documents, sampleAttempt]);

  async function loadDemo() {
    if (loadLock.current || disabled) return;
    loadLock.current = true;
    setPending(true);
    setError('');
    try {
      const loaded = await onLoadDemo();
      if (!loaded.length) throw new Error();
      setDemoLoaded(true);
    } catch {
      setError(
        'The demo could not be loaded. Try again, or continue the tour.',
      );
    } finally {
      setPending(false);
      loadLock.current = false;
    }
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="tour-trigger"
        disabled={disabled || pending}
        onClick={start}
      >
        <Compass size={17} aria-hidden="true" />
        <span>Product tour</span>
      </button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!value) dismiss();
        }}
        disablePointerDismissal
      >
        <DialogPortal>
          <DialogOverlay
            className={`tour-backdrop ${highlight ? 'has-highlight' : ''}`}
          />
          {highlight && (
            <div
              aria-hidden="true"
              className="tour-spotlight"
              style={highlight}
            />
          )}
          <DialogPrimitive.Popup
            ref={card}
            className={`tour-card ${placement ? 'is-anchored' : ''}`}
            style={placement || undefined}
            initialFocus={heading}
            finalFocus={trigger}
          >
            <div className="tour-topline">
              <span>
                <Compass size={15} aria-hidden="true" /> PRODUCT TOUR{' '}
                <span aria-hidden="true">/</span> {step + 1} OF {steps.length}
              </span>
              <DialogClose
                className="tour-close"
                aria-label="Close product tour"
              >
                <X size={19} aria-hidden="true" />
              </DialogClose>
            </div>
            <progress
              className="sr-only"
              aria-label="Tour progress"
              value={step + 1}
              max={steps.length}
            />
            <div className="tour-progress" aria-hidden="true">
              {steps.map((s, i) => (
                <span key={s.label} className={i <= step ? 'reached' : ''} />
              ))}
            </div>
            <div className="tour-step-icon">
              <Icon size={25} strokeWidth={1.6} aria-hidden="true" />
            </div>
            <div aria-live="polite" aria-atomic="true">
              <p className="tour-eyebrow">{current.label}</p>
              <DialogTitle ref={heading} tabIndex={-1} className="tour-title">
                {current.title}
              </DialogTitle>
              <DialogDescription className="tour-description">
                {current.description}
              </DialogDescription>
            </div>
            {step === 0 && (
              <div
                className="tour-flow"
                aria-label="Document analysis workflow"
              >
                <span>
                  <Files size={18} />
                  Choose PDFs
                </span>
                <ArrowRight size={15} aria-hidden="true" />
                <span>
                  <MessageSquare size={18} />
                  Ask AI
                </span>
                <ArrowRight size={15} aria-hidden="true" />
                <span>
                  <BookOpen size={18} />
                  Check sources
                </span>
              </div>
            )}
            {step === 1 && (
              <div className="tour-example">
                <p>
                  The document checkboxes control what the AI reads. Demo
                  examples explicitly select the three demo contracts.
                </p>
                <button
                  type="button"
                  className="tour-secondary"
                  disabled={pending || disabled}
                  onClick={() => void loadDemo()}
                >
                  {pending ? (
                    <LoaderCircle size={16} className="spin" />
                  ) : demoLoaded ? (
                    <Check size={16} />
                  ) : (
                    <Files size={16} />
                  )}
                  {pending
                    ? 'Loading contracts…'
                    : demoLoaded
                      ? 'Demo contracts selected'
                      : 'Load demo contracts'}
                </button>
                {demoLoaded && (
                  <output>
                    Acme, NovaCloud, and Apex are ready in your document list.
                  </output>
                )}
                {error && (
                  <p role="alert" className="tour-error">
                    {error}
                  </p>
                )}
              </div>
            )}
            {step === 2 && (
              <div className="tour-example">
                <span className="tour-example-label">TRY A QUESTION LIKE</span>
                <p>
                  “Compare the payment and termination terms. Which contract has
                  the highest risk for the customer? Cite the sources.”
                </p>
                <small>
                  Use the send arrow or Enter. Shift + Enter adds a line.
                </small>
              </div>
            )}
            {step === 3 && (
              <div className="tour-example">
                <p>
                  Look for the documents searched, passages found, and citation
                  checks. These steps appear when you run an analysis.
                </p>
                <small>
                  Nothing is running during this tour. At the end, you can start
                  a real demo comparison.
                </small>
              </div>
            )}
            {step === 4 && (
              <div className="tour-example">
                <span className="tour-example-label">
                  PRACTICE WITH A REAL DEMO PASSAGE
                </span>
                {sample ? (
                  <>
                    <button
                      type="button"
                      className="tour-source-button"
                      aria-expanded={showPassage}
                      aria-controls="tour-source-passage"
                      onClick={() => setShowPassage((value) => !value)}
                    >
                      <BookOpen size={15} />
                      {sample.filename}, p. {sample.page}
                      <ArrowRight size={15} />
                    </button>
                    {showPassage && (
                      <div
                        id="tour-source-passage"
                        className="tour-source-passage"
                      >
                        <strong>{sample.section}</strong>
                        <blockquote>{sample.text}</blockquote>
                      </div>
                    )}
                    <small>
                      This is original source text, not an AI-generated answer.
                      In the workspace, citations open a full source panel.
                    </small>
                  </>
                ) : sampleError ? (
                  <>
                    <p>The example passage could not be loaded.</p>
                    <button
                      type="button"
                      className="tour-secondary"
                      onClick={() => {
                        setSampleError(false);
                        setSampleAttempt((n) => n + 1);
                      }}
                    >
                      Retry example
                    </button>
                  </>
                ) : (
                  <output>Loading a source passage…</output>
                )}
              </div>
            )}
            {step === 5 && (
              <div className="tour-example">
                <ul>
                  <li>Up to 10 MB and 25 pages per PDF.</li>
                  <li>
                    Scanned PDFs need OCR first; password-protected files need
                    an unlocked copy.
                  </li>
                  <li>
                    Selected text is sent to OpenRouter for AI analysis.
                    Clearing cookies removes access to your uploads.
                  </li>
                </ul>
                <p className="tour-ready">
                  Ready to try it? Start a live comparison using the three demo
                  contracts, or finish and explore your own documents.
                </p>
              </div>
            )}
            <div className="tour-footer">
              {step === 0 ? (
                <button type="button" className="tour-skip" onClick={dismiss}>
                  Skip tour
                </button>
              ) : (
                <button
                  type="button"
                  className="tour-back"
                  disabled={pending}
                  onClick={() => go(step - 1)}
                >
                  <ArrowLeft size={16} />
                  Back
                </button>
              )}
              <button
                type="button"
                className="tour-primary"
                disabled={pending || (step === steps.length - 1 && disabled)}
                onClick={() => {
                  if (step === steps.length - 1) {
                    dismiss();
                    onStartDemo();
                  } else go(step + 1);
                }}
              >
                {step === 0
                  ? 'Show me around'
                  : step === steps.length - 1
                    ? 'Start demo analysis'
                    : 'Next'}
                <ArrowRight size={16} />
              </button>
            </div>
            {step === steps.length - 1 ? (
              <button type="button" className="tour-finish" onClick={dismiss}>
                Finish tour — explore on my own
              </button>
            ) : (
              <p className="tour-replay-note">
                You can close this tour anytime and replay it from Product tour.
              </p>
            )}
          </DialogPrimitive.Popup>
        </DialogPortal>
      </Dialog>
    </>
  );
}
