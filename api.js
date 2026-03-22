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
    "bardzo", "more", "most", "less", "oraz", "których", "które", "umożliwia",
    "pozwala", "pozwolą", "dzieki", "dzięki", "przez", "wobec", "oriented"
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

  if (
    subtitleNormalized.includes(hookNormalized) ||
    hookNormalized.includes(subtitleNormalized)
  ) {
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
    ["doch", "doch"],
    ["przych", "przych"],
    ["zaufan", "zaufan"],
    ["autorytet", "autorytet"],
    ["pozyc", "pozyc"],
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
    ["authority", "authority"],
    ["position", "position"]
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
  if (!parsed || typeof parsed !== "object") {
    return parsed;
  }

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

function startsWithVerb(text, language) {
  const normalized = normalizeTextForCompare(text);
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
    "przekształć",
    "zastosuj",
    "stworz",
    "tworz",
    "twórz"
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
    "change",
    "apply"
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
    "zmień ",
    "zastosuj "
  ];

  const badPhrasesEn = [
    "how ",
    "system ",
    "method ",
    "discover ",
    "build ",
    "gain ",
    "create ",
    "change ",
    "apply "
  ];

  const patterns = language === "polish" ? badPhrasesPl : badPhrasesEn;

  for (const pattern of patterns) {
    if (normalized.startsWith(pattern)) {
      return true;
    }
  }

  return false;
}

function isGenericHook(hook, language) {
  const normalized = normalizeTextForCompare(hook);

  if (!normalized) return true;

  const genericPatternsPl = [
    "bez wysilku",
    "bez wysiłku",
    "latwo",
    "łatwo",
    "prosto",
    "szybko",
    "wiecej klientow",
    "więcej klientów",
    "lepsza sprzedaz",
    "lepsza sprzedaż",
    "wiekszy dochod",
    "większy dochód",
    "staly dochod",
    "stały dochód",
    "na wyciagniecie reki",
    "na wyciągnięcie ręki",
    "klient bez wysilku",
    "klient bez wysiłku",
    "rozwoj biznesu",
    "rozwój biznesu",
    "klient ktory wybiera",
    "klient który wybiera",
    "magnetyzm w sprzedazy",
    "magnetyzm w sprzedaży",
    "sprzedaz bez stresu",
    "sprzedaż bez stresu"
  ];

  const genericPatternsEn = [
    "easily",
    "fast",
    "simple",
    "more clients",
    "more sales",
    "more income",
    "client with ease",
    "growth made easy",
    "business growth"
  ];

  const patterns = language === "polish" ? genericPatternsPl : genericPatternsEn;

  for (const pattern of patterns) {
    if (normalized.includes(pattern)) return true;
  }

  return false;
}

function isInstructionalSubtitle(subtitle, language) {
  const normalized = normalizeTextForCompare(subtitle);
  const firstWord = normalized.split(" ")[0] || "";

  if (!firstWord) return true;

  const badStartsPl = [
    "zastosuj",
    "odkryj",
    "uzyskaj",
    "zbuduj",
    "stworz",
    "stwórz",
    "poznaj",
    "naucz",
    "dowiedz"
  ];

  const badStartsEn = [
    "apply",
    "discover",
    "gain",
    "build",
    "create",
    "learn",
    "understand"
  ];

  return language === "polish"
    ? badStartsPl.includes(firstWord)
    : badStartsEn.includes(firstWord);
}

