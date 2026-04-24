/**
 * Utility: uploads a PDF buffer to the Gemini Files API.
 *
 * Gemini Files API supports files up to 2 GB (vs ~20 MB inline base64 limit).
 * The returned URI can be passed directly to `ai.generate()` as `media.url`;
 * the @genkit-ai/google-genai plugin recognises the
 * `generativelanguage.googleapis.com` hostname and forwards it as `fileData` —
 * Gemini then reads the full PDF, including embedded images and figures.
 *
 * Uploaded files remain accessible for 48 hours on Google's servers.
 *
 * @param pdfBuffer  - Raw PDF bytes.
 * @param displayName - Human-readable label shown in the Gemini console.
 * @param apiKey     - Google AI / Gemini API key.
 * @returns The file URI, e.g.
 *   `https://generativelanguage.googleapis.com/v1beta/files/{id}`.
 */
export async function uploadPdfToGeminiFilesApi(
  pdfBuffer: Buffer,
  displayName: string,
  apiKey: string,
): Promise<string> {
  const boundary = 'EntrenadorSaber11FileBoundary';
  const metaJson = JSON.stringify({ file: { display_name: displayName } });

  // Build a multipart/related body: JSON metadata part + PDF binary part.
  const bodyBuffer = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n${metaJson}\r\n` +
        `--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`,
    ),
    pdfBuffer,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const res = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'X-Goog-Upload-Protocol': 'multipart',
      },
      body: bodyBuffer,
      signal: AbortSignal.timeout(60_000),
    },
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(
      `Gemini Files API upload failed (HTTP ${res.status}): ${errText.slice(0, 300)}`,
    );
  }

  let data: { file?: { uri?: string } };
  try {
    data = await res.json() as { file?: { uri?: string } };
  } catch {
    throw new Error('Gemini Files API returned a non-JSON response.');
  }
  const uri = data?.file?.uri;
  if (!uri) {
    throw new Error('Gemini Files API did not return a file URI in the response.');
  }
  return uri;
}
