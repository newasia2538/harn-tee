export class RequestBodyTooLargeError extends Error {
  constructor() {
    super("คำขอมีขนาดใหญ่เกินไป");
    this.name = "RequestBodyTooLargeError";
  }
}

export class InvalidJsonBodyError extends Error {
  constructor() {
    super("รูปแบบ JSON ไม่ถูกต้อง");
    this.name = "InvalidJsonBodyError";
  }
}

export class InvalidFormDataBodyError extends Error {
  constructor() {
    super("รูปแบบข้อมูลแบบฟอร์มไม่ถูกต้อง");
    this.name = "InvalidFormDataBodyError";
  }
}

export async function readLimitedBody(request: Request, maxBytes: number) {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > maxBytes) {
    throw new RequestBodyTooLargeError();
  }

  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new RequestBodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  const bytes = await readLimitedBody(request, maxBytes);
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new InvalidJsonBodyError();
  }
}

export async function readFormDataBody(request: Request, maxBytes: number) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\s*;/i.test(contentType)) {
    throw new InvalidFormDataBodyError();
  }
  const bytes = await readLimitedBody(request, maxBytes);
  try {
    return await new Response(bytes, { headers: { "content-type": contentType } }).formData();
  } catch {
    throw new InvalidFormDataBodyError();
  }
}