function isGenericSubtitle(subtitle, language) {
  const normalized = normalizeTextForCompare(subtitle);

  if (!normalized) return true;

  const patternsPl = [
    "sprawdzone strategie i narzedzia",
    "sprawdzone strategie i narzędzia",
    "pozwola ci",
    "pozwolą ci",
    "umozliwia ci",
    "umożliwia ci",
    "zwiekszyc lojalnosc",
    "zwiększyć lojalność",
    "naturalny i efektywny",
    "skutecznie przyciagac klientow",
    "skutecznie przyciągać klientów",
    "dlugotrwala wspolpraca",
    "długotrwała współpraca"
  ];

  const patternsEn = [
    "proven strategies and tools",
    "will help you",
    "natural and effective",
    "high value clients",
    "sustainable growth"
  ];

  const patterns = language === "polish" ? patternsPl : patternsEn;

  for (const pattern of patterns) {
    if (normalized.includes(pattern)) return true;
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
  if (isGenericHook(value, language)) score -= 35;

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
    "konwersji",
    "pozycje",
    "pozycję"
  ];

  const contrastWordsEn = [
    "without",
    "instead",
    "trust",
    "authority",
    "conversion",
    "pressure",
    "position"
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
  if (words >= 2 && words <= 4) score += 5;

  const bannedStartsPl = ["uzyskaj", "zbuduj", "odkryj", "stwórz", "stworz", "zmień", "zmien"];
  const bannedStartsEn = ["build", "discover", "gain", "create", "change"];
  const firstWord = normalized.split(" ")[0] || "";
  const bannedStarts = language === "polish" ? bannedStartsPl : bannedStartsEn;

  if (bannedStarts.includes(firstWord)) score -= 20;

  if (score < 0) score = 0;
  if (score > 100) score = 100;

  return score;
}

function scoreSubtitleQuality(subtitle, hook, language) {
  const value = String(subtitle || "").trim();
  const normalized = normalizeTextForCompare(value);

  if (!normalized) return 0;

  let score = 100;
  const words = countWords(value);

  if (isInstructionalSubtitle(value, language)) score -= 25;
  if (isGenericSubtitle(value, language)) score -= 25;
  if (hasTooMuchOverlap(hook, value)) score -= 30;
  if (hasSemanticClash(hook, value)) score -= 30;
  if (words > 28) score -= 15;
  if (words < 8) score -= 10;

  const mechanismWordsPl = [
    "system",
    "struktura",
    "proces",
    "wdroż",
    "wdrozen",
    "ścież",
    "sciez",
    "pozycjon",
    "komunikac",
    "metod",
    "ram"
  ];

  const mechanismWordsEn = [
    "system",
    "structure",
    "process",
    "implementation",
    "framework",
    "positioning",
    "communication",
    "path",
    "method"
  ];

  const mechanismWords = language === "polish" ? mechanismWordsPl : mechanismWordsEn;

  let mechanismHits = 0;
  for (const word of mechanismWords) {
    if (normalized.includes(word)) mechanismHits++;
  }

  if (mechanismHits >= 1) score += 10;
  if (mechanismHits >= 2) score += 10;

  if (score < 0) score = 0;
  if (score > 100) score = 100;

  return score;
}

function scoreHookSubtitleConsistency(hook, subtitle) {
  const hookValue = String(hook || "").trim();
  const subtitleValue = String(subtitle || "").trim();

  if (!hookValue || !subtitleValue) return 0;

  let score = 100;

  if (hasTooMuchOverlap(hookValue, subtitleValue)) score -= 45;
  if (hasSemanticClash(hookValue, subtitleValue)) score -= 35;

  const hookWords = getMeaningfulWords(hookValue);
  const subtitleWords = getMeaningfulWords(subtitleValue);

  if (hookWords.length && subtitleWords.length) {
    const subtitleSet = new Set(subtitleWords);
    const commonWords = hookWords.filter((word) => subtitleSet.has(word));
    const overlapRatio = commonWords.length / hookWords.length;

    if (overlapRatio >= 0.5) score -= 20;
    else if (overlapRatio >= 0.3) score -= 10;
  }

  if (score < 0) score = 0;
  if (score > 100) score = 100;

  return score;
}

function qualityGate({ positioning, language }) {
  const hook = positioning?.hook || "";
  const subtitle = positioning?.subtitle || "";
  const title = positioning?.title || "";

  const hookScore = scoreHookQuality(hook, language);
  const subtitleScore = scoreSubtitleQuality(subtitle, hook, language);
  const consistencyScore = scoreHookSubtitleConsistency(hook, subtitle);

  const overall = Math.round(
    (hookScore * 0.35) +
    (subtitleScore * 0.35) +
    (consistencyScore * 0.30)
  );

  const notes = [];
  const flags = {
    needsHookRepair: hookScore < 70,
    needsSubtitleRepair: subtitleScore < 70,
    needsConsistencyRepair: consistencyScore < 60,
    needsTitleReview: false
  };

  if (!title || countWords(title) < 1) {
    flags.needsTitleReview = true;
    notes.push("missing or weak title");
  }

  if (hasWeakHookStyle(hook, language)) {
    notes.push("hook has weak structural style");
  }

  if (isGenericHook(hook, language)) {
    notes.push("hook sounds generic");
  }

  if (isInstructionalSubtitle(subtitle, language)) {
    notes.push("subtitle sounds instructional");
  }

  if (isGenericSubtitle(subtitle, language)) {
    notes.push("subtitle sounds generic");
  }

  if (hasTooMuchOverlap(hook, subtitle)) {
    notes.push("hook and subtitle overlap too much");
  }

  if (hasSemanticClash(hook, subtitle)) {
    notes.push("hook and subtitle repeat the same promise");
  }

  const passed =
    hookScore >= 70 &&
    subtitleScore >= 70 &&
    consistencyScore >= 60 &&
    !flags.needsTitleReview;

  return {
    passed,
    scores: {
      hook: hookScore,
      subtitle: subtitleScore,
      consistency: consistencyScore,
      overall
    },
    flags,
    notes
  };
}

function mergeInputs({ linkedinInput = "", authorContext = "", sourceText = "" }) {
  return `
LINKEDIN / BIO:
${linkedinInput || ""}

BOOK DESCRIPTIONS / EXTRA CONTEXT:
${authorContext || ""}

SOURCE TEXT / LONGER MATERIAL:
${sourceText || ""}
`.trim();
}

function buildCoverPayload(positioning) {
  return {
    eyebrow: "WORKBOOK SYSTEM",
    seriesLabel: "AIBOOK WORKBOOK",
    hook: positioning.hook || "",
    title: positioning.title || "",
    subtitle: positioning.subtitle || "",
    author: positioning.author || "",
    meta: `${positioning.category || ""} • ${positioning.tone || "premium"}`
  };
}

function buildDecisionPaths(language) {
  if (language === "polish") {
    return [
      {
        id: "preview",
        label: "Zobacz fragment",
        description: "Sprawdź przykładowy fragment workbooka i oceń kierunek."
      },
      {
        id: "expand",
        label: "Chcę rozwinąć tę książkę",
        description: "Przejdź do pełniejszego rozwinięcia outline’u, rozdziałów i ćwiczeń."
      },
      {
        id: "done_with_you",
        label: "Chcę rozwinąć tę książkę z Wami",
        description: "Przejdź do wariantu premium i rozwijaj książkę razem z zespołem."
      },
      {
        id: "diy_direction",
        label: "Chcę samodzielnie dostać kierunek",
        description: "Otrzymaj kierunek dalszej pracy i rozwijaj projekt samodzielnie."
      }
    ];
  }

  return [
    {
      id: "preview",
      label: "See a sample",
      description: "Review a sample workbook fragment and assess the direction."
    },
    {
      id: "expand",
      label: "I want to develop this book",
      description: "Move to a fuller outline, chapters and exercises."
    },
    {
      id: "done_with_you",
      label: "I want to develop this book with you",
      description: "Choose the premium path and build the book together with the team."
    },
    {
      id: "diy_direction",
      label: "I want a DIY direction",
      description: "Get a recommended direction and continue independently."
    }
  ];
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

async function repairHookIfNeeded(parsed, detectedLanguage) {
  let hookScore = scoreHookQuality(parsed.hook, detectedLanguage);

  const needsHookRepair =
    parsed.hook &&
    (
      hasWeakHookStyle(parsed.hook, detectedLanguage) ||
      isGenericHook(parsed.hook, detectedLanguage) ||
      hasTooMuchOverlap(parsed.hook, parsed.subtitle) ||
      hasSemanticClash(parsed.hook, parsed.subtitle) ||
      hookScore < 75
    );

  if (!needsHookRepair) {
    return { parsed, hookScore };
  }

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
"Klient bez wysiłku"
"Więcej klientów"
"Lepsza sprzedaż"

GOOD:
"Dochód z wiedzy"
"Sprzedaż bez presji"
"Klient bez pościgu"
"Zaufanie zamiast presji"
"Relacje, które sprzedają"
"Autorytet zamiast pogoni"
"Sprzedaż przez pozycję"
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

  return { parsed, hookScore };
}

async function repairSubtitleIfNeeded(parsed, detectedLanguage) {
  const subtitleScore = scoreSubtitleQuality(parsed.subtitle, parsed.hook, detectedLanguage);
  const consistencyScore = scoreHookSubtitleConsistency(parsed.hook, parsed.subtitle);

  const needsSubtitleRepair =
    parsed.hook &&
    parsed.subtitle &&
    (
      subtitleScore < 70 ||
      consistencyScore < 60 ||
      hasTooMuchOverlap(parsed.hook, parsed.subtitle) ||
      hasSemanticClash(parsed.hook, parsed.subtitle)
    );

  if (!needsSubtitleRepair) {
    return parsed;
  }

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
- the subtitle must feel like how this actually works
- the subtitle must sound like a premium workbook promise, not a blog sentence
- avoid generic phrases like "sprawdzone strategie i narzędzia" unless truly necessary

RULES:
- keep the same overall product direction
- keep the same language
- do NOT repeat the same idea as the hook
- do NOT reuse the same key words from the hook unless absolutely necessary
- subtitle must add a different value layer: mechanism, structure, transformation, implementation
- make it practical, clear and premium
- good subtitle = workbook promise + method
- avoid making subtitle a second hook
- avoid starting with an instruction verb if possible
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

  return parsed;
}

async function generatePositioning({ combinedInput, detectedLanguage }) {
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
"Klient bez wysiłku"

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

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: "OpenAI API error",
      openai: data
    };
  }

  const text = data.choices?.[0]?.message?.content;

  if (!text) {
    return {
      ok: false,
      status: 500,
      error: "Empty response from AI",
      openai: data
    };
  }

  const cleaned = cleanModelText(text);
  const parsed = safeParseJSON(cleaned);

  if (!parsed) {
    return {
      ok: false,
      status: 500,
      error: "Invalid JSON from AI",
      raw: text,
      cleaned
    };
  }

  trimResultFields(parsed);

  const hookRepaired = await repairHookIfNeeded(parsed, detectedLanguage);
  trimResultFields(hookRepaired.parsed);

  const subtitleRepaired = await repairSubtitleIfNeeded(
    hookRepaired.parsed,
    detectedLanguage
  );
  trimResultFields(subtitleRepaired);

  const quality = qualityGate({
    positioning: subtitleRepaired,
    language: detectedLanguage
  });

  return {
    ok: true,
    language: detectedLanguage,
    hookScore: quality.scores.hook,
    quality,
    result: subtitleRepaired
  };
}

