import type { Express } from 'express';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
// Dispatch directly through Express: no listening socket, no outbound network.
export async function localFetch(app: Express, url: string, options: RequestInit = {}): Promise<Response> {
  const encoded = new Request(url, options);
  const bytes = Buffer.from(await encoded.arrayBuffer());
  const req = new IncomingMessage(new Socket());
  req.method = encoded.method; req.url = new URL(url).pathname + new URL(url).search;
  req.headers = Object.fromEntries(encoded.headers); req.headers.host = '127.0.0.1'; req.httpVersion = '1.1'; req.httpVersionMajor = 1; req.httpVersionMinor = 1;
  if (bytes.length) req.headers['content-length'] = String(bytes.length);
  const res = new ServerResponse(req); const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    res.write = (chunk: unknown, encoding?: BufferEncoding | ((error?: Error | null) => void), cb?: (error?: Error | null) => void) => { chunks.push(Buffer.from(chunk as string, typeof encoding === 'string' ? encoding : undefined)); if (typeof cb === 'function') cb(); return true; };
    res.end = (chunk?: unknown, encoding?: BufferEncoding | (() => void)) => { if (chunk) chunks.push(Buffer.from(chunk as string, typeof encoding === 'string' ? encoding : undefined)); res.emit('finish'); resolve(new Response(Buffer.concat(chunks), { status: res.statusCode, headers: res.getHeaders() as Record<string, string> })); return res; };
    req.on('error', reject);
    app(req, res);
    req.complete = true; req.push(bytes.length ? bytes : null); if (bytes.length) req.push(null);
  });
}
