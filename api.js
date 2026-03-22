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

Your job is to transform raw author context into a PREMIUM workbook-style product concept.

Return ONLY valid JSON in this exact format:
{
  "author": "",
  "title": "",
  "subtitle": "",
  "category": "",
  "tone": "",
  "hook": ""
}

CRITICAL RULES:

AUTHOR:
- extract full name if possible

TITLE (VERY IMPORTANT):
- must feel like a premium product, not a technical system
- must NOT sound generic or boring
- avoid words like "system", "method", "process" as the MAIN title
- should sound like a real book or high-value program
- 2–4 words max
- strong, clear, commercial

BAD:
"Client Conversion System"
"Sales Method"
"Business Process"

GOOD:
"The Conversion Code"
"The Client Magnet"
"The Authority Engine"
"Trust That Sells"
"The Relationship Advantage"

SUBTITLE:
- must clearly explain transformation
- must feel structured (workbook / framework / system)
- should imply execution (not theory)
- can be longer than title

GOOD EXAMPLE:
"A step-by-step workbook to turn conversations into a predictable client system without cold outreach or pressure"

CATEGORY:
- broad market category (e.g. Business, Marketing, Sales, Personal Development)

TONE:
- choose one of: premium, classic, modern, bold

HOOK (CRITICAL):
- must feel like a strong promise
- must include transformation or result
- should sound like a landing page headline
- 6–10 words
- must NOT be generic

BAD:
"Learn how to build trust"
"Improve your sales"

GOOD:
"Convert conversations into predictable high-value clients"
"Turn trust into a consistent client acquisition system"
"Build a pipeline of clients without chasing or pressure"

STRICT:
- no markdown
- no explanation
- no extra keys
- return ONLY JSON
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

    console.log("OPENAI RAW:", JSON.stringify(data, null, 2));

    if (!response.ok) {
      return res.status(response.status).json({
        ok: false,
        error: "OpenAI API error",
        openai: data
      });
    }

    const text = data.choices?.[0]?.message?.content;

    if (!text) {
      return res.status(500).json({
        ok: false,
        error: "Empty response from AI",
        openai: data
      });
    }

    const cleaned = text
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    const parsed = safeParseJSON(cleaned);

    if (!parsed) {
      return res.status(500).json({
        ok: false,
        error: "Invalid JSON from AI",
        raw: text,
        cleaned,
        openai: data
      });
    }

    if (parsed.hook) {
      parsed.hook = String(parsed.hook).slice(0, 120);
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