async function generateOutline({
  positioning,
  combinedInput,
  detectedLanguage,
  chapterCount = 7
}) {
  const systemPrompt =
    detectedLanguage === "polish"
      ? `
Jesteś strategiem produktu edukacyjnego premium.

Na podstawie pozycjonowania książki/workbooka stwórz outline.

Zwróć WYŁĄCZNIE poprawny JSON w tym formacie:
{
  "promise": "",
  "reader": "",
  "transformation": "",
  "chapters": [
    {
      "number": 1,
      "title": "",
      "goal": "",
      "exercise": ""
    }
  ]
}

ZASADY:
- odpowiadaj po polsku
- ma to być workbook, nie książka akademicka
- rozdziały mają prowadzić czytelnika krok po kroku
- chapter count: ${chapterCount}
- chapter titles mają brzmieć praktycznie i produktowo
- goal ma opisywać cel rozdziału
- exercise ma być krótkim, konkretnym ćwiczeniem workbookowym
- promise = główna obietnica workbooka
- reader = dla kogo dokładnie jest ten workbook
- transformation = od czego do czego prowadzi
- bez markdown
- bez komentarzy
`
      : `
You are a premium educational product strategist.

Based on the book/workbook positioning, create an outline.

Return ONLY valid JSON in this format:
{
  "promise": "",
  "reader": "",
  "transformation": "",
  "chapters": [
    {
      "number": 1,
      "title": "",
      "goal": "",
      "exercise": ""
    }
  ]
}

RULES:
- respond in English
- this should be a workbook, not an academic book
- chapters should lead the reader step by step
- chapter count: ${chapterCount}
- chapter titles should sound practical and product-like
- goal should describe the chapter objective
- exercise should be a short concrete workbook exercise
- promise = main workbook promise
- reader = who this workbook is for
- transformation = what change it creates
- no markdown
- no comments
`;

  const userPrompt = `
POSITIONING:
${JSON.stringify(positioning, null, 2)}

SOURCE CONTEXT:
${combinedInput}
`;

  const { response, data } = await callOpenAI(
    [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: userPrompt
      }
    ],
    0.75
  );

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: "OpenAI API error",
      openai: data
    };
  }

  const text = data.choices?.[0]?.message?.content;

  if (!text) {
    return {
      ok: false,
      status: 500,
      error: "Empty response from AI",
      openai: data
    };
  }

  const cleaned = cleanModelText(text);
  const parsed = safeParseJSON(cleaned);

  if (!parsed) {
    return {
      ok: false,
      status: 500,
      error: "Invalid JSON from AI",
      raw: text,
      cleaned
    };
  }

  return {
    ok: true,
    result: parsed
  };
}

