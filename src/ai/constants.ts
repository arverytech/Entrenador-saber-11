/**
 * Shared constants used by the AI flows and the API route layer.
 *
 * Keep this file free of 'use server' or 'use client' directives so it can be
 * imported from both server components/routes and shared utilities.
 */

/**
 * Maximum PDF buffer size (bytes) that can be sent as inline base-64 data to
 * the Gemini API.  The total multipart request must stay under ~20 MB; 14 MB
 * leaves adequate headroom for the prompt, schema, and other payload fields.
 *
 * PDFs larger than this limit are processed via the text-extraction fallback
 * (pdf-parse + text chunking pipeline) instead of the vision path.
 */
export const PDF_VISION_SIZE_LIMIT = 14 * 1024 * 1024; // 14 MB
