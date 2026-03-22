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
    /\b(że|się|jest|oraz|który|która|które|sprzedaż|sprzedaży|książka|książki|autor|autora|klient|klienci|zaufanie|biznes|marka|szkolenia|network marketing|relacje)\b/i;

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

Your job is to transform raw author context into a PREMIUM workbook-style product concept that feels like a paid course or system.

IMPORTANT LANGUAGE RULE:
- detect the language of the user's source material
- if the input is in Polish, return ALL fields in Polish
- if the input is in English, return ALL fields in English
- do NOT translate into another language
- keep the output in the same language as the source material

Detected language for this task: ${detectedLanguage}

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

TITLE (CRITICAL — DIFFERENT LEVEL):
- must feel like a SYSTEM, FRAMEWORK or MECHANISM
- must feel proprietary or distinctive
- must NOT sound generic or common
- avoid overused words like: blueprint, guide, system (unless stylized and strong)
- must feel like something you could SELL as a paid program
- 2–4 words max
- must sound commercially strong
- keep it natural in the source language

BAD:
"The Trust Factor"
"Client System"
"Sales Method"
"Poradnik Sprzedaży"
"System Klienta"

GOOD:
"The Trust Engine"
"The Authority Loop"
"The Conversion Code"
"The Client Magnet"
"Silnik Zaufania"
"Kod Konwersji"
"Magnes Klienta"
"Pętla Autorytetu"

SUBTITLE:
- must clearly describe transformation AND outcome
- must feel practical and execution-oriented
- must describe WHO + RESULT + HOW
- must sound like a product promise
- should fit a workbook / implementation format
- keep it natural in the source language

GOOD:
"A practical workbook to turn conversations into consistent high-value clients without cold outreach"
"Praktyczny workbook, który pomaga zamieniać rozmowy w stałych klientów bez zimnego outreachu"

CATEGORY:
- broad market category
- keep it natural in the same language as the input

TONE:
- choose one of exactly these values:
  "premium", "classic", "modern", "bold"

HOOK (CRITICAL — MUST BE SHORT):
- MAX 8 words
- must feel punchy and sharp
- must be immediately understandable
- must focus on RESULT
- no filler words
- no long phrases
- keep it natural in the same language as the input

BAD:
"Turn your expertise into a reliable income-generating machine"
"Turn relationships into reliable client acquisition pathways"
"Zamień swoją wiedzę w niezawodną maszynę generującą dochód"

GOOD:
"Turn conversations into premium clients"
"Convert trust into predictable revenue"
"Build clients without chasing"
"Turn trust into consistent clients"
"Zamieniaj rozmowy w płacących klientów"
"Zamień zaufanie w przewidywalną sprzedaż"
"Buduj klientów bez gonienia"

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
      parsed.hook = String(parsed.hook).slice(0, 80);
    }

    return res.status(200).json({
      ok: true,
      language: detectedLanguage,
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
