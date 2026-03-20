import crypto from "crypto";
import { db } from "./db.js";
import { generateBackgroundDataUri } from "./openaiImageService.js";

const STYLE_MATRIX = [
  {
    id: "dark_premium",
    name: "Dark Premium",
    categories: ["biznes", "sprzedaż", "psychologia", "b2b"],
    tones: ["premium", "authority"],
    emotions: ["medium", "high"],
    titleColor: "#F5F7FB",
    subtitleColor: "#DCE6F5",
    kickerBg: "rgba(255,255,255,0.10)",
    gradient: ["#0A2540", "#163250", "#24496E", "#3A6CA6", "#5B7DFF"],
    layout: "stacked",
    promptHint: "cinematic premium business psychology, dramatic light, authority, bookstore-quality"
  },
  {
    id: "business_clean",
    name: "Business Clean",
    categories: ["biznes", "consulting", "edukacja"],
    tones: ["clean", "calm"],
    emotions: ["low", "medium"],
    titleColor: "#0A2540",
    subtitleColor: "#425466",
    kickerBg: "rgba(99,91,255,0.10)",
    gradient: ["#FFFFFF", "#F5F8FD", "#EEF4FB"],
    layout: "clean",
    promptHint: "minimal clean business non-fiction, editorial premium, elegant composition"
  },
  {
    id: "performance",
    name: "Performance",
    categories: ["motywacja", "performance", "działanie"],
    tones: ["bold", "performance"],
    emotions: ["high"],
    titleColor: "#FFFFFF",
    subtitleColor: "#E8EEF8",
    kickerBg: "rgba(255,255,255,0.10)",
    gradient: ["#171923", "#1F2937", "#374151", "#2563EB"],
    layout: "stacked",
    promptHint: "high-energy performance mindset, premium non-fiction, dynamic light, strong focal point"
  }
];

function buildCacheKey(input) {
  const stable = JSON.stringify({
    authorName: input.authorName,
    bookTitle: input.bookTitle,
    bookSubtitle: input.bookSubtitle,
    primaryCategory: input.primaryCategory,
    tone: input.tone,
    emotionLevel: input.emotionLevel,
    language: input.language
  });
  return crypto.createHash("sha256").update(stable).digest("hex").slice(0, 24);
}

function splitTitle(title, maxLineLen = 18) {
  const words = String(title).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const proposal = current ? `${current} ${word}` : word;
    if (proposal.length <= maxLineLen) current = proposal;
    else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 5);
}

function pickStyles(input) {
  const categoryText = `${input.primaryCategory || ""}`.toLowerCase();
  const tone = `${input.tone || ""}`.toLowerCase();
  const emotion = `${input.emotionLevel || "medium"}`.toLowerCase();

  return STYLE_MATRIX.map(style => {
    let score = 0;
    for (const c of style.categories) if (categoryText.includes(c)) score += 3;
    for (const t of style.tones) if (tone.includes(t)) score += 2;
    for (const e of style.emotions) if (emotion === e) score += 1;
    return { ...style, score };
  }).sort((a, b) => b.score - a.score).slice(0, 3);
}

function gradient(style) {
  const stops = style.gradient.map((c, i) => {
    const pct = Math.round((i / (style.gradient.length - 1)) * 100);
    return `<stop offset="${pct}%" stop-color="${c}"/>`;
  }).join("");
  return `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient>`;
}

function buildBackgroundPrompt(input, style) {
  return [
    "Premium bestselling non-fiction book cover background",
    style.promptHint,
    `theme: ${input.primaryCategory || "expert non-fiction"}`,
    `mood: ${input.tone || "premium"}`,
    `language context: ${input.language || "pl"}`,
    `title reference: ${input.bookTitle || ""}`,
    "portrait composition, bookstore quality, no text, no typography, no letters, no words, strong focal point"
  ].join(", ");
}

