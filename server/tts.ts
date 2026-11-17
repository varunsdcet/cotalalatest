/** Neural listing voice — Microsoft Edge voices, Google Translate TTS as fallback. */

import { WebSocket } from "ws";

const EDGE_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";

const VOICES = {
  female: "en-US-JennyNeural",
  male: "en-US-AndrewNeural",
} as const;

function xmlEscape(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function connectionId() {
  return crypto.randomUUID().replace(/-/g, "");
}

function ts() {
  return new Date().toISOString().replace("Z", "");
}

function toSsml(text: string, gender: "male" | "female") {
  const voice = VOICES[gender] || VOICES.female;
  const pitch = gender === "male" ? "-2%" : "+0%";
  return (
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
    `<voice name='${voice}'>` +
    `<prosody rate='-8%' pitch='${pitch}'>${xmlEscape(text)}</prosody>` +
    `</voice></speak>`
  );
}

function splitChunks(text: string, max = 180) {
  const parts = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let buf = "";
  for (const part of parts) {
    if ((buf + " " + part).trim().length <= max) {
      buf = buf ? `${buf} ${part}` : part;
    } else {
      if (buf) chunks.push(buf);
      if (part.length <= max) buf = part;
      else {
        for (let i = 0; i < part.length; i += max) chunks.push(part.slice(i, i + max));
        buf = "";
      }
    }
  }
  if (buf) chunks.push(buf);
  return chunks.length ? chunks : [text.slice(0, max)];
}

async function googleTts(text: string): Promise<Buffer> {
  const chunks = splitChunks(text);
  const buffers: Buffer[] = [];
  for (const chunk of chunks) {
    const url =
      "https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=en-US&q=" +
      encodeURIComponent(chunk);
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        Referer: "https://translate.google.com/",
      },
    });
    if (!res.ok) throw new Error(`Google TTS ${res.status}`);
    buffers.push(Buffer.from(await res.arrayBuffer()));
  }
  return Buffer.concat(buffers);
}

function edgeAudioFromMessage(data: Buffer) {
  if (data.length < 4) return null;
  const headerLen = data.readUInt16BE(0);
  if (headerLen > 0 && headerLen + 2 < data.length) {
    const head = data.subarray(2, 2 + headerLen).toString("utf8");
    if (/Path:\s*audio/i.test(head)) {
      const body = data.subarray(2 + headerLen);
      return body.length ? body : null;
    }
  }
  const split = data.indexOf("\r\n\r\n");
  if (split > 0) {
    const head = data.subarray(0, split).toString("utf8");
    if (/Path:\s*audio/i.test(head)) {
      const body = data.subarray(split + 4);
      return body.length ? body : null;
    }
  }
  return null;
}

async function edgeTts(text: string, gender: "male" | "female"): Promise<Buffer> {
  const id = connectionId();
  const url =
    `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1` +
    `?TrustedClientToken=${EDGE_TOKEN}&ConnectionId=${id}`;
  const ws = new WebSocket(url, {
    headers: {
      Pragma: "no-cache",
      "Cache-Control": "no-cache",
      Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0",
    },
  });

  const chunks: Buffer[] = [];

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error("Edge TTS timeout"));
    }, 20000);

    ws.on("error", () => {
      clearTimeout(timer);
      reject(new Error("Edge TTS socket error"));
    });

    ws.on("open", () => {
      const config = JSON.stringify({
        context: {
          synthesis: {
            audio: {
              metadataoptions: { sentenceBoundaryEnabled: "false", wordBoundaryEnabled: "false" },
              outputFormat: "audio-24khz-48kbitrate-mono-mp3",
            },
          },
        },
      });
      ws.send(
        `X-Timestamp:${ts()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n${config}`,
      );
      ws.send(
        `X-RequestId:${id}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${ts()}Z\r\nPath:ssml\r\n\r\n${toSsml(text, gender)}`,
      );
    });

    ws.on("message", (raw) => {
      if (!Buffer.isBuffer(raw)) {
        if (String(raw).includes("Path:turn.end")) {
          clearTimeout(timer);
          ws.close();
          resolve();
        }
        return;
      }
      const preview = raw.subarray(0, Math.min(raw.length, 240)).toString("utf8");
      if (preview.includes("Path:turn.end")) {
        clearTimeout(timer);
        ws.close();
        resolve();
        return;
      }
      const audio = edgeAudioFromMessage(raw);
      if (audio) chunks.push(audio);
    });

    ws.on("close", () => {
      clearTimeout(timer);
      resolve();
    });
  });

  if (!chunks.length) throw new Error("Edge TTS returned no audio");
  return Buffer.concat(chunks);
}

export async function synthesizeListingVoice(
  text: string,
  gender: "male" | "female" = "female",
): Promise<{ buffer: Buffer; mime: string }> {
  const clipped = text.replace(/\s+/g, " ").trim().slice(0, 1400);
  if (!clipped) throw new Error("No text to speak");
  try {
    const buffer = await edgeTts(clipped, gender);
    if (buffer.length > 800) return { buffer, mime: "audio/mpeg" };
  } catch {
    /* Google is the fallback */
  }
  const buffer = await googleTts(clipped);
  if (buffer.length < 800) throw new Error("TTS audio empty");
  return { buffer, mime: "audio/mpeg" };
}
