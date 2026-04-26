import http from "http";
import tls from "tls";
import type { Socket } from "net";

let proxyFetchFn: typeof fetch | undefined;

export function getProxyFetch(): typeof fetch | undefined {
  if (proxyFetchFn) return proxyFetchFn;

  const proxyEnv =
    process.env.HTTP_PROXY ||
    process.env.HTTPS_PROXY ||
    process.env.http_proxy ||
    process.env.https_proxy;
  if (!proxyEnv) return undefined;

  const origFetch = globalThis.fetch;
  const proxyUrl = new URL(proxyEnv);

  proxyFetchFn = async function proxyFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const reqUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;
    let target: URL;
    try {
      target = new URL(reqUrl);
    } catch {
      return origFetch(input, init);
    }
    if (target.hostname === "localhost" || target.hostname === "127.0.0.1")
      return origFetch(input, init);
    if (target.protocol !== "https:") return origFetch(input, init);

    const method =
      init?.method || (input instanceof Request ? input.method : "GET");
    const headers = new Headers(
      init?.headers || (input instanceof Request ? input.headers : {})
    );

    let bodyBuf = Buffer.alloc(0);
    const rawBody =
      init?.body || (input instanceof Request ? input.body : null);
    if (rawBody) {
      if (typeof rawBody === "string") bodyBuf = Buffer.from(rawBody);
      else if (rawBody instanceof Uint8Array) bodyBuf = Buffer.from(rawBody);
      else if (rawBody instanceof ArrayBuffer)
        bodyBuf = Buffer.from(new Uint8Array(rawBody));
      else if (typeof (rawBody as ReadableStream).getReader === "function") {
        const reader = (rawBody as ReadableStream).getReader();
        const parts: Uint8Array[] = [];
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) parts.push(value);
        }
        bodyBuf = Buffer.concat(parts);
      } else bodyBuf = Buffer.from(String(rawBody));
    }

    return new Promise((resolve, reject) => {
      const cleanup = (socket?: Socket, tlsSock?: tls.TLSSocket) => {
        try {
          tlsSock?.removeAllListeners();
          tlsSock?.destroy();
        } catch { /* ignore */ }
        try {
          socket?.removeAllListeners();
          socket?.destroy();
        } catch { /* ignore */ }
      };

      const connectReq = http.request({
        host: proxyUrl.hostname,
        port: parseInt(proxyUrl.port),
        method: "CONNECT",
        path: `${target.hostname}:443`,
      });

      connectReq.on("connect", (connectRes, socket) => {
        if (connectRes.statusCode !== 200) {
          cleanup(socket);
          reject(new Error(`Proxy CONNECT rejected: ${connectRes.statusCode}`));
          return;
        }

        const tlsSocket = tls.connect(
          { host: target.hostname, socket, servername: target.hostname },
          () => {
            let headerStr = `${method} ${target.pathname}${target.search} HTTP/1.1\r\nHost: ${target.hostname}\r\n`;
            headers.forEach((v, k) => {
              headerStr += `${k}: ${v}\r\n`;
            });
            if (bodyBuf.length && !headers.has("content-length"))
              headerStr += `Content-Length: ${bodyBuf.length}\r\n`;
            headerStr += "Connection: close\r\n\r\n";
            tlsSocket.write(headerStr);
            if (bodyBuf.length) tlsSocket.write(bodyBuf);
          }
        );

        let headersParsed = false;
        let statusCode = 200;
        let respHeaders: Record<string, string> = {};
        let contentLength = -1;
        let headerBuf = Buffer.alloc(0);
        const bodyChunks: Buffer[] = [];
        let bodyReceived = 0;
        let resolved = false;

        function tryResolve() {
          if (resolved) return;
          resolved = true;
          const rawBody = Buffer.concat(bodyChunks);
          const isChunked = (respHeaders["transfer-encoding"] ?? "").includes(
            "chunked"
          );
          let finalBody: Buffer;
          if (isChunked) {
            const parts: Buffer[] = [];
            let remaining = rawBody;
            while (remaining.length > 0) {
              const le = remaining.indexOf(Buffer.from("\r\n"));
              if (le === -1) break;
              const cs = parseInt(
                remaining.slice(0, le).toString().trim(),
                16
              );
              if (isNaN(cs) || cs === 0) break;
              const start = le + 2;
              if (start + cs > remaining.length) break;
              parts.push(remaining.slice(start, start + cs));
              remaining = remaining.slice(start + cs + 2);
            }
            finalBody = Buffer.concat(parts);
          } else {
            finalBody = rawBody;
          }
          const nullBody = [101, 204, 205, 304].includes(statusCode);
          resolve(
            new Response(nullBody ? null : new Uint8Array(finalBody), {
              status: statusCode,
              headers: respHeaders,
            })
          );
          cleanup(socket, tlsSocket);
        }

        function tryReject(err: Error) {
          if (resolved) return;
          resolved = true;
          cleanup(socket, tlsSocket);
          reject(err);
        }

        tlsSocket.on("data", (chunk: Buffer) => {
          if (!headersParsed) {
            headerBuf = Buffer.concat([headerBuf, chunk]);
            const idx = headerBuf.indexOf("\r\n\r\n");
            if (idx === -1) return;
            headersParsed = true;
            const hdr = headerBuf.slice(0, idx).toString();
            const lines = hdr.split("\r\n");
            statusCode = parseInt(lines[0].split(" ")[1]) || 200;
            for (let i = 1; i < lines.length; i++) {
              const ci = lines[i].indexOf(": ");
              if (ci > 0)
                respHeaders[lines[i].slice(0, ci).toLowerCase()] =
                  lines[i].slice(ci + 2);
            }
            contentLength = respHeaders["content-length"]
              ? parseInt(respHeaders["content-length"])
              : -1;
            const rest = headerBuf.slice(idx + 4);
            if (rest.length > 0) {
              bodyChunks.push(rest);
              bodyReceived += rest.length;
            }
            if ([101, 204, 205, 304].includes(statusCode)) {
              tryResolve();
              return;
            }
            if (contentLength >= 0 && bodyReceived >= contentLength) {
              tryResolve();
              return;
            }
          } else {
            bodyChunks.push(chunk);
            bodyReceived += chunk.length;
            if (contentLength >= 0 && bodyReceived >= contentLength) {
              tryResolve();
              return;
            }
          }
        });
        tlsSocket.on("end", tryResolve);
        tlsSocket.on("error", (e) => tryReject(e));
        tlsSocket.setTimeout(300000, () =>
          tryReject(new Error("TLS socket timeout"))
        );
      });

      connectReq.on("error", (e) => reject(e));
      connectReq.setTimeout(30000, () => {
        connectReq.destroy();
        reject(new Error("CONNECT timeout"));
      });
      connectReq.end();
    });
  } as typeof fetch;

  return proxyFetchFn;
}
