import net from "node:net";
import tls from "node:tls";
import { once } from "node:events";
import { randomUUID } from "node:crypto";

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
};

export type SmtpMessage = {
  from: string;
  fromName?: string;
  replyTo?: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
};

type SmtpResponse = {
  code: number;
  lines: string[];
};

type LineReader = {
  readLine: () => Promise<string>;
  dispose: () => void;
};

export async function sendSmtpMail(config: SmtpConfig, message: SmtpMessage) {
  let socket = await connect(config);
  let reader = createLineReader(socket);

  try {
    await expectResponse(reader, [220]);
    let capabilities = await ehlo(socket, reader, config.host);

    if (!config.secure && capabilities.has("STARTTLS")) {
      await command(socket, reader, "STARTTLS", [220]);
      reader.dispose();
      socket = await upgradeToTls(socket, config.host);
      reader = createLineReader(socket);
      capabilities = await ehlo(socket, reader, config.host);
    }

    if (config.user && config.password) {
      await authenticate(socket, reader, capabilities, config.user, config.password);
    }

    await command(socket, reader, `MAIL FROM:<${addressOnly(message.from)}>`, [250]);
    await command(socket, reader, `RCPT TO:<${addressOnly(message.to)}>`, [250, 251]);
    await command(socket, reader, "DATA", [354]);
    await write(socket, `${formatMessage(message)}\r\n.\r\n`);
    await expectResponse(reader, [250]);
    await command(socket, reader, "QUIT", [221]);
  } finally {
    reader.dispose();
    socket.end();
  }
}

async function connect(config: SmtpConfig): Promise<net.Socket | tls.TLSSocket> {
  if (config.secure) {
    const socket = tls.connect({ host: config.host, port: config.port, servername: config.host });
    await once(socket, "secureConnect");
    return socket;
  }

  const socket = net.connect({ host: config.host, port: config.port });
  await once(socket, "connect");
  return socket;
}

async function upgradeToTls(socket: net.Socket | tls.TLSSocket, host: string) {
  const secureSocket = tls.connect({ socket, servername: host });
  await once(secureSocket, "secureConnect");
  return secureSocket;
}

function createLineReader(socket: net.Socket | tls.TLSSocket): LineReader {
  socket.setEncoding("utf8");

  let buffer = "";
  const lines: string[] = [];
  const waiters: Array<(line: string) => void> = [];
  const errorWaiters: Array<(error: Error) => void> = [];

  const flush = () => {
    while (waiters.length && lines.length) {
      waiters.shift()!(lines.shift()!);
    }
  };

  const onData = (chunk: string) => {
    buffer += chunk;
    let index = buffer.indexOf("\n");
    while (index !== -1) {
      const line = buffer.slice(0, index).replace(/\r$/, "");
      buffer = buffer.slice(index + 1);
      lines.push(line);
      index = buffer.indexOf("\n");
    }
    flush();
  };

  const onError = (error: Error) => {
    while (errorWaiters.length) errorWaiters.shift()!(error);
  };

  const onEnd = () => onError(new Error("SMTP connection closed"));

  socket.on("data", onData);
  socket.on("error", onError);
  socket.on("end", onEnd);

  return {
    readLine() {
      if (lines.length) return Promise.resolve(lines.shift()!);
      return new Promise((resolve, reject) => {
        waiters.push(resolve);
        errorWaiters.push(reject);
      });
    },
    dispose() {
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("end", onEnd);
    }
  };
}

async function readResponse(reader: LineReader): Promise<SmtpResponse> {
  const lines: string[] = [];
  let code = 0;

  while (true) {
    const line = await reader.readLine();
    lines.push(line);
    code = Number(line.slice(0, 3));
    if (!Number.isFinite(code) || line[3] !== "-") break;
  }

  return { code, lines };
}

async function expectResponse(reader: LineReader, expectedCodes: number[]) {
  const response = await readResponse(reader);
  if (!expectedCodes.includes(response.code)) {
    throw new Error(`SMTP esperaba ${expectedCodes.join("/")} y recibio ${response.lines.join(" | ")}`);
  }
  return response;
}

async function command(socket: net.Socket | tls.TLSSocket, reader: LineReader, value: string, expectedCodes: number[]) {
  await write(socket, `${value}\r\n`);
  return expectResponse(reader, expectedCodes);
}

async function ehlo(socket: net.Socket | tls.TLSSocket, reader: LineReader, host: string) {
  const response = await command(socket, reader, `EHLO ${host}`, [250]);
  return new Set(response.lines.map((line) => line.slice(4).trim().split(/\s+/)[0]?.toUpperCase()).filter(Boolean));
}

async function authenticate(socket: net.Socket | tls.TLSSocket, reader: LineReader, capabilities: Set<string>, user: string, password: string) {
  const authLine = Array.from(capabilities).find((capability) => capability === "AUTH");
  const prefersPlain = Boolean(authLine) || capabilities.has("AUTH");

  if (prefersPlain) {
    const token = Buffer.from(`\0${user}\0${password}`, "utf8").toString("base64");
    try {
      await command(socket, reader, `AUTH PLAIN ${token}`, [235]);
      return;
    } catch {
      // Some servers advertise AUTH but only accept LOGIN. Fall through.
    }
  }

  await command(socket, reader, "AUTH LOGIN", [334]);
  await command(socket, reader, Buffer.from(user, "utf8").toString("base64"), [334]);
  await command(socket, reader, Buffer.from(password, "utf8").toString("base64"), [235]);
}

async function write(socket: net.Socket | tls.TLSSocket, payload: string) {
  if (socket.write(payload)) return;
  await once(socket, "drain");
}

export function formatMessage(message: SmtpMessage) {
  const from = formatAddress(message.from, message.fromName);
  const to = formatAddress(message.to);
  const boundary = `md-ops-${randomUUID()}`;
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(message.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomUUID()}@md-ops.local>`,
    "MIME-Version: 1.0"
  ];

  if (message.replyTo) headers.push(`Reply-To: ${formatAddress(message.replyTo)}`);

  if (!message.html) {
    headers.push("Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: 8bit");
    return `${headers.join("\r\n")}\r\n\r\n${dotStuff(message.text)}`;
  }

  headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
  const body = [
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    message.text,
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    message.html,
    `--${boundary}--`,
    ""
  ].join("\r\n");

  return `${headers.join("\r\n")}\r\n\r\n${dotStuff(body)}`;
}

function dotStuff(value: string) {
  return value.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
}

function formatAddress(address: string, displayName?: string) {
  const cleanAddress = addressOnly(address);
  if (!displayName && address.includes("<")) return sanitizeHeader(address);
  if (!displayName) return cleanAddress;
  return `${encodeDisplayName(displayName)} <${cleanAddress}>`;
}

function encodeDisplayName(value: string) {
  const clean = sanitizeHeader(value);
  if (/^[\x20-\x7e]+$/.test(clean)) return `"${clean.replace(/"/g, '\\"')}"`;
  return encodeHeader(clean);
}

function encodeHeader(value: string) {
  const clean = sanitizeHeader(value);
  if (/^[\x20-\x7e]+$/.test(clean)) return clean;
  return `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

function sanitizeHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function addressOnly(value: string) {
  const clean = sanitizeHeader(value);
  const match = clean.match(/<([^>]+)>/);
  return (match?.[1] ?? clean).trim();
}
