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
LINKEDIN / BIO AUTORA:
${linkedinInput || ""}

OPISY KSIĄŻEK / DODATKOWY KONTEKST:
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
You are a high-level positioning strategist for AI-powered knowledge products.

Your job is to transform raw author context into a strong, marketable AiBook concept.

AiBook means:
- a practical transformation tool
- usually structured like a workbook
- designed to help the reader achieve a result
- usable as a standalone product
- optionally expandable into a future course, but not necessarily

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

TITLE:
- must be a compelling commercial product title
- MUST NOT be a generic topic like "MLM", "Marketing", "Sales", "Business"
- MUST sound like a real paid knowledge product people would want to buy
- 2-5 words max
- strong, clear, specific
- should suggest transformation, method, system, roadmap, blueprint, playbook, framework or practical result
- should fit an AiBook/workbook product, not an academic or traditional book

BAD:
"MLM"
"Sales"
"Business"
"Marketing Strategy"

GOOD:
"The MLM Blueprint"
"Network That Sells"
"Authority Builder Method"
"Client Magnet Playbook"
"Referral Growth System"

SUBTITLE:
- MUST position the product as practical and transformation-focused
- should imply workbook logic, exercises, templates, frameworks, prompts, steps or guided implementation
- should promise a result, shift, structure or practical outcome
- should work both as:
  1) a standalone AiBook/workbook
  2) a possible base for a future course
- must NOT sound academic or vague

HOOK:
- must be short
- 4-10 words ideally
- must sound like a product promise
- should fit on a cover
- should create desire, clarity or transformation

GOOD HOOK EXAMPLES:
"Build clients through trusted relationships"
"Turn expertise into predictable income"
"Close more deals without pressure"
"Grow authority that attracts buyers"

CATEGORY:
- broad market category, suitable for online knowledge products
- examples: Business, Marketing, Sales, Personal Development, Leadership, Productivity

TONE:
- choose one of: premium, classic, modern, bold

AIBOOK STRATEGY:
- this is not a traditional book
- this is not theory-first
- this is not a generic ebook
- it should feel like a premium guided implementation tool
- prioritize:
  - transformation
  - clarity
  - usability
  - frameworks
  - exercises
  - action steps
  - prompts
  - structured implementation
- the concept should feel monetizable as a premium digital product

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
        temperature: 0.7
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
      .replace(/```json/g, "")
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
