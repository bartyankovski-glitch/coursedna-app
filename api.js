import express from "express";

const router = express.Router();

function safeParseJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = String(text || "").match(/\{[\s\S]*\}/);
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

function normalizeTextForCompare(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()"’?<>[\]\\|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getMeaningfulWords(text) {
  const stopwords = new Set([
    "i", "oraz", "a", "to", "w", "we", "z", "ze", "na", "do", "od", "po", "bez",
    "dla", "jest", "się", "który", "która", "które", "that", "into", "from", "with",
    "without", "the", "and", "for", "your", "this", "these", "those", "practical",
    "praktyczny", "workbook", "guide", "system", "framework", "mechanizm", "metoda",
    "oraz", "przez", "który", "helps", "help", "using", "oparty", "oparta", "oparte",
    "bardzo", "more", "most", "less"
  ]);

  return normalizeTextForCompare(text)
    .split(" ")
    .filter((word) => word.length > 3 && !stopwords.has(word));
}

function hasTooMuchOverlap(hook, subtitle) {
  const hookWords = getMeaningfulWords(hook);
  const subtitleWords = getMeaningfulWords(subtitle);

  if (!hookWords.length || !subtitleWords.length) {
    return false;
  }

  const subtitleSet = new Set(subtitleWords);
  const commonWords = hookWords.filter((word) => subtitleSet.has(word));
  const overlapRatio = commonWords.length / hookWords.length;

  const hookNormalized = normalizeTextForCompare(hook);
  const subtitleNormalized = normalizeTextForCompare(subtitle);

  if (subtitleNormalized.includes(hookNormalized) || hookNormalized.includes(subtitleNormalized)) {
    return true;
  }

  if (overlapRatio >= 0.5) {
    return true;
  }

  return false;
}

function hasSemanticClash(hook, subtitle) {
  const h = normalizeTextForCompare(hook);
  const s = normalizeTextForCompare(subtitle);

  const patterns = [
    ["klient", "klient"],
    ["sprzeda", "sprzeda"],
    ["pozyskiw", "pozyskiw"],
    ["konwers", "konwers"],
    ["relac", "relac"],
    ["rozmow", "rozmow"],
    ["dochód", "doch"],
    ["przych", "przych"],
    ["zaufan", "zaufan"],
    ["autorytet", "autorytet"],
    ["income", "income"],
    ["client", "client"],
    ["sale", "sale"],
    ["sales", "sales"],
    ["convert", "convert"],
    ["conversion", "conversion"],
    ["relationship", "relationship"],
    ["conversation", "conversation"],
    ["revenue", "revenue"],
    ["trust", "trust"],
    ["authority", "authority"]
  ];

  let matches = 0;

  for (const [hookPattern, subtitlePattern] of patterns) {
    if (h.includes(hookPattern) && s.includes(subtitlePattern)) {
      matches++;
    }
  }

  return matches >= 1;
}

