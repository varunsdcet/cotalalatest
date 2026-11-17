import type { KitBrand, KitListing } from "./kit-cards";
import { blobTypeForMime, loadReelImage, pickRecorderMime } from "./reel";
import { DEFAULT_TRACK_ID, libraryTrackUrl, mixAudioTracks } from "./reel-music";
import {
  type SlideshowLook,
  drawSlideshowLook,
  slideshowDuration,
  slideshowPhotoLimit,
  slideshowSize,
  slideshowVoiceDelay,
} from "./slideshow-looks";

export type { SlideshowLook };
export { slideshowDuration, slideshowPhotoLimit, slideshowSize, slideshowVoiceDelay };

export const SLIDE_FPS = 60;
export const SLIDE_BITRATE = 20_000_000;

/** Speak unit codes like A22 as "A 22", not "address thousand". */
export function forSpeech(text: string): string {
  return text
    .replace(/\b([A-Za-z])[-\s]?(\d{1,4})\s*[-–—]\s*(?=\d)/g, (_, letter: string, unit: string) => `${letter.toUpperCase()} ${unit}, `)
    .replace(/\b([A-Za-z])-(\d{1,4})\b/g, (_, letter: string, unit: string) => `${letter.toUpperCase()} ${unit}`)
    .replace(/\b([A-Za-z])(\d{1,4})\b/g, (_, letter: string, unit: string) => `${letter.toUpperCase()} ${unit}`)
    .replace(/\s+/g, " ")
    .trim();
}

function specCount(raw: string) {
  const m = (raw || "").replace(/,/g, "").match(/[\d.]+/);
  return m ? m[0] : "";
}

export function realtorScript(listing: KitListing, brand: KitBrand): string {
  const name = brand.name || "your realtor";
  const parts: string[] = [`Hi, I'm ${name}.`];
  if (listing.address) parts.push(`Come take a look at ${listing.address}.`);
  if (listing.price) parts.push(`This home is listed at ${listing.price}.`);
  const beds = specCount(listing.beds);
  const baths = specCount(listing.baths);
  const sqft = specCount(listing.sqft);
  const facts = [
    beds && `${beds} bedrooms`,
    baths && `${baths} bathrooms`,
    sqft && `${Number(sqft).toLocaleString("en-US")} square feet`,
  ].filter(Boolean);
  if (facts.length === 1) parts.push(`It offers ${facts[0]}.`);
  else if (facts.length === 2) parts.push(`Inside, you'll find ${facts[0]}, and ${facts[1]}.`);
  else if (facts.length > 2) parts.push(`Inside, you'll find ${facts.slice(0, -1).join(", ")}, and ${facts[facts.length - 1]}.`);
  const desc = (listing.description || "").replace(/\s+/g, " ").trim();
  if (desc) {
    const sentence = desc.split(/(?<=[.!?])\s+/)[0] || desc;
    parts.push(sentence.slice(0, 180));
  }
  parts.push("I'd love to walk you through it. Reach out anytime, and we'll set up a tour.");
  return parts.join(" ");
}

export function speechSeconds(script: string) {
  const words = script.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(10, words / 2.35);
}

export function drawSlideshowFrame(
  ctx: CanvasRenderingContext2D,
  t: number,
  images: HTMLImageElement[],
  listing: KitListing,
  brand: KitBrand,
  headshot: HTMLImageElement | null,
  duration: number,
  w: number,
  h: number,
  logo: HTMLImageElement | null,
  look: SlideshowLook = "classic",
) {
  drawSlideshowLook(ctx, look, t, duration, images, listing, brand, { headshot, logo }, w, h);
}

export async function fetchRealtorVoiceUrl(
  script: string,
  gender: "male" | "female" = "female",
): Promise<string | null> {
  const text = forSpeech(script).slice(0, 1200);
  if (!text) return null;
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, gender }),
    });
    if (res.ok) {
      const blob = await res.blob();
      if (blob.size > 800) return URL.createObjectURL(blob);
    }
  } catch {
    /* try public TTS */
  }
  const voices =
    gender === "male"
      ? ["en-US-AndrewNeural", "en-US-GuyNeural", "Matthew", "Brian"]
      : ["en-US-JennyNeural", "en-US-AriaNeural", "Joanna", "Amy"];
  for (const voice of voices) {
    try {
      const res = await fetch(
        `https://api.streamelements.com/kappa/v2/speech?voice=${encodeURIComponent(voice)}&text=${encodeURIComponent(text.slice(0, 500))}`,
      );
      if (!res.ok) continue;
      const blob = await res.blob();
      if (blob.size < 800) continue;
      return URL.createObjectURL(blob);
    } catch {
      /* try next voice */
    }
  }
  return null;
}

