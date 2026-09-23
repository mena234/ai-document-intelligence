export type DocumentId = string;
export type SourceChunk = {
  sourceId: string;
  documentId: DocumentId;
  filename: string;
  page: number;
  section: string;
  text: string;
};
export type Contract = {
  documentId: DocumentId;
  filename: string;
  shortName: string;
  pages: number;
  effectiveDate: string;
  chunks: SourceChunk[];
  kind?: 'demo' | 'upload';
  warnings?: string[];
  expiresAt?: number;
  byteSize?: number;
};
export type Claim = {
  text: string;
  sourceIds: string[];
  evidence: 'supported' | 'not_found';
};
export type Answer = {
  operation: 'search_documents' | 'summarize_document' | 'compare_documents';
  summary: Claim;
  documents: {
    documentId: DocumentId;
    paymentTerms: Claim;
    terminationTerms: Claim;
    renewalTerms: Claim;
    liability: Claim;
    riskLevel: 'low' | 'medium' | 'high' | 'not_assessed';
    riskReason: Claim;
  }[];
  findings: { title: string; claim: Claim }[];
  highestRiskDocumentId: DocumentId | null;
  recommendation: Claim;
  sources: SourceChunk[];
};
export type ActivityEvent = {
  id: string;
  label: string;
  status: 'running' | 'done' | 'error';
  detail?: string;
  elapsedMs: number;
};
