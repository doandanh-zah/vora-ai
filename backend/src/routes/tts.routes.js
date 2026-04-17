import { Router } from "express";
import { z } from "zod";

const humeSchema = z.object({
  text: z.string().min(1).max(4000),
  voiceId: z.string().min(1).max(200).optional(),
});

function requireHumeConfig(config) {
  if (!config.hume.apiKey) {
    const error = new Error("Hume backend env missing: HUME_API_KEY");
    error.statusCode = 503;
    throw error;
  }
}

function handleError(res, error) {
  const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
  res.status(statusCode).json({ error: error.message || "TTS request failed" });
}

export function createTtsRouter({ config }) {
  const router = Router();

  router.post("/hume", async (req, res) => {
    try {
      requireHumeConfig(config);
      const parsed = humeSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid payload", details: parsed.error.issues });
        return;
      }

      const response = await fetch("https://api.hume.ai/v0/tts/file", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Hume-Api-Key": config.hume.apiKey,
        },
        body: JSON.stringify({
          utterances: [
            {
              text: parsed.data.text,
              voice: {
                id: parsed.data.voiceId || config.hume.voiceId,
              },
              speed: 1.0,
            },
          ],
          format: {
            type: "mp3",
          },
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        const error = new Error(
          `Hume TTS request failed (${response.status}): ${detail.slice(0, 280) || "empty response"}`,
        );
        error.statusCode = 502;
        throw error;
      }

      const audioBytes = Buffer.from(await response.arrayBuffer());
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Cache-Control", "no-store");
      res.send(audioBytes);
    } catch (error) {
      handleError(res, error);
    }
  });

  return router;
}
