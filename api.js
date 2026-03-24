import express from "express";
import crypto from "crypto";

const router = express.Router();

const selectedVariantsStore = new Map();
const variantSessionsStore = new Map();

function safeParseJSON(text) {
try {
return JSON.parse(text);
} catch {
const match = String(text || "").match(/{[\s\S]*}/);
if (!match) return null;

try {  
  return JSON.parse(match[0]);  
} catch {  
  return null;  
}

}
}

function cleanModelText(text) {
return String(text || "")
.replace(/json/gi, "")   .replace(//g, "")
.trim();
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
.replace(/[.,/#!$%^&*;:{}=-_`~()"’?<>[]\|]/g, " ")
.replace(/\s+/g, " ")
.trim();
}

function countWords(text) {
return normalizeTextForCompare(text)
.split(" ")
.filter(Boolean).length;
}

function getMeaningfulWords(text) {
const stopwords = new Set([
"i", "oraz", "a", "to", "w", "we", "z", "ze", "na", "do", "od", "po", "bez",
"dla", "jest", "się", "który", "która", "które",
"that", "into", "from", "with", "without", "the", "and", "for", "your",
"this", "these", "those", "practical", "praktyczny", "workbook", "guide",
"system", "framework", "mechanizm", "metoda", "przez", "helps", "help",
"using", "oparty", "oparta", "oparte", "bardzo", "more", "most", "less",
"których", "umożliwia", "pozwala", "pozwolą", "dzieki", "dzięki", "wobec",
"oriented", "jak", "how", "który", "która", "które"
]);

return normalizeTextForCompare(text)
.split(" ")
.filter((word) => word.length > 3 && !stopwords.has(word));
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

function startsWithVerb(text, language) {
const normalized = normalizeTextForCompare(text);
const firstWord = normalized.split(" ")[0] || "";

if (!firstWord) return false;

const polishVerbStarts = [
"zbuduj", "odkryj", "uzyskaj", "stworz", "stwórz", "buduj", "zacznij",
"przyciagnij", "przyciągnij", "zamien", "zamień", "zwieksz", "zwiększ",
"osiagnij", "osiągnij", "zdobadz", "zdobądź", "pokonaj", "wykorzystaj",
"zmien", "zmień", "przeksztalc", "przekształć", "zastosuj", "tworz", "twórz",
"naucz", "poznaj", "dowiedz"
];

const englishVerbStarts = [
"build", "discover", "gain", "create", "start", "attract", "turn",
"increase", "achieve", "win", "use", "master", "transform", "change",
"apply", "learn", "understand"
];

if (language === "polish") {
return polishVerbStarts.includes(firstWord);
}

return englishVerbStarts.includes(firstWord);
}

function startsWithHowStyle(text, language) {
const normalized = normalizeTextForCompare(text);

if (language === "polish") {
return normalized.startsWith("jak ");
}

return normalized.startsWith("how ");
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

function hasWeakHookStyle(hook, language) {
const value = String(hook || "").trim();
const normalized = normalizeTextForCompare(value);

if (!normalized) return true;
if (countWords(value) > 6) return true;
if (value.includes(",")) return true;
if (startsWithVerb(value, language)) return true;
if (startsWithHowStyle(value, language)) return true;

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
"sprzedaż bez stresu",
"zaufanie w sprzedazy",
"zaufanie w sprzedaży",
"lojalnosc bez wysilku",
"lojalność bez wysiłku",
"zaufanie przyciaga klientow",
"zaufanie przyciąga klientów",
"przewaga konkurencyjna"
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
"business growth",
"trust in sales",
"competitive advantage"
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
if (startsWithHowStyle(subtitle, language)) return true;

const badStartsPl = [
"zastosuj", "odkryj", "uzyskaj", "zbuduj", "stworz", "stwórz", "poznaj", "naucz", "dowiedz", "jak"
];

const badStartsEn = [
"apply", "discover", "gain", "build", "create", "learn", "understand", "how"
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

function isGenericTitle(title, language) {
const normalized = normalizeTextForCompare(title);

if (!normalized) return true;

const badPl = [
"zaufanie w sprzedazy",
"zaufanie w sprzedaży",
"sprzedaz oparta na zaufaniu",
"sprzedaż oparta na zaufaniu",
"system sprzedazy",
"system sprzedaży",
"metoda sprzedazy",
"metoda sprzedaży",
"pozyskiwanie klientow",
"pozyskiwanie klientów",
"biznes i sprzedaz",
"biznes i sprzedaż"
];

const badEn = [
"trust in sales",
"sales system",
"sales method",
"client acquisition",
"business and sales"
];

const bad = language === "polish" ? badPl : badEn;

return bad.includes(normalized);
}

function scoreHookQuality(hook, language) {
const value = String(hook || "").trim();
const normalized = normalizeTextForCompare(value);

if (!normalized) return 0;

let score = 100;
const words = countWords(value);

if (words > 6) score -= 45;
if (words > 4) score -= 20;
if (words < 2) score -= 10;
if (value.includes(",")) score -= 25;
if (startsWithVerb(value, language)) score -= 35;
if (startsWithHowStyle(value, language)) score -= 35;
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
"pozycję",
"pozycje"
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

const bannedStartsPl = ["uzyskaj", "zbuduj", "odkryj", "stwórz", "stworz", "zmień", "zmien", "jak"];
const bannedStartsEn = ["build", "discover", "gain", "create", "change", "how"];
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

if (isInstructionalSubtitle(value, language)) score -= 30;
if (isGenericSubtitle(value, language)) score -= 25;
if (hasTooMuchOverlap(hook, value)) score -= 30;
if (hasSemanticClash(hook, value)) score -= 30;
if (words > 28) score -= 20;
if (words < 8) score -= 12;

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
"ram",
"model",
"architekt"
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
"method",
"model",
"architecture"
];

const mechanismWords = language === "polish" ? mechanismWordsPl : mechanismWordsEn;

let mechanismHits = 0;
for (const word of mechanismWords) {
if (normalized.includes(word)) mechanismHits++;
}

if (mechanismHits >= 1) score += 10;
if (mechanismHits >= 2) score += 10;

if (startsWithHowStyle(value, language)) {
score -= 20;
}

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

function scoreTitleQuality(title, language) {
const value = String(title || "").trim();
const normalized = normalizeTextForCompare(value);

if (!normalized) return 0;

let score = 100;
const words = countWords(value);

if (words > 4) score -= 30;
if (words === 1) score -= 12;
if (words > 5) score -= 20;
if (isGenericTitle(value, language)) score -= 40;

const genericWordsPl = [
"system",
"metoda",
"proces",
"framework",
"przewodnik",
"strategia",
"sprzedaz",
"sprzedaż",
"klient",
"klienci",
"biznes"
];

const genericWordsEn = [
"system",
"method",
"process",
"framework",
"guide",
"strategy",
"sales",
"client",
"clients",
"business"
];

const unnaturalPatternsPl = [
"zaufany",
"konwersyjny",
"sprzedazowy",
"sprzedażowy",
"klientowy"
];

const strongPatternsPl = [
"kod",
"mechanizm",
"petla",
"pętla",
"architektura",
"magnes",
"silnik",
"matryca",
"schemat"
];

const strongPatternsEn = [
"code",
"engine",
"loop",
"switch",
"magnet",
"architecture",
"mechanism",
"matrix"
];

const abstractPatternsPl = [
"sila",
"siła",
"moc",
"sukces",
"droga",
"rozwoj",
"rozwój"
];

const abstractPatternsEn = [
"power",
"success",
"growth",
"path"
];

const genericWords = language === "polish" ? genericWordsPl : genericWordsEn;
const strongPatterns = language === "polish" ? strongPatternsPl : strongPatternsEn;
const abstractPatterns = language === "polish" ? abstractPatternsPl : abstractPatternsEn;

let genericHits = 0;
for (const word of genericWords) {
if (normalized.includes(word)) genericHits++;
}

if (genericHits >= 2) score -= 30;
if (genericHits >= 3) score -= 20;

if (language === "polish") {
for (const pattern of unnaturalPatternsPl) {
if (normalized.includes(pattern)) score -= 40;
}
}

let strongHits = 0;
for (const pattern of strongPatterns) {
if (normalized.includes(pattern)) strongHits++;
}

if (strongHits >= 1) score += 12;

let abstractHits = 0;
for (const pattern of abstractPatterns) {
if (normalized.includes(pattern)) abstractHits++;
}

if (abstractHits >= 1) score -= 15;

if (score < 0) score = 0;
if (score > 100) score = 100;

return score;
}

function analyzeTitleQuality(title, language) {
const value = String(title || "").trim();
const normalized = normalizeTextForCompare(value);
const issues = [];

if (!value) {
issues.push("empty");
return issues;
}

if (countWords(value) > 4) {
issues.push("too_long");
}

if (isGenericTitle(value, language)) {
issues.push("too_generic");
}

if (language === "polish") {
if (
normalized.includes("zaufany") ||
normalized.includes("konwersyjny") ||
normalized.includes("sprzedazowy") ||
normalized.includes("sprzedażowy")
) {
issues.push("unnatural_polish");
}

if (  
  normalized.includes("sila") ||  
  normalized.includes("siła") ||  
  normalized.includes("moc") ||  
  normalized.includes("sukces")  
) {  
  issues.push("too_abstract");  
}

} else {
if (normalized.includes("power") || normalized.includes("success")) {
issues.push("too_abstract");
}
}

return issues;
}

function qualityGate({ positioning, language }) {
const hook = positioning?.hook || "";
const subtitle = positioning?.subtitle || "";
const title = positioning?.title || "";

const hookScore = scoreHookQuality(hook, language);
const subtitleScore = scoreSubtitleQuality(subtitle, hook, language);
const consistencyScore = scoreHookSubtitleConsistency(hook, subtitle);
const titleScore = scoreTitleQuality(title, language);
const titleIssues = analyzeTitleQuality(title, language);

const overall = Math.round(
(hookScore * 0.30) +
(subtitleScore * 0.27) +
(consistencyScore * 0.21) +
(titleScore * 0.22)
);

const notes = [];
const flags = {
needsHookRepair: hookScore < 78,
needsSubtitleRepair: subtitleScore < 76,
needsConsistencyRepair: consistencyScore < 70,
needsTitleRepair: titleScore < 78,
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

if (titleIssues.includes("too_generic")) {
notes.push("title sounds too generic");
}

if (titleIssues.includes("unnatural_polish")) {
notes.push("title sounds unnatural in Polish");
}

if (titleIssues.includes("too_abstract")) {
notes.push("title may be too abstract");
}

if (titleIssues.includes("too_long")) {
notes.push("title is too long");
}

const passed =
hookScore >= 78 &&
subtitleScore >= 76 &&
consistencyScore >= 70 &&
titleScore >= 78 &&
!flags.needsTitleReview &&
!notes.includes("hook sounds generic") &&
!notes.includes("title sounds too generic");

return {
passed,
scores: {
title: titleScore,
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
meta: ${positioning.category || ""} • ${positioning.tone || "premium"}
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

function clampChapterCount(value) {
const n = Number(value || 7);

if (!Number.isFinite(n)) return 7;
if (n < 5) return 5;
if (n > 12) return 12;

return Math.round(n);
}

function clampVariantCount(value) {
const n = Number(value || 3);

if (!Number.isFinite(n)) return 3;
if (n < 2) return 2;
if (n > 5) return 5;

return Math.round(n);
}

function createVariantId() {
return variant_${crypto.randomBytes(6).toString("hex")};
}

function createSessionId() {
return session_${crypto.randomBytes(8).toString("hex")};
}

function createInputHash({ linkedinInput = "", authorContext = "", sourceText = "" }) {
const raw = JSON.stringify({
linkedinInput: String(linkedinInput || ""),
authorContext: String(authorContext || ""),
sourceText: String(sourceText || "")
});

return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 24);
}

function getVariantStrategies(language) {
if (language === "polish") {
return [
{
key: "premium_authority",
label: "Premium Authority",
anglePrompt:   Twórz wersję bardziej premium i strategiczną.   Akcent: autorytet, pozycja, zaufanie, jakość relacji, przewaga ekspercka.   Tytuł ma brzmieć dojrzale, elegancko i silnie.   Hook ma sugerować pozycję, nie tanią obietnicę.  
},
{
key: "commercial_attraction",
label: "Commercial Attraction",
anglePrompt:   Twórz wersję bardziej komercyjną i rynkową.   Akcent: przyciąganie klientów, przewidywalny napływ leadów, konwersja bez presji.   Tytuł ma być bardziej sprzedażowy, ale nadal premium.   Hook ma być mocny, czytelny i atrakcyjny rynkowo.  
},
{
key: "structured_framework",
label: "Structured Framework",
anglePrompt:   Twórz wersję bardziej strukturalną i frameworkową.   Akcent: model, architektura, mechanizm, uporządkowany proces.   Tytuł ma sugerować konkretny mechanizm działania.   Hook ma podkreślać systemowość lub przewidywalność.  
},
{
key: "trust_relationship",
label: "Trust Relationship",
anglePrompt:   Twórz wersję bardziej opartą na relacjach i zaufaniu.   Akcent: komunikacja, relacje, autentyczność, długoterminowa współpraca.   Tytuł ma być miękko-premium, ale dalej produktowy.   Hook ma pokazywać wartość relacji bez banału.  
},
{
key: "positioning_conversion",
label: "Positioning Conversion",
anglePrompt:   Twórz wersję bardziej opartą na pozycjonowaniu i konwersji.   Akcent: pozycja eksperta, lepsze rozmowy, przewidywalna zamiana wiedzy na klientów.   Tytuł ma być bardziej biznesowy i konkretny.   Hook ma pokazywać przewagę rynkową.  
}
];
}

return [
{
key: "premium_authority",
label: "Premium Authority",
anglePrompt:   Create a more premium and strategic version.   Emphasis: authority, positioning, trust, quality of relationships, expert advantage.   The title should feel elegant, mature and strong.   The hook should signal position, not cheap promise.  
},
{
key: "commercial_attraction",
label: "Commercial Attraction",
anglePrompt:   Create a more commercial and market-oriented version.   Emphasis: attracting clients, predictable lead flow, conversion without pressure.   The title should be more sellable, but still premium.   The hook should be clear, strong and market-relevant.  
},
{
key: "structured_framework",
label: "Structured Framework",
anglePrompt:   Create a more structured and framework-oriented version.   Emphasis: model, architecture, mechanism, organized process.   The title should suggest a concrete operating logic.   The hook should emphasize systemization or predictability.  
},
{
key: "trust_relationship",
label: "Trust Relationship",
anglePrompt:   Create a more relationship- and trust-based version.   Emphasis: communication, relationships, authenticity, long-term collaboration.   The title should be softer-premium but still product-like.   The hook should express relational value without sounding generic.  
},
{
key: "positioning_conversion",
label: "Positioning Conversion",
anglePrompt:   Create a more positioning- and conversion-based version.   Emphasis: expert positioning, better conversations, predictable conversion of knowledge into clients.   The title should feel business-driven and concrete.   The hook should show strategic advantage.  
}
];
}

function getVariantByIdFromSession(sessionId, variantId) {
const session = variantSessionsStore.get(String(sessionId || "").trim());

if (!session || !Array.isArray(session.variants)) {
return null;
}

return session.variants.find((item) => item.id === String(variantId || "").trim()) || null;
}

function buildSelectedPayloadFromVariant(variant, sessionId = null) {
return {
id: variant.id || createVariantId(),
strategyKey: variant.strategyKey || "manual",
strategyLabel: variant.strategyLabel || "Selected",
createdAt: variant.createdAt || new Date().toISOString(),
hookScore: variant.hookScore ?? null,
quality: variant.quality || null,
positioning: trimResultFields({ ...(variant.positioning || {}) }),
cover: variant.cover || buildCoverPayload(variant.positioning || {}),
sessionId: sessionId || null
};
}

async function callOpenAI(messages, temperature = 0.85) {
const response = await fetch("https://api.openai.com/v1/chat/completions", {
method: "POST",
headers: {
"Content-Type": "application/json",
"Authorization": Bearer ${process.env.OPENAI_API_KEY}
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
hookScore < 82
);

if (!needsHookRepair) {
return { parsed, hookScore };
}

const hookRepairSystemPrompt = `
You are improving only the hook for a premium workbook product concept.

IMPORTANT:

respond in ${detectedLanguage}

return ONLY valid JSON

no markdown

no explanation


Return ONLY this format:
{
"hook": ""
}

TASK:
Rewrite ONLY the hook.

GOAL:

hook must be very short

hook must feel like a product tagline or category label

hook must NOT be a sentence

hook must NOT start with a verb

hook must NOT repeat subtitle meaning

hook must add a new angle

hook must express a DISTINCT ANGLE or viewpoint

hook must NOT sound generic or like a common slogan

prefer contrast, tension or unexpected phrasing


STRICT RULES:

max 6 words

prefer 2-4 words

no comma

no multiple ideas

no instruction style

no "how to" style

avoid generic phrases like:
"Zaufanie w sprzedaży"
"Przewaga konkurencyjna"
"Trust in sales"
"Competitive advantage"


BAD:
"Uzyskaj stabilny dochód z wiedzy"
"Zbuduj trwałe relacje"
"Odkryj system sprzedaży"
"Klient na wyciągnięcie ręki"
"Klient bez wysiłku"
"Więcej klientów"
"Lepsza sprzedaż"
"Zaufanie jako przewaga konkurencyjna"

GOOD:
"Dochód z wiedzy"
"Sprzedaż bez presji"
"Klient bez pościgu"
"Zaufanie zamiast presji"
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
{ role: "system", content: hookRepairSystemPrompt },
{ role: "user", content: hookRepairUserPrompt }
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
subtitleScore < 78 ||
consistencyScore < 70 ||
hasTooMuchOverlap(parsed.hook, parsed.subtitle) ||
hasSemanticClash(parsed.hook, parsed.subtitle) ||
startsWithHowStyle(parsed.subtitle, detectedLanguage)
);

if (!needsSubtitleRepair) {
return parsed;
}

const repairSystemPrompt = `
You are improving a premium workbook product concept.

IMPORTANT:

respond in ${detectedLanguage}

return ONLY valid JSON

no markdown

no explanation


Return ONLY this format:
{
"subtitle": ""
}

TASK:
Rewrite ONLY the subtitle.

GOAL:

the hook is the promise / result / headline

the subtitle must explain the mechanism, structure, path, implementation or operating logic

the subtitle must NOT repeat the same outcome framing as the hook

the subtitle must feel like how this actually works

the subtitle must sound like a premium workbook promise, not a blog sentence

avoid generic phrases like "sprawdzone strategie i narzędzia" unless truly necessary


RULES:

keep the same overall product direction

keep the same language

do NOT repeat the same idea as the hook

do NOT reuse the same key words from the hook unless absolutely necessary

subtitle must add a different value layer: mechanism, structure, transformation, implementation

make it practical, clear and premium

good subtitle = workbook promise + method

avoid making subtitle a second hook

avoid starting with "Jak" / "How"
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
{ role: "system", content: repairSystemPrompt },
{ role: "user", content: repairUserPrompt }
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

async function repairTitleIfNeeded(parsed, detectedLanguage) {
let titleScore = scoreTitleQuality(parsed.title, detectedLanguage);
const titleIssues = analyzeTitleQuality(parsed.title, detectedLanguage);

const needsTitleRepair =
parsed.title &&
(
titleScore < 82 ||
titleIssues.includes("too_generic") ||
titleIssues.includes("unnatural_polish")
);

if (!needsTitleRepair) {
return { parsed, titleScore, titleIssues };
}

const titleRepairSystemPrompt = `
You are fixing a BOOK TITLE for a premium workbook product.

IMPORTANT:

respond in ${detectedLanguage}

return ONLY valid JSON

no markdown

no explanation


Return ONLY this format:
{
"title": ""
}

TASK:
Rewrite ONLY the title.

GOAL:

title must feel like a premium product name

title must be natural in the target language

title must NOT sound translated from English

title must be 2-4 words

title must feel branded, memorable and commercially strong

avoid generic structures

avoid overusing words like system, method, process

avoid generic thematic titles like:
"Zaufanie w Sprzedaży"
"Trust in Sales"


FOR POLISH:

prefer noun-based constructions like:
"Kod Zaufania"
"Mechanizm Zaufania"
"Pętla Autorytetu"
"Magnes Klienta"
"Silnik Zaufania"

avoid unnatural constructions like:
"Zaufany Magnet"
"Konwersyjny Klient"


STRICT:

JSON only

no extra keys
`;

const titleRepairUserPrompt = `
CURRENT TITLE: ${parsed.title || ""}
HOOK: ${parsed.hook || ""}
SUBTITLE: ${parsed.subtitle || ""}
CATEGORY: ${parsed.category || ""}
TONE: ${parsed.tone || "premium"}


Rewrite the title now.
`;

const { response: titleRepairResponse, data: titleRepairData } = await callOpenAI(
[
{ role: "system", content: titleRepairSystemPrompt },
{ role: "user", content: titleRepairUserPrompt }
],
0.6
);

const titleRepairText = titleRepairData.choices?.[0]?.message?.content;

if (titleRepairResponse.ok && titleRepairText) {
const titleRepairCleaned = cleanModelText(titleRepairText);
const repairedTitle = safeParseJSON(titleRepairCleaned);

if (repairedTitle?.title) {  
  parsed.title = String(repairedTitle.title).trim();  
}

}

titleScore = scoreTitleQuality(parsed.title, detectedLanguage);

return {
parsed,
titleScore,
titleIssues: analyzeTitleQuality(parsed.title, detectedLanguage)
};
}

async function generateRawPositioningOnce({
combinedInput,
detectedLanguage,
variantAnglePrompt = "",
variantLabel = ""
}) {
const mainSystemPrompt = `
You are a high-level book and product positioning strategist.

IMPORTANT LANGUAGE RULE:

always respond in the SAME LANGUAGE as the source input

if the source input is Polish, respond in Polish

if the source input is English, respond in English

do NOT translate into another language

for this task, detected language is: ${detectedLanguage}


Your job is to transform raw author context into a premium workbook-style product concept.

VARIANT MODE:
${variantLabel ? - current variant label: ${variantLabel} : "- standard mode"}
${variantAnglePrompt || ""}

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

think like a premium product strategist, not like a generic copywriter

the output should feel sellable, distinctive and market-ready

avoid boring, generic, obvious phrasing


AUTHOR:

extract full name if possible


TITLE (CRITICAL):

must feel like a branded product, framework, mechanism or named method

must NOT sound generic

must NOT sound like a textbook category

avoid titles built from obvious descriptors like:
"Trust-Based Sales System"
"Relationship Sales Method"
"Client Acquisition Process"
"Sprzedaż oparta na zaufaniu"
"System sprzedaży relacyjnej"

avoid overused structural words as the main form:
system, method, process, framework, blueprint, guide

these words can inspire the idea, but should NOT dominate the title

title should feel distinctive, memorable and commercially strong

2-4 words max

keep it natural in the source language

MUST sound natural in the target language

avoid direct translation structures from English

in Polish, prefer noun-based constructions like:
"Magnes Zaufania"
"Kod Konwersji"
"Pętla Autorytetu"

avoid unnatural Polish title forms like:
"Zaufany Magnet"
"Konwersyjny Klient"


BAD ENGLISH:
"Trust-Based Sales System"
"Client Conversion System"
"Sales Method"
"Business Process"
"Trust in Sales"

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
"Zaufanie w Sprzedaży"

GOOD POLISH:
"Silnik Zaufania"
"Pętla Autorytetu"
"Kod Konwersji"
"Magnes Zaufania"
"Magnes Klienta"
"Mechanizm Poleceń"

SUBTITLE:

must describe transformation + result

practical, execution-based

should feel like a workbook promise

should explain what the user achieves

can be longer than the title

must feel specific, not vague

avoid sounding like an academic description

keep it natural in the source language

avoid starting with "Jak" / "How"


HOOK (CRITICAL):

MAX 6 words (hard limit)

prefer 2-4 words

must be extremely short

keep it natural in the source language


FORMAT (VERY IMPORTANT):

must feel like a PRODUCT TAGLINE or CATEGORY LABEL

NOT a sentence

NOT an instruction

NOT "how to"

NOT generic phrasing like "competitive advantage"


STRICT RULES:

NO verbs at the beginning

NO commas

NO multiple ideas

NO full sentences

must express a DISTINCT ANGLE or viewpoint

must NOT sound generic or like a common slogan

prefer contrast, tension or unexpected phrasing


BAD:
"Uzyskaj stabilny dochód z wiedzy"
"Zbuduj trwałe relacje"
"Odkryj system sprzedaży"
"Build clients without chasing"
"How to build trust"
"Klient na wyciągnięcie ręki"
"Klient bez wysiłku"
"Zaufanie jako przewaga konkurencyjna"

GOOD:
"Dochód z wiedzy"
"Klient bez pościgu"
"Zaufanie zamiast presji"
"Autorytet zamiast pogoni"
"Sprzedaż przez pozycję"

STRUCTURE:

1 idea

1 angle

high clarity


HOOK vs SUBTITLE:

hook and subtitle must NOT repeat the same idea

each line must introduce a different value layer

hook should be a short sharp angle, claim or tagline

subtitle should expand the offer with practical transformation and mechanism

subtitle should explain HOW the promise becomes real

if hook is about result, subtitle must focus on structure, system, process, path or implementation

avoid repeating the same phrase, same framing or same benefit in both lines


CATEGORY:

broad market category

keep it natural in the source language

prefer single clear category, not combined category if avoidable

examples:
Business
Sales
Marketing
Personal Development
Biznes
Sprzedaż
Marketing
Rozwój osobisty


TONE:

choose exactly one of:
premium
classic
modern
bold


STRICT:

return JSON only

no markdown

no explanation

no extra keys
`;

const { response, data } = await callOpenAI(
[
{ role: "system", content: mainSystemPrompt },
{ role: "user", content: combinedInput }
],
0.9
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

return {
ok: true,
parsed
};
}


async function finalizePositioningCandidate(parsed, detectedLanguage) {
trimResultFields(parsed);

const titleRepaired = await repairTitleIfNeeded(parsed, detectedLanguage);
trimResultFields(titleRepaired.parsed);

const hookRepaired = await repairHookIfNeeded(titleRepaired.parsed, detectedLanguage);
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
positioning: subtitleRepaired,
quality,
hookScore: quality.scores.hook
};
}

function compareCandidates(a, b) {
if (!a) return b;
if (!b) return a;

if (a.quality?.passed && !b.quality?.passed) return a;
if (!a.quality?.passed && b.quality?.passed) return b;

const aOverall = a.quality?.scores?.overall ?? 0;
const bOverall = b.quality?.scores?.overall ?? 0;

if (aOverall !== bOverall) {
return aOverall > bOverall ? a : b;
}

const aTitle = a.quality?.scores?.title ?? 0;
const bTitle = b.quality?.scores?.title ?? 0;
if (aTitle !== bTitle) {
return aTitle > bTitle ? a : b;
}

const aHook = a.quality?.scores?.hook ?? 0;
const bHook = b.quality?.scores?.hook ?? 0;
if (aHook !== bHook) {
return aHook > bHook ? a : b;
}

return a;
}

async function generatePositioning({
combinedInput,
detectedLanguage,
variantAnglePrompt = "",
variantLabel = ""
}) {
const attempts = [];
let bestCandidate = null;
const maxAttempts = 3;

for (let i = 0; i < maxAttempts; i += 1) {
const rawResult = await generateRawPositioningOnce({
combinedInput,
detectedLanguage,
variantAnglePrompt,
variantLabel
});

if (!rawResult.ok) {  
  if (i === maxAttempts - 1 && !bestCandidate) {  
    return rawResult;  
  }  
  continue;  
}  

const finalized = await finalizePositioningCandidate(  
  rawResult.parsed,  
  detectedLanguage  
);  

const candidate = {  
  attempt: i + 1,  
  result: finalized.positioning,  
  quality: finalized.quality,  
  hookScore: finalized.hookScore  
};  

attempts.push(candidate);  
bestCandidate = compareCandidates(bestCandidate, candidate);  

if (  
  candidate.quality?.passed &&  
  candidate.quality?.scores?.overall >= 88 &&  
  !candidate.quality?.notes?.includes("hook sounds generic") &&  
  !candidate.quality?.notes?.includes("title sounds too generic")  
) {  
  bestCandidate = candidate;  
  break;  
}

}

if (!bestCandidate) {
return {
ok: false,
status: 500,
error: "Unable to generate positioning"
};
}

return {
ok: true,
language: detectedLanguage,
hookScore: bestCandidate.hookScore,
quality: {
...bestCandidate.quality,
attemptsTried: attempts.length
},
result: bestCandidate.result
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

odpowiadaj po polsku

ma to być workbook, nie książka akademicka

rozdziały mają prowadzić czytelnika krok po kroku

chapter count: ${chapterCount}

chapter titles mają brzmieć praktycznie i produktowo

goal ma opisywać cel rozdziału

exercise ma być krótkim, konkretnym ćwiczeniem workbookowym

promise = główna obietnica workbooka

reader = dla kogo dokładnie jest ten workbook

transformation = od czego do czego prowadzi

bez markdown

bez komentarzy
  :
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

respond in English

this should be a workbook, not an academic book

chapters should lead the reader step by step

chapter count: ${chapterCount}

chapter titles should sound practical and product-like

goal should describe the chapter objective

exercise should be a short concrete workbook exercise

promise = main workbook promise

reader = who this workbook is for

transformation = what change it creates

no markdown

no comments
`;

const userPrompt = `
POSITIONING:
${JSON.stringify(positioning, null, 2)}


SOURCE CONTEXT:
${combinedInput}
`;

const { response, data } = await callOpenAI(
[
{ role: "system", content: systemPrompt },
{ role: "user", content: userPrompt }
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

odpowiadaj po polsku

intro ma być krótkim, mocnym początkiem rozdziału

styl ma być praktyczny, konkretny, wdrożeniowy

exerciseTitle ma być krótkim tytułem ćwiczenia

exerciseText ma zawierać konkretne polecenie

reflectionPrompt ma być jednym pytaniem refleksyjnym

nie pisz eseju

nie używaj markdown
  :
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

respond in English

intro should be a short strong chapter opening

style should be practical, concrete and implementation-focused

exerciseTitle should be short

exerciseText should contain a concrete instruction

reflectionPrompt should be a single reflection question

do not write an essay

no markdown
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
{ role: "system", content: systemPrompt },
{ role: "user", content: userPrompt }
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

async function generateSingleVariant({
combinedInput,
detectedLanguage,
strategy
}) {
const positioningResult = await generatePositioning({
combinedInput,
detectedLanguage,
variantAnglePrompt: strategy?.anglePrompt || "",
variantLabel: strategy?.label || ""
});

if (!positioningResult.ok) {
return positioningResult;
}

const positioning = positioningResult.result;
const cover = buildCoverPayload(positioning);

return {
ok: true,
variant: {
id: createVariantId(),
strategyKey: strategy?.key || "default",
strategyLabel: strategy?.label || "Default",
createdAt: new Date().toISOString(),
hookScore: positioningResult.hookScore,
quality: positioningResult.quality,
positioning,
cover
}
};
}

async function generateVariants({
combinedInput,
detectedLanguage,
variantCount
}) {
const strategies = getVariantStrategies(detectedLanguage).slice(0, variantCount);
const variants = [];

for (const strategy of strategies) {
const variantResult = await generateSingleVariant({
combinedInput,
detectedLanguage,
strategy
});

if (!variantResult.ok) {  
  return variantResult;  
}  

variants.push(variantResult.variant);

}

return {
ok: true,
language: detectedLanguage,
variants
};
}

router.get("/author/analyze", (_req, res) => {
return res.status(200).json({
ok: true,
message: "GET test działa"
});
});

router.get("/variants/session/:sessionId", (req, res) => {
const sessionId = String(req.params.sessionId || "").trim();

if (!sessionId) {
return res.status(400).json({
ok: false,
error: "Missing sessionId"
});
}

const session = variantSessionsStore.get(sessionId);

if (!session) {
return res.status(404).json({
ok: false,
error: "Variant session not found"
});
}

const selectedVariant =
session.selectedVariantId
? session.variants.find((item) => item.id === session.selectedVariantId) || null
: null;

return res.status(200).json({
ok: true,
sessionId,
session: {
...session,
selectedVariant
}
});
});

router.get("/variants/selected/:sessionId", (req, res) => {
const sessionId = String(req.params.sessionId || "").trim();

if (!sessionId) {
return res.status(400).json({
ok: false,
error: "Missing sessionId"
});
}

const session = variantSessionsStore.get(sessionId);

if (session?.selectedVariantId) {
const selectedFromSession =
session.variants.find((item) => item.id === session.selectedVariantId) || null;

if (selectedFromSession) {  
  const payload = buildSelectedPayloadFromVariant(selectedFromSession, sessionId);  

  return res.status(200).json({  
    ok: true,  
    sessionId,  
    selected: payload  
  });  
}

}

const selected = selectedVariantsStore.get(sessionId);

if (!selected) {
return res.status(404).json({
ok: false,
error: "Selected variant not found"
});
}

return res.status(200).json({
ok: true,
sessionId,
selected
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

router.post("/generate-variants", async (req, res) => {
const {
linkedinInput,
authorContext,
sourceText,
options = {}
} = req.body || {};

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

const detectedLanguage = options.language && options.language !== "auto"
? options.language === "pl"
? "polish"
: "english"
: detectLanguage(combinedInput);

const variantCount = clampVariantCount(options.variantCount || 3);
const sessionId = String(options.sessionId || createSessionId()).trim();
const inputHash = createInputHash({
linkedinInput,
authorContext,
sourceText
});

try {
const variantsResult = await generateVariants({
combinedInput,
detectedLanguage,
variantCount
});

if (!variantsResult.ok) {  
  return res.status(variantsResult.status || 500).json(variantsResult);  
}  

variantSessionsStore.set(sessionId, {  
  sessionId,  
  createdAt: new Date().toISOString(),  
  language: detectedLanguage,  
  inputHash,  
  variantCount,  
  variants: variantsResult.variants,  
  selectedVariantId: null  
});  

return res.status(200).json({  
  ok: true,  
  language: detectedLanguage,  
  sessionId,  
  variants: variantsResult.variants  
});

} catch (err) {
return res.status(500).json({
ok: false,
error: err.message
});
}
});

router.post("/variants/select", async (req, res) => {
const {
sessionId,
variant,
variantId
} = req.body || {};

const safeSessionId = String(sessionId || "").trim() || createSessionId();

if (!variant && !variantId) {
return res.status(400).json({
ok: false,
error: "Missing variant or variantId"
});
}

let payloadToSave = null;

if (variant && typeof variant === "object") {
payloadToSave = buildSelectedPayloadFromVariant(variant, safeSessionId);

const existingSession = variantSessionsStore.get(safeSessionId);  

if (existingSession) {  
  const existingIndex = existingSession.variants.findIndex((item) => item.id === payloadToSave.id);  

  if (existingIndex >= 0) {  
    existingSession.variants[existingIndex] = {  
      ...existingSession.variants[existingIndex],  
      ...variant,  
      positioning: trimResultFields({  
        ...(variant.positioning || existingSession.variants[existingIndex].positioning || {})  
      }),  
      cover: variant.cover || buildCoverPayload(  
        variant.positioning || existingSession.variants[existingIndex].positioning || {}  
      )  
    };  
  } else {  
    existingSession.variants.push({  
      id: payloadToSave.id,  
      strategyKey: payloadToSave.strategyKey,  
      strategyLabel: payloadToSave.strategyLabel,  
      createdAt: payloadToSave.createdAt,  
      hookScore: payloadToSave.hookScore,  
      quality: payloadToSave.quality,  
      positioning: payloadToSave.positioning,  
      cover: payloadToSave.cover  
    });  
  }  

  existingSession.selectedVariantId = payloadToSave.id;  
  variantSessionsStore.set(safeSessionId, existingSession);  
}

} else {
const foundVariant = getVariantByIdFromSession(safeSessionId, variantId);

if (!foundVariant) {  
  return res.status(404).json({  
    ok: false,  
    error: "Variant not found in session. Send full variant object or valid sessionId + variantId."  
  });  
}  

payloadToSave = buildSelectedPayloadFromVariant(foundVariant, safeSessionId);  

const existingSession = variantSessionsStore.get(safeSessionId);  
if (existingSession) {  
  existingSession.selectedVariantId = payloadToSave.id;  
  variantSessionsStore.set(safeSessionId, existingSession);  
}

}

selectedVariantsStore.set(safeSessionId, payloadToSave);

return res.status(200).json({
ok: true,
sessionId: safeSessionId,
selected: payloadToSave
});
});

router.post("/generate-preview", async (req, res) => {
const {
linkedinInput,
authorContext,
sourceText,
positioning,
selectedVariant,
sessionId,
options = {}
} = req.body || {};

if (!linkedinInput && !authorContext && !sourceText && !positioning && !selectedVariant && !sessionId) {
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
JSON.stringify(positioning || selectedVariant || {})
);

const includeOutline = options.includeOutline !== false;
const includeSample = options.includeSample !== false;
const includeDecisionPaths = options.includeDecisionPaths !== false;
const useSavedSelection = options.useSavedSelection === true;
const chapterCount = clampChapterCount(options.chapterCount || 7);

try {
let finalPositioning = null;
let hookScore = null;
let quality = null;
let selectionMeta = null;

if (selectedVariant?.positioning) {  
  finalPositioning = { ...selectedVariant.positioning };  
  selectionMeta = {  
    source: "selectedVariant",  
    variantId: selectedVariant.id || null  
  };  
} else if (useSavedSelection && sessionId) {  
  const safeSessionId = String(sessionId).trim();  
  const session = variantSessionsStore.get(safeSessionId);  

  if (session?.selectedVariantId) {  
    const savedVariant =  
      session.variants.find((item) => item.id === session.selectedVariantId) || null;  

    if (!savedVariant?.positioning) {  
      return res.status(404).json({  
        ok: false,  
        error: "Saved selected variant not found inside this session"  
      });  
    }  

    finalPositioning = { ...savedVariant.positioning };  
    selectionMeta = {  
      source: "savedSelection",  
      variantId: savedVariant.id || null,  
      sessionId: safeSessionId  
    };  
  } else {  
    const selected = selectedVariantsStore.get(safeSessionId);  

    if (!selected?.positioning) {  
      return res.status(404).json({  
        ok: false,  
        error: "Saved selected variant not found for this sessionId"  
      });  
    }  

    finalPositioning = { ...selected.positioning };  
    selectionMeta = {  
      source: "savedSelectionLegacy",  
      variantId: selected.id || null,  
      sessionId: safeSessionId  
    };  
  }  
} else if (positioning) {  
  finalPositioning = { ...positioning };  
  selectionMeta = {  
    source: "positioning",  
    variantId: null  
  };  
}  

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
  selectionMeta = {  
    source: "freshGeneration",  
    variantId: null  
  };  
} else {  
  trimResultFields(finalPositioning);  

  const titleRepaired = await repairTitleIfNeeded(finalPositioning, detectedLanguage);  
  finalPositioning = titleRepaired.parsed;  
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
  selectionMeta,  
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