function cleanModelText(text) {
  return String(text || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
}

function normalizeToneValue(tone) {
  const value = String(tone || "")
    .trim()
    .toLowerCase();

  return ["premium", "classic", "modern", "bold"].includes(value)
    ? value
    : "premium";
}

function trimResultFields(parsed) {
  if (parsed.author) parsed.author = String(parsed.author).trim();
  if (parsed.title) parsed.title = String(parsed.title).trim();
  if (parsed.subtitle) parsed.subtitle = String(parsed.subtitle).trim();
  if (parsed.category) parsed.category = String(parsed.category).trim();
  if (parsed.hook) parsed.hook = String(parsed.hook).trim().slice(0, 80);

  parsed.tone = normalizeToneValue(parsed.tone || "premium");

  return parsed;
}

function countWords(text) {
  return normalizeTextForCompare(text)
    .split(" ")
    .filter(Boolean).length;
}

function startsWithVerb(hook, language) {
  const normalized = normalizeTextForCompare(hook);
  const firstWord = normalized.split(" ")[0] || "";

  if (!firstWord) return false;

  const polishVerbStarts = [
    "zbuduj",
    "odkryj",
    "uzyskaj",
    "stworz",
    "stwórz",
    "buduj",
    "zacznij",
    "przyciagnij",
    "przyciągnij",
    "zamien",
    "zamień",
    "zwieksz",
    "zwiększ",
    "osiagnij",
    "osiągnij",
    "zdobadz",
    "zdobądź",
    "pokonaj",
    "wykorzystaj",
    "zmien",
    "zmień",
    "przeksztalc",
    "przekształć"
  ];

  const englishVerbStarts = [
    "build",
    "discover",
    "gain",
    "create",
    "start",
    "attract",
    "turn",
    "increase",
    "achieve",
    "win",
    "use",
    "master",
    "transform",
    "change"
  ];

  if (language === "polish") {
    return polishVerbStarts.includes(firstWord);
  }

  return englishVerbStarts.includes(firstWord);
}

function hasWeakHookStyle(hook, language) {
  const value = String(hook || "").trim();
  const normalized = normalizeTextForCompare(value);

  if (!normalized) return true;
  if (countWords(value) > 6) return true;
  if (value.includes(",")) return true;
  if (startsWithVerb(value, language)) return true;

  const badPhrasesPl = [
    "jak ",
    "system ",
    "metoda ",
    "odkryj ",
    "uzyskaj ",
    "zbuduj ",
    "stworz ",
    "stwórz ",
    "zmien ",
    "zmień "
  ];

  const badPhrasesEn = [
    "how ",
    "system ",
    "method ",
    "discover ",
    "build ",
    "gain ",
    "create ",
    "change "
  ];

  const patterns = language === "polish" ? badPhrasesPl : badPhrasesEn;

  for (const pattern of patterns) {
    if (normalized.startsWith(pattern)) {
      return true;
    }
  }

  return false;
}

function scoreHookQuality(hook, language) {
  const value = String(hook || "").trim();
  const normalized = normalizeTextForCompare(value);

  if (!normalized) return 0;

  let score = 100;
  const words = countWords(value);

  if (words > 6) score -= 40;
  if (words > 4) score -= 10;
  if (value.includes(",")) score -= 25;
  if (startsWithVerb(value, language)) score -= 30;

  const genericWordsPl = [
    "klient",
    "klienci",
    "sprzedaż",
    "dochód",
    "dochody",
    "wiedza",
    "biznes",
    "relacje"
  ];

  const genericWordsEn = [
    "client",
    "clients",
    "sales",
    "income",
    "business",
    "knowledge",
    "relationships"
  ];

  const contrastWordsPl = [
    "bez",
    "zamiast",
    "presji",
    "pościgu",
    "zaufania",
    "autorytetu",
    "konwersji"
  ];

  const contrastWordsEn = [
    "without",
    "instead",
    "trust",
    "authority",
    "conversion",
    "pressure"
  ];

  const genericWords = language === "polish" ? genericWordsPl : genericWordsEn;
  const contrastWords = language === "polish" ? contrastWordsPl : contrastWordsEn;

  let genericHits = 0;
  for (const word of genericWords) {
    if (normalized.includes(word)) genericHits++;
  }

  if (genericHits >= 3) score -= 20;
  if (genericHits >= 4) score -= 15;

  let contrastHits = 0;
  for (const word of contrastWords) {
    if (normalized.includes(word)) contrastHits++;
  }

  if (contrastHits >= 1) score += 10;

  const bannedStartsPl = ["uzyskaj", "zbuduj", "odkryj", "stwórz", "stworz", "zmień", "zmien"];
  const bannedStartsEn = ["build", "discover", "gain", "create", "change"];
  const firstWord = normalized.split(" ")[0] || "";
  const bannedStarts = language === "polish" ? bannedStartsPl : bannedStartsEn;

  if (bannedStarts.includes(firstWord)) score -= 20;

  if (score < 0) score = 0;
  if (score > 100) score = 100;

  return score;
}

async function callOpenAI(messages, temperature = 0.85) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages,
      temperature
    })
  });

  const data = await response.json();

  return { response, data };
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
    const mainSystemPrompt = `
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
- MUST sound natural in the target language
- avoid direct translation structures from English
- in Polish, prefer noun-based constructions like:
  "Magnes Zaufania"
  "Kod Konwersji"
  "Pętla Autorytetu"
- avoid unnatural Polish title forms like:
  "Zaufany Magnet"
  "Konwersyjny Klient"

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
"Zaufany Magnet"

GOOD POLISH:
"Silnik Zaufania"
"Pętla Autorytetu"
"Kod Konwersji"
"Magnes Zaufania"
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

HOOK (CRITICAL):
- MAX 6 words (hard limit)
- prefer 2-4 words
- must be extremely short
- keep it natural in the source language

FORMAT (VERY IMPORTANT):
- must feel like a PRODUCT TAGLINE or CATEGORY LABEL
- NOT a sentence
- NOT an instruction
- NOT "how to"

STRICT RULES:
- NO verbs at the beginning
- NO commas
- NO multiple ideas
- NO full sentences
- must express a DISTINCT ANGLE or viewpoint
- must NOT sound generic or like a common slogan
- prefer contrast, tension or unexpected phrasing

BAD:
"Uzyskaj stabilny dochód z wiedzy"
"Zbuduj trwałe relacje"
"Odkryj system sprzedaży"
"Build clients without chasing"
"How to build trust"
"Klient na wyciągnięcie ręki"

GOOD:
"Dochód z wiedzy"
"Klient bez pościgu"
"Zaufanie zamiast presji"
"Relacje, które sprzedają"
"Sprzedaż bez presji"
"Klient przychodzi sam"

STRUCTURE:
- 1 idea
- 1 angle
- high clarity

HOOK vs SUBTITLE:
- hook and subtitle must NOT repeat the same idea
- each line must introduce a different value layer
- hook should be a short sharp angle, claim or tagline
- subtitle should expand the offer with practical transformation and mechanism
- subtitle should explain HOW the promise becomes real
- if hook is about result, subtitle must focus on structure, system, process, path or implementation
- avoid repeating the same phrase, same framing or same benefit in both lines

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
`;

    const { response, data } = await callOpenAI(
      [
        {
          role: "system",
          content: mainSystemPrompt
        },
        {
          role: "user",
          content: combinedInput
        }
      ],
      0.85
    );

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

    const cleaned = cleanModelText(text);
    const parsed = safeParseJSON(cleaned);

    if (!parsed) {
      return res.status(500).json({
        ok: false,
        error: "Invalid JSON from AI",
        raw: text,
        cleaned
      });
    }

    trimResultFields(parsed);

    let hookScore = scoreHookQuality(parsed.hook, detectedLanguage);

    const needsHookRepair =
      parsed.hook &&
      (
        hasWeakHookStyle(parsed.hook, detectedLanguage) ||
        hasTooMuchOverlap(parsed.hook, parsed.subtitle) ||
        hasSemanticClash(parsed.hook, parsed.subtitle) ||
        hookScore < 70
      );

    if (needsHookRepair) {
      const hookRepairSystemPrompt = `
You are improving only the hook for a premium workbook product concept.

IMPORTANT:
- respond in ${detectedLanguage}
- return ONLY valid JSON
- no markdown
- no explanation

Return ONLY this format:
{
  "hook": ""
}

TASK:
Rewrite ONLY the hook.

GOAL:
- hook must be very short
- hook must feel like a product tagline or category label
- hook must NOT be a sentence
- hook must NOT start with a verb
- hook must NOT repeat subtitle meaning
- hook must add a new angle
- hook must express a DISTINCT ANGLE or viewpoint
- hook must NOT sound generic or like a common slogan
- prefer contrast, tension or unexpected phrasing

STRICT RULES:
- max 6 words
- prefer 2-4 words
- no comma
- no multiple ideas
- no instruction style
- no "how to" style

BAD:
"Uzyskaj stabilny dochód z wiedzy"
"Zbuduj trwałe relacje"
"Odkryj system sprzedaży"
"Klient na wyciągnięcie ręki"

GOOD:
"Dochód z wiedzy"
"Sprzedaż bez presji"
"Klient bez pościgu"
"Zaufanie zamiast presji"
"Relacje, które sprzedają"
`;

      const hookRepairUserPrompt = `
AUTHOR: ${parsed.author || ""}
TITLE: ${parsed.title || ""}
CURRENT HOOK: ${parsed.hook || ""}
SUBTITLE: ${parsed.subtitle || ""}
CATEGORY: ${parsed.category || ""}
TONE: ${parsed.tone || "premium"}

Rewrite the hook now.
`;

      const { response: hookRepairResponse, data: hookRepairData } = await callOpenAI(
        [
          {
            role: "system",
            content: hookRepairSystemPrompt
          },
          {
            role: "user",
            content: hookRepairUserPrompt
          }
        ],
        0.65
      );

      const hookRepairText = hookRepairData.choices?.[0]?.message?.content;

      if (hookRepairResponse.ok && hookRepairText) {
        const hookRepairCleaned = cleanModelText(hookRepairText);
        const repairedHook = safeParseJSON(hookRepairCleaned);

        if (repairedHook?.hook) {
          parsed.hook = String(repairedHook.hook).trim().slice(0, 80);
        }
      }

      hookScore = scoreHookQuality(parsed.hook, detectedLanguage);
    }

    const needsSubtitleRepair =
      parsed.hook &&
      parsed.subtitle &&
      (hasTooMuchOverlap(parsed.hook, parsed.subtitle) ||
        hasSemanticClash(parsed.hook, parsed.subtitle));

    if (needsSubtitleRepair) {
      const repairSystemPrompt = `
You are improving a premium workbook product concept.

IMPORTANT:
- respond in ${detectedLanguage}
- return ONLY valid JSON
- no markdown
- no explanation

Return ONLY this format:
{
  "subtitle": ""
}

TASK:
Rewrite ONLY the subtitle.

GOAL:
- the hook is the promise / result / headline
- the subtitle must explain the mechanism, structure, path, implementation or operating logic
- the subtitle must NOT repeat the same outcome framing as the hook
- the subtitle must feel like: how this actually works

RULES:
- keep the same overall product direction
- keep the same language
- do NOT repeat the same idea as the hook
- do NOT reuse the same key words from the hook unless absolutely necessary
- subtitle must add a different value layer: mechanism, structure, transformation, implementation
- make it practical, clear and premium
- good subtitle = workbook promise + method
- avoid making subtitle a second hook
`;

      const repairUserPrompt = `
AUTHOR: ${parsed.author || ""}
TITLE: ${parsed.title || ""}
HOOK: ${parsed.hook || ""}
CURRENT SUBTITLE: ${parsed.subtitle || ""}
CATEGORY: ${parsed.category || ""}
TONE: ${parsed.tone || "premium"}

Rewrite the subtitle so it does not repeat the hook.
Make the subtitle more about mechanism, structure, implementation or process.
`;

      const { response: repairResponse, data: repairData } = await callOpenAI(
        [
          {
            role: "system",
            content: repairSystemPrompt
          },
          {
            role: "user",
            content: repairUserPrompt
          }
        ],
        0.7
      );

      const repairText = repairData.choices?.[0]?.message?.content;

      if (repairResponse.ok && repairText) {
        const repairCleaned = cleanModelText(repairText);
        const repaired = safeParseJSON(repairCleaned);

        if (repaired?.subtitle) {
          parsed.subtitle = String(repaired.subtitle).trim();
        }
      }
    }

    trimResultFields(parsed);

    return res.status(200).json({
      ok: true,
      language: detectedLanguage,
      hookScore,
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
