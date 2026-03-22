import express from "express";

const router = express.Router();

function safeParseJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function detectLanguage(text) {
  const input = String(text || "").trim();

  if (!input) return "english";

  const polishChars = /[ąćęłńóśźż]/i;
  const polishWords =
    /\b(że|się|jest|oraz|który|która|sprzedaż|klient|klienci|zaufanie|biznes|relacje)\b/i;

  if (polishChars.test(input) || polishWords.test(input)) {
    return "polish";
  }

  return "english";
}

router.get("/author/analyze", (_req, res) => {
  return res.status(200).json({
    ok: true,
    message: "GET test działa"
  });
});

router.post("/author/analyze", async (req, res) => {
  const { linkedinInput, authorContext } = req.body;

  if (!linkedinInput && !authorContext) {
    return res.status(400).json({
      ok: false,
      error: "No input"
    });
  }

  const combinedInput = `
LINKEDIN / BIO:
${linkedinInput || ""}

BOOK DESCRIPTIONS / EXTRA CONTEXT:
${authorContext || ""}
`.trim();

  const detectedLanguage = detectLanguage(combinedInput);

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
            content: `
You are a high-level book and product positioning strategist.

IMPORTANT:
- always respond in the SAME LANGUAGE as the input
- do NOT translate

Return ONLY valid JSON:
{
  "author": "",
  "title": "",
  "subtitle": "",
  "category": "",
  "tone": "",
  "hook": ""
}

TITLE:
- must feel like a product / system
- 2–4 words max
- distinctive, sellable
- avoid generic phrases

SUBTITLE:
- describe transformation + result
- practical, execution-based
- sounds like product promise

HOOK (CRITICAL):
- MAX 8 words
- must be punchy
- must NOT repeat the title idea
- must ADD new value (result / mechanism / benefit)
- must feel like headline

BAD:
Title: Silnik Zaufania
Hook: Zamieniaj rozmowy w klientów (powtórzenie)

GOOD:
Title: Silnik Zaufania
Hook: Buduj klientów bez presji sprzedaży

GOOD:
Title: The Authority Loop
Hook: Build clients without chasing

CATEGORY:
- natural language

TONE:
- premium / classic / modern / bold

STRICT:
- JSON only
- no explanation
`
          },
          {
            role: "user",
            content: combinedInput
          }
        ],
        temperature: 0.8
      })
    });

    const data = await response.json();

    const text = data.choices?.[0]?.message?.content;

    const cleaned = text
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    const parsed = safeParseJSON(cleaned);

    if (!parsed) {
      return res.status(500).json({
        ok: false,
        error: "Invalid JSON from AI"
      });
    }

    if (parsed.hook) {
      parsed.hook = String(parsed.hook).slice(0, 80);
    }

    return res.status(200).json({
      ok: true,
      result: parsed
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

export default router;
