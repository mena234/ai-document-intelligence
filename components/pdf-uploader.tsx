'use client';
import { useRef, useState } from 'react';
import { Upload, LoaderCircle, X, CheckCircle2 } from 'lucide-react';
import type { Contract } from '@/lib/types';
type Props = {
  disabled: boolean;
  count: number;
  onDocument: (doc: Contract) => void;
  onBusy: (busy: boolean) => void;
};
export function PdfUploader({ disabled, count, onDocument, onBusy }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const [working, setWorking] = useState(false),
    [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(''),
    [errors, setErrors] = useState<string[]>([]),
    [dragging, setDragging] = useState(false);
  const locked = disabled || working;
  async function upload(files: FileList | File[]) {
    if (locked || !files.length) return;
    const queue = Array.from(files);
    if (queue.length > 5) {
      setErrors(['Choose up to 5 PDFs at a time.']);
      return;
    }
    setWorking(true);
    onBusy(true);
    setErrors([]);
    const aborter = new AbortController();
    controller.current = aborter;
    let ready = 0;
    try {
      const { extractPdf } = await import('@/lib/documents/pdf-client');
      for (const file of queue) {
        if (aborter.signal.aborted) break;
        try {
          const pages = await extractPdf(
            file,
            (text) => setStatus(`${file.name}: ${text}`),
            aborter.signal,
          );
          if (aborter.signal.aborted) break;
          setSaving(true);
          setStatus(`${file.name}: Saving securely…`);
          const form = new FormData();
          form.set('file', file);
          form.set('pages', JSON.stringify(pages));
          const response = await fetch('/api/uploads', {
            method: 'POST',
            body: form,
            signal: AbortSignal.timeout(60000),
          });
          const data = (await response.json()) as {
            document?: Contract;
            error?: string;
            duplicate?: boolean;
          };
          if (!response.ok || !data.document)
            throw new Error(
              data.error ||
                'The PDF could not be saved. Retry the same file safely.',
            );
          onDocument(data.document);
          ready++;
        } catch (error) {
          if (!aborter.signal.aborted)
            setErrors((prev) => [
              ...prev,
              `${file.name}: ${error instanceof Error ? error.message : 'Upload failed. Please retry.'}`,
            ]);
        } finally {
          setSaving(false);
        }
      }
      setStatus(
        aborter.signal.aborted
          ? `Upload canceled. ${ready} PDF${ready === 1 ? '' : 's'} saved.`
          : ready
            ? `${ready} PDF${ready === 1 ? '' : 's'} ready. Select up to 3 documents to analyze.`
            : 'No PDFs were added. Check the messages below and try again.',
      );
    } catch {
      setErrors([
        'PDF processing could not start. Check your connection and retry.',
      ]);
    } finally {
      setWorking(false);
      onBusy(false);
      controller.current = null;
      if (input.current) input.current.value = '';
    }
  }
  return (
    <div
      className={`upload-box ${dragging ? 'dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!locked) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!locked) void upload(e.dataTransfer.files);
      }}
    >
      <div className="upload-topline">
        <button
          className="upload-button"
          disabled={locked}
          onClick={() => input.current?.click()}
        >
          {working ? (
            <LoaderCircle size={16} className="spin" />
          ) : (
            <Upload size={16} />
          )}{' '}
          Upload PDFs
        </button>
        <span>
          or drop files here · 10 MB · 25 pages per PDF · {count}/5 saved
        </span>
        {working && !saving && (
          <button
            className="text-button"
            onClick={() => controller.current?.abort()}
          >
            <X size={14} /> Cancel
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="sr-only"
        aria-label="Choose PDF files"
        disabled={locked}
        onChange={(e) => {
          if (e.target.files) void upload(e.target.files);
        }}
      />
      <p className="upload-privacy">
        Private to this browser · Available for 24 hours · Up to 5 uploads.
        Selected text is sent to OpenRouter for AI analysis. Scanned PDFs need
        OCR first.
      </p>
      {status && (
        <output className="upload-status">
          {working ? (
            <LoaderCircle size={13} className="spin" />
          ) : (
            <CheckCircle2 size={13} />
          )}{' '}
          {status}
        </output>
      )}
      {!!errors.length && (
        <div className="upload-errors" role="alert">
          {errors.map((error, i) => (
            <p key={i}>{error}</p>
          ))}
        </div>
      )}
    </div>
  );
}