function renderSvg(input, style, backgroundDataUri = null) {
  const titleLines = splitTitle(input.bookTitle);
  const titleY = style.layout === "clean" ? 330 : 310;
  const lineHeight = 86;
  const titleBlock = titleLines.map((line, idx) =>
    `<text x="88" y="${titleY + idx * lineHeight}" font-size="68" font-weight="900" letter-spacing="-2.5" fill="${style.titleColor}" font-family="Inter, Arial, sans-serif">${line}</text>`
  ).join("");

  const subtitleY = titleY + titleLines.length * lineHeight + 70;
  const authorFill = style.id === "business_clean" ? "#21314A" : "#F2F6FB";
  const dividerFill = style.id === "business_clean" ? "rgba(10,37,64,0.18)" : "rgba(255,255,255,0.45)";
  const author = input.authorName || "Autor";
  const subtitle = input.bookSubtitle || "";
  const kicker = input.language === "ru" ? "психология действия" : input.language === "en" ? "psychology of action" : "psychologia działania";

  const backgroundLayer = backgroundDataUri
    ? `
      <rect width="900" height="1280" rx="38" fill="#0A2540"/>
      <image href="${backgroundDataUri}" x="0" y="0" width="900" height="1280" preserveAspectRatio="xMidYMid slice" clip-path="url(#clip)"/>
      <rect width="900" height="1280" rx="38" fill="rgba(10,37,64,0.18)"/>
    `
    : `
      <defs>${gradient(style)}</defs>
      <rect width="900" height="1280" rx="38" fill="url(#bg)"/>
    `;

  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="900" height="1280" viewBox="0 0 900 1280">
    <defs>
      ${backgroundDataUri ? '<clipPath id="clip"><rect width="900" height="1280" rx="38"/></clipPath>' : ''}
    </defs>
    ${backgroundLayer}
    <rect x="36" y="36" width="828" height="1208" rx="30" fill="none" stroke="rgba(255,255,255,0.10)"/>
    <text x="88" y="120" font-size="28" letter-spacing="8" font-weight="700" fill="${authorFill}" font-family="Inter, Arial, sans-serif">${author}</text>
    <rect x="88" y="160" rx="26" ry="26" width="330" height="58" fill="${style.kickerBg}" stroke="rgba(255,255,255,0.16)"/>
    <text x="115" y="198" font-size="24" font-weight="800" letter-spacing="3" fill="${style.subtitleColor}" font-family="Inter, Arial, sans-serif">${kicker}</text>
    ${titleBlock}
    <rect x="88" y="${subtitleY - 34}" width="600" height="2" fill="${dividerFill}"/>
    <text x="88" y="${subtitleY}" font-size="30" font-weight="500" fill="${style.subtitleColor}" font-family="Inter, Arial, sans-serif">${subtitle}</text>
    <text x="88" y="1160" font-size="24" letter-spacing="4" font-weight="700" fill="${style.subtitleColor}" font-family="Inter, Arial, sans-serif">CreateAiBooks Preview Edition</text>
  </svg>`.trim();
}

export async function generateCovers(input) {
  const cacheKey = buildCacheKey(input);
  const existing = db.coverSets.find(x => x.cacheKey === cacheKey);
  if (existing) {
    return { cacheKey, cacheHit: true, input: existing.input, covers: existing.covers };
  }

  const styles = pickStyles(input);
  const covers = [];
  for (const [idx, style] of styles.entries()) {
    const backgroundPrompt = buildBackgroundPrompt(input, style);
    let backgroundDataUri = null;
    try {
      backgroundDataUri = await generateBackgroundDataUri(backgroundPrompt);
    } catch {
      backgroundDataUri = null;
    }

    covers.push({
      id: `${style.id}_${idx + 1}`,
      styleId: style.id,
      styleName: style.name,
      hasAiBackground: Boolean(backgroundDataUri),
      backgroundPrompt,
      svg: renderSvg(input, style, backgroundDataUri)
    });
  }

  const payload = { cacheKey, cacheHit: false, input, covers, createdAt: new Date().toISOString() };
  db.coverSets.push(payload);
  return payload;
}