async function generateSample({
  positioning,
  outline,
  combinedInput,
  detectedLanguage
}) {
  const firstChapter = outline?.chapters?.[0] || null;

  const systemPrompt =
    detectedLanguage === "polish"
      ? `
Jesteś strategiem workbooków premium.

Na podstawie pozycjonowania i outline'u stwórz krótki fragment próbny workbooka.

Zwróć WYŁĄCZNIE poprawny JSON w tym formacie:
{
  "chapterTitle": "",
  "intro": "",
  "exerciseTitle": "",
  "exerciseText": "",
  "reflectionPrompt": ""
}

ZASADY:
- odpowiadaj po polsku
- intro ma być krótkim, mocnym początkiem rozdziału
- styl ma być praktyczny, konkretny, wdrożeniowy
- exerciseTitle ma być krótkim tytułem ćwiczenia
- exerciseText ma zawierać konkretne polecenie
- reflectionPrompt ma być jednym pytaniem refleksyjnym
- nie pisz eseju
- nie używaj markdown
`
      : `
You are a premium workbook strategist.

Based on the positioning and outline, create a short sample workbook fragment.

Return ONLY valid JSON in this format:
{
  "chapterTitle": "",
  "intro": "",
  "exerciseTitle": "",
  "exerciseText": "",
  "reflectionPrompt": ""
}

RULES:
- respond in English
- intro should be a short strong chapter opening
- style should be practical, concrete and implementation-focused
- exerciseTitle should be short
- exerciseText should contain a concrete instruction
- reflectionPrompt should be a single reflection question
- do not write an essay
- no markdown
`;

  const userPrompt = `
POSITIONING:
${JSON.stringify(positioning, null, 2)}

OUTLINE:
${JSON.stringify(outline, null, 2)}

PRIORITY CHAPTER:
${JSON.stringify(firstChapter, null, 2)}

SOURCE CONTEXT:
${combinedInput}
`;

  const { response, data } = await callOpenAI(
    [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: userPrompt
      }
    ],
    0.75
  );

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: "OpenAI API error",
      openai: data
    };
  }

  const text = data.choices?.[0]?.message?.content;

  if (!text) {
    return {
      ok: false,
      status: 500,
      error: "Empty response from AI",
      openai: data
    };
  }

  const cleaned = cleanModelText(text);
  const parsed = safeParseJSON(cleaned);

  if (!parsed) {
    return {
      ok: false,
      status: 500,
      error: "Invalid JSON from AI",
      raw: text,
      cleaned
    };
  }

  return {
    ok: true,
    result: parsed
  };
}

