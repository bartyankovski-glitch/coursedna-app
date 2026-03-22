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
    /\b(że|się|jest|oraz|który|która|które|sprzedaż|sprzedaży|klient|klienci|zaufanie|biznes|strategia|relacje|rozmowy|autora|książka|książki|workbook)\b/i;

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

IMPORTANT LANGUAGE RULE:
- always respond in the SAME LANGUAGE as the source input
- if the source input is Polish, respond in Polish
- if the source input is English, respond in English
- do NOT translate into another language
- for this task, detected language is: ${detectedLanguage}

Your job is to transform raw author context into a premium workbook-style product concept.

Return ONLY valid JSON in this exact format:
{
  "author": "",
  "title": "",
  "subtitle": "",
  "category": "",
  "tone": "",
  "hook": ""
}

GENERAL RULES:
- think like a premium product strategist, not like a generic copywriter
- the output should feel sellable, distinctive and market-ready
- avoid boring, generic, obvious phrasing

AUTHOR:
- extract full name if possible

TITLE (CRITICAL):
- must feel like a branded product, framework, mechanism or named method
- must NOT sound generic
- must NOT sound like a textbook category
- avoid titles built from obvious descriptors like:
  "Trust-Based Sales System"
  "Relationship Sales Method"
  "Client Acquisition Process"
  "Sprzedaż oparta na zaufaniu"
  "System sprzedaży relacyjnej"
- avoid overused structural words as the main form:
  system, method, process, framework, blueprint, guide
- these words can inspire the idea, but should NOT dominate the title
- title should feel distinctive, memorable and commercially strong
- 2-4 words max
- keep it natural in the source language

BAD ENGLISH:
"Trust-Based Sales System"
"Client Conversion System"
"Sales Method"
"Business Process"

GOOD ENGLISH:
"The Trust Engine"
"The Authority Loop"
"The Conversion Code"
"The Client Magnet"
"The Referral Switch"

BAD POLISH:
"System zaufania w sprzedaży"
"Sprzedaż oparta na relacjach"
"Metoda pozyskiwania klientów"

GOOD POLISH:
"Silnik Zaufania"
"Pętla Autorytetu"
"Kod Konwersji"
"Magnes Klienta"
"Mechanizm Poleceń"

SUBTITLE:
- must describe transformation + result
- practical, execution-based
- should feel like a workbook promise
- should explain what the user achieves
- can be longer than the title
- must feel specific, not vague
- avoid sounding like an academic description
- keep it natural in the source language

GOOD ENGLISH:
"A practical workbook to turn conversations into consistent premium clients without cold outreach"

GOOD POLISH:
"Praktyczny workbook, który pomaga zamieniać rozmowy w stałych klientów bez presji sprzedażowej"

HOOK (CRITICAL):
- MAX 8 words
- must be punchy
- must NOT repeat the title idea
- must ADD a new value layer: result, mechanism, advantage or promise
- must feel like a headline
- avoid filler words
- avoid vague or soft wording
- keep it natural in the source language

BAD ENGLISH:
"Master client conversations effortlessly"
"Transform relationships into predictable income streams"

GOOD ENGLISH:
"Turn trust into premium clients"
"Build clients without chasing"
"Convert conversations into revenue"

BAD POLISH:
"Zamieniaj rozmowy w płacących klientów" if the title already says almost the same
"Buduj relacje i sprzedawaj więcej"

GOOD POLISH:
"Buduj klientów bez presji sprzedaży"
"Zamień zaufanie w stałą sprzedaż"
"Twórz klientów bez gonienia za leadami"

CATEGORY:
- broad market category
- keep it natural in the source language
- examples:
  Business
  Sales
  Marketing
  Personal Development
  Biznes
  Sprzedaż
  Marketing
  Rozwój osobisty

TONE:
- choose exactly one of:
  premium
  classic
  modern
  bold

STRICT:
- return JSON only
- no markdown
- no explanation
- no extra keys
`
          },
          {
            role: "user",
            content: combinedInput
          }
        ],
        temperature: 0.85
      })
    });

    const data = await response.json();

    const text = data.choices?.[0]?.message?.content;

    if (!response.ok) {
      return res.status(response.status).json({
        ok: false,
        error: "OpenAI API error",
        openai: data
      });
    }

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
        cleaned
      });
    }

    if (parsed.author) {
      parsed.author = String(parsed.author).trim();
    }

    if (parsed.title) {
      parsed.title = String(parsed.title).trim();
    }

    if (parsed.subtitle) {
      parsed.subtitle = String(parsed.subtitle).trim();
    }

    if (parsed.category) {
      parsed.category = String(parsed.category).trim();
    }

    if (parsed.hook) {
      parsed.hook = String(parsed.hook).trim().slice(0, 80);
    }

    if (parsed.tone) {
      const tone = String(parsed.tone).trim().toLowerCase();
      parsed.tone = ["premium", "classic", "modern", "bold"].includes(tone)
        ? tone
        : "premium";
    } else {
      parsed.tone = "premium";
    }

    return res.status(200).json({
      ok: true,
      language: detectedLanguage,
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
