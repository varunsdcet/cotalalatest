import type { Express } from "express";
import type { Server } from "http";
import { synthesizeListingVoice } from "./tts.ts";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.post("/api/tts", async (req, res) => {
    try {
      const text = String(req.body?.text || "").trim();
      const gender = req.body?.gender === "male" ? "male" : "female";
      if (!text) {
        res.status(400).json({ message: "Missing text" });
        return;
      }
      const { buffer, mime } = await synthesizeListingVoice(text, gender);
      res.setHeader("Content-Type", mime);
      res.setHeader("Cache-Control", "no-store");
      res.send(buffer);
    } catch (err) {
      console.error("TTS failed", err);
      res.status(502).json({ message: "Voice synthesis failed" });
    }
  });

  return httpServer;
}