function clampChapterCount(value) {
  const n = Number(value || 7);

  if (!Number.isFinite(n)) return 7;
  if (n < 5) return 5;
  if (n > 12) return 12;

  return Math.round(n);
}

router.get("/author/analyze", (_req, res) => {
  return res.status(200).json({
    ok: true,
    message: "GET test działa"
  });
});

router.post("/author/analyze", async (req, res) => {
  const { linkedinInput, authorContext, sourceText } = req.body || {};

  if (!linkedinInput && !authorContext && !sourceText) {
    return res.status(400).json({
      ok: false,
      error: "No input"
    });
  }

  const combinedInput = mergeInputs({
    linkedinInput,
    authorContext,
    sourceText
  });

  const detectedLanguage = detectLanguage(combinedInput);

  try {
    const result = await generatePositioning({
      combinedInput,
      detectedLanguage
    });

    if (!result.ok) {
      return res.status(result.status || 500).json(result);
    }

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

router.post("/generate-preview", async (req, res) => {
  const {
    linkedinInput,
    authorContext,
    sourceText,
    positioning,
    options = {}
  } = req.body || {};

  if (!linkedinInput && !authorContext && !sourceText && !positioning) {
    return res.status(400).json({
      ok: false,
      error: "No input"
    });
  }

  const combinedInput = mergeInputs({
    linkedinInput,
    authorContext,
    sourceText
  });

  const detectedLanguage = options.language && options.language !== "auto"
    ? options.language === "pl"
      ? "polish"
      : "english"
    : detectLanguage(
        combinedInput ||
        JSON.stringify(positioning || {})
      );

  const includeOutline = options.includeOutline !== false;
  const includeSample = options.includeSample !== false;
  const includeDecisionPaths = options.includeDecisionPaths !== false;
  const chapterCount = clampChapterCount(options.chapterCount || 7);

  try {
    let finalPositioning = positioning || null;
    let hookScore = null;
    let quality = null;

    if (!finalPositioning) {
      const positioningResult = await generatePositioning({
        combinedInput,
        detectedLanguage
      });

      if (!positioningResult.ok) {
        return res.status(positioningResult.status || 500).json(positioningResult);
      }

      finalPositioning = positioningResult.result;
      hookScore = positioningResult.hookScore;
      quality = positioningResult.quality;
    } else {
      trimResultFields(finalPositioning);

      const repairedHook = await repairHookIfNeeded(finalPositioning, detectedLanguage);
      finalPositioning = repairedHook.parsed;
      hookScore = repairedHook.hookScore;

      finalPositioning = await repairSubtitleIfNeeded(finalPositioning, detectedLanguage);
      trimResultFields(finalPositioning);

      quality = qualityGate({
        positioning: finalPositioning,
        language: detectedLanguage
      });
    }

    if (!quality) {
      quality = qualityGate({
        positioning: finalPositioning,
        language: detectedLanguage
      });
    }

    const cover = buildCoverPayload(finalPositioning);

    let outline = null;
    if (includeOutline) {
      const outlineResult = await generateOutline({
        positioning: finalPositioning,
        combinedInput,
        detectedLanguage,
        chapterCount
      });

      if (!outlineResult.ok) {
        return res.status(outlineResult.status || 500).json(outlineResult);
      }

      outline = outlineResult.result;
    }

    let sample = null;
    if (includeSample && outline) {
      const sampleResult = await generateSample({
        positioning: finalPositioning,
        outline,
        combinedInput,
        detectedLanguage
      });

      if (!sampleResult.ok) {
        return res.status(sampleResult.status || 500).json(sampleResult);
      }

      sample = sampleResult.result;
    }

    const decisionPaths = includeDecisionPaths
      ? buildDecisionPaths(detectedLanguage)
      : [];

    return res.status(200).json({
      ok: true,
      language: detectedLanguage,
      hookScore,
      quality,
      preview: {
        positioning: finalPositioning,
        cover,
        outline,
        sample,
        decisionPaths
      }
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

export default router;
