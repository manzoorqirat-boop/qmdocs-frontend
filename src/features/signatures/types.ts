// Shared shapes for the envelope creation/signing workflow. Kept separate
// from src/types/api.ts because these describe UI-side working state
// (placement boxes, drag rectangles) as much as wire data.

export type FileSource = { type: 'file'; file: File } | { type: 'base64'; data: string };

export interface PlacementRecipient {
  username: string;
  stepLabel?: string;
  role: string;
}

/** A pending (not-yet-signed) placement box the sender drew. */
export interface SignatureBox {
  recipientUsername: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A signature actually applied to a document — rendered as a filled stamp. */
export interface AppliedSignature {
  recipientUsername: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  stepLabel?: string;
  signerRole?: string;
  signerFullName?: string;
  signerDesignation?: string;
  signerDepartment?: string;
  signedAt?: string;
  signatureType?: 'typed' | 'drawn' | 'image';
  signatureData?: string;
}

export interface EffectiveDateField {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AppliedEffectiveDate extends EffectiveDateField {
  effectiveDate: string;
}

export type AnnotationKind = 'tick' | 'cross' | 'text';

export interface Annotation {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  kind: AnnotationKind;
  text?: string;
  byUsername?: string;
  byFullName?: string;
  stepLabel?: string;
}