export function speakRealtor(
  script: string,
  onEnd?: () => void,
  gender: "male" | "female" = "female",
): () => void {
  if (typeof window === "undefined" || !window.speechSynthesis) return () => undefined;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(forSpeech(script));
  utter.rate = 0.88;
  utter.pitch = gender === "male" ? 0.9 : 1.02;
  utter.volume = 1;
  const voices = window.speechSynthesis.getVoices();
  const en = voices.filter((v) => /en/i.test(v.lang));
  const preferred =
    gender === "male"
      ? en.find((v) => /neural|natural|premium|andrew|guy|davis|aria male|google us english|samantha/i.test(v.name) && /male|david|daniel|alex|fred|guy|andrew|tom|daniel|microsoft david|microsoft guy|microsoft andrew/i.test(v.name)) ||
        en.find((v) => /male|david|daniel|mark|alex|fred|tom|daniel|google uk english male|microsoft david|microsoft mark|microsoft guy|evan/i.test(v.name)) ||
        en.find((v) => !/female|samantha|victoria|zira|karen|moira|tessa|fiona|jenny|aria|emma/i.test(v.name)) ||
        en[0]
      : en.find((v) => /neural|natural|premium|jenny|aria|emma|samantha|allison|ava|zoe|google us english/i.test(v.name)) ||
        en.find((v) => /female|samantha|victoria|zira|karen|moira|tessa|fiona|google us english|microsoft zira|microsoft aria|nicky/i.test(v.name)) ||
        en.find((v) => /en-US|en-GB/i.test(v.lang)) ||
        en[0] ||
        null;
  if (preferred) utter.voice = preferred;
  utter.onend = () => onEnd?.();
  window.speechSynthesis.speak(utter);
  return () => {
    window.speechSynthesis.cancel();
  };
}

/** Infer agent voice gender from profile field or first name. */
export function inferAgentGender(
  name: string,
  explicit?: unknown,
): "male" | "female" {
  const raw = String(explicit ?? "").trim().toLowerCase();
  if (/^(m|male|man|mr\.?|sir)$/i.test(raw)) return "male";
  if (/^(f|female|woman|mrs\.?|ms\.?|miss|madam)$/i.test(raw)) return "female";

  const first = (name || "").trim().split(/\s+/)[0]?.replace(/[^a-zA-Z]/g, "") || "";
  const key = first.toLowerCase();
  if (!key) return "female";

  const male = new Set([
    "james","john","robert","michael","william","david","richard","joseph","thomas","charles",
    "christopher","daniel","matthew","anthony","mark","donald","steven","paul","andrew","joshua",
    "kenneth","kevin","brian","george","timothy","ronald","edward","jason","jeffrey","ryan",
    "jacob","gary","nicholas","eric","jonathan","stephen","larry","justin","scott","brandon",
    "benjamin","samuel","raymond","gregory","frank","alexander","patrick","jack","dennis","jerry",
    "tyler","aaron","jose","adam","nathan","henry","douglas","zachary","peter","kyle","noah","ethan",
    "jeremy","walter","christian","keith","roger","terry","sean","gerald","carl","dylan","harold",
    "jordan","jesse","bryan","billy","bruce","gabriel","logan","albert","willie","alan","ralph",
    "randy","roy","eugene","louis","philip","johnny","bradley","craig","stanley","leonard","derek",
    "shyam","syam","babashyam","rahul","amit","raj","rajesh","ravi","suresh","vijay","anil","sunil",
    "arjun","vikram","karan","rohit","sanjay","manish","deepak","prakash","nilesh","nitin","pratik",
    "harsh","kunal","aditya","abhishek","akash","vivek","gautam","mohit","neeraj","pankaj","sachin",
    "varun","yash","om","krish","krishna","ram","hari","dev","ishaan","ayaan","kabir","veer",
    "liam","oliver","lucas","mason","logan","owen","caleb","luke","cole","blake","hunter","chase",
  ]);
  const female = new Set([
    "mary","patricia","jennifer","linda","elizabeth","barbara","susan","jessica","sarah","karen",
    "nancy","lisa","betty","margaret","sandra","ashley","kimberly","emily","donna","michelle",
    "dorothy","carol","amanda","melissa","deborah","stephanie","rebecca","sharon","laura","cynthia",
    "kathleen","amy","angela","shirley","anna","brenda","pamela","emma","nicole","helen","samantha",
    "katherine","christine","debra","rachel","catherine","carolyn","janet","ruth","maria","heather",
    "diane","virginia","julie","joyce","victoria","olivia","kelly","christina","joan","evelyn",
    "judith","megan","cheryl","andrea","hannah","jacqueline","martha","gloria","teresa","ann",
    "sara","madison","frances","kathryn","janice","jean","abigail","alice","judy","sophia","grace",
    "priya","neha","pooja","anjali","divya","kavita","sunita","meena","rekha","sita","geeta","rita",
    "shreya","ishita","aisha","fatima","zara","maya","nina","riya","diya","anya","kira","lara",
    "ava","mia","isabella","charlotte","amelia","harper","evelyn","ella","scarlett","chloe","layla",
    "penelope","aria","luna","nora","hazel","violet","aurora","savannah","brooklyn","paisley",
  ]);

  if (male.has(key)) return "male";
  if (female.has(key)) return "female";
  /* Soft endings often female in English names */
  if (/(a|ia|elle|ette|ine|lyn|leigh)$/i.test(key) && key.length > 3) return "female";
  return "female";
}

