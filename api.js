import express from "express";

const router = express.Router();

router.get("/author/analyze", (_req, res) => {
  return res.status(200).json({
    ok: true,
    message: "GET test działa"
  });
});

router.post("/author/analyze", async (req, res) => {
  const { input } = req.body;

  if (!input) {
    return res.status(400).json({
      ok: false,
      error: "No input"
    });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a book positioning strategist.

Analyze the author based on provided context and return ONLY valid JSON:
{
  "author": "",
  "title": "",
  "subtitle": "",
  "category": "",
  "tone": ""
}`
          },
          {
            role: "user",
            content: input
          }
        ],
        temperature: 0.7
      })
    });

    const data = await response.json();

    const text = data?.choices?.[0]?.message?.content;

    if (!text) {
      return res.status(500).json({
        ok: false,
        error: "Empty response from AI"
      });
    }

    let parsed;

    try {
      parsed = JSON.parse(text);
    } catch {
      return res.status(500).json({
        ok: false,
        error: "Invalid JSON from AI",
        raw: text
      });
    }

    return res.status(200).json({
      ok: true,
      result: parsed
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "Server error",
      details: err.message
    });
  }
});

export default router;