export async function recordSlideshow(opts: {
  photos: string[];
  listing: KitListing;
  brand: KitBrand;
  script: string;
  voiceUrl?: string | null;
  music?: boolean;
  look?: SlideshowLook;
  onProgress?: (pct: number) => void;
}): Promise<Blob> {
  const look = opts.look ?? "classic";
  const { w, h } = slideshowSize(look);
  const limit = slideshowPhotoLimit(look);
  const images = (await Promise.all(opts.photos.slice(0, limit).map((u) => loadReelImage(u)))).filter(Boolean) as HTMLImageElement[];
  if (!images.length) throw new Error("No photos to render");
  const [headshot, logo] = await Promise.all([
    opts.brand.headshot ? loadReelImage(opts.brand.headshot) : Promise.resolve(null),
    opts.brand.logo ? loadReelImage(opts.brand.logo) : Promise.resolve(null),
  ]);
  const duration = slideshowDuration(look, images.length);
  const mime = pickRecorderMime();
  if (!mime) throw new Error("This browser cannot record video. Use Chrome.");

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.style.cssText = "position:fixed;left:-9999px;top:0;pointer-events:none";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
  if (!ctx) {
    canvas.remove();
    throw new Error("Canvas unavailable");
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const frameCount = Math.max(1, Math.ceil(duration * SLIDE_FPS));
  const frameMs = 1000 / SLIDE_FPS;
  const bitrate = mime.startsWith("video/webm") ? 8_000_000 : 12_000_000;

  drawSlideshowFrame(ctx, 0, images, opts.listing, opts.brand, headshot, duration, w, h, logo, look);

  /* captureStream(0) + requestFrame often yields a silent/empty Chrome blob. Drive the encoder with a real fps. */
  let stream: MediaStream = canvas.captureStream(SLIDE_FPS);
  const frameTrack = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };
  try {
    frameTrack.contentHint = "detail";
  } catch {
    /* ignore */
  }
  frameTrack.requestFrame?.();

  const audioTracks: Array<{ url: string; volume: number; loop?: boolean; delay?: number }> = [];
  if (opts.music) audioTracks.push({ url: libraryTrackUrl(DEFAULT_TRACK_ID), volume: opts.voiceUrl ? 0.08 : 0.42, loop: true });
  if (opts.voiceUrl) {
    audioTracks.push({
      url: opts.voiceUrl,
      volume: 1,
      loop: false,
      delay: slideshowVoiceDelay(look),
    });
  }
  let stopAudio: (() => void) | null = null;
  let armDelayedAudio: (() => void) | null = null;
  if (audioTracks.length) {
    try {
      const mixed = await mixAudioTracks(stream, audioTracks);
      stream = mixed.stream;
      stopAudio = mixed.stop;
      armDelayedAudio = mixed.armDelayed;
    } catch {
      /* keep video-only */
    }
  }

  const recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: bitrate,
    audioBitsPerSecond: 128_000,
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data?.size) chunks.push(e.data);
  };
  const started = new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("Recorder did not start")), 5000);
    recorder.onstart = () => {
      window.clearTimeout(timer);
      resolve();
    };
  });
  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onerror = () => reject(new Error("Recording failed"));
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: blobTypeForMime(mime) });
      if (blob.size < 8000) reject(new Error("Recording was empty. Try Chrome, then refresh."));
      else resolve(blob);
    };
  });

  try {
    recorder.start(250);
    await started;
    for (let warm = 0; warm < 6; warm++) {
      drawSlideshowFrame(ctx, 0, images, opts.listing, opts.brand, headshot, duration, w, h, logo, look);
      frameTrack.requestFrame?.();
      await new Promise((r) => setTimeout(r, frameMs));
    }
    armDelayedAudio?.();
    for (let i = 0; i < frameCount; i++) {
      const tick = performance.now();
      const t = Math.min((i + 0.001) / SLIDE_FPS, duration - 0.001);
      drawSlideshowFrame(ctx, t, images, opts.listing, opts.brand, headshot, duration, w, h, logo, look);
      frameTrack.requestFrame?.();
      const wait = frameMs - (performance.now() - tick);
      if (wait > 1) await new Promise((r) => setTimeout(r, wait));
      opts.onProgress?.(Math.min(99, Math.round(((i + 1) / frameCount) * 100)));
    }
    if (recorder.state === "recording") {
      try {
        recorder.requestData();
      } catch {
        /* ignore */
      }
      await new Promise((r) => setTimeout(r, 400));
      recorder.stop();
    } else {
      throw new Error("Recorder stopped before the film finished.");
    }
    opts.onProgress?.(100);
    return await done;
  } finally {
    stopAudio?.();
    stream.getTracks().forEach((tr) => tr.stop());
    canvas.remove();
  }
}
