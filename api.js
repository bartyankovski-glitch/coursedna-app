import express from "express";
import { createId, db } from "./db.js";
import { generateCovers } from "./coverService.js";
import { recordEvent, getScoreState, getScoreHistory } from "./scoringService.js";

const router = express.Router();

router.post("/covers/generate", express.json(), async (req, res) => {
  const payload = {
    userId: req.body.userId || "user_001",
    authorName: req.body.authorName || "Dariusz Skraskowski",
    bookTitle: req.body.bookTitle || "Jak opanować stres, prowadzić lepsze rozmowy i działać skuteczniej",
    bookSubtitle: req.body.bookSubtitle || "Praktyczna psychologia rozmowy, działania i wpływu",
    primaryCategory: req.body.primaryCategory || "psychologia sprzedaży",
    tone: req.body.tone || "premium",
    emotionLevel: req.body.emotionLevel || "medium",
    language: req.body.language || "pl"
  };

  const result = await generateCovers(payload);
  res.json(result);
});

router.post("/cover-events", express.json(), (req, res) => {
  const event = {
    id: createId("evt"),
    userId: req.body.userId || "user_demo",
    cacheKey: req.body.cacheKey,
    eventType: req.body.eventType,
    createdAt: new Date().toISOString()
  };

  const state = recordEvent(event);
  res.json({ ok: true, state });
});

router.get("/cover-score/:cacheKey", (req, res) => {
  const state = getScoreState(req.params.cacheKey);
  if (!state) {
    return res.status(404).json({ error: "Score state not found" });
  }
  res.json(state);
});

router.get("/cover-score/:cacheKey/history", (req, res) => {
  res.json({
    cacheKey: req.params.cacheKey,
    history: getScoreHistory(req.params.cacheKey)
  });
});

router.post("/author/analyze", express.json({ limit: "2mb" }), async (req, res) => {
  try {
    const {
      linkedinUrl = "",
      sourceUrls = [],
      authorContext = ""
    } = req.body || {};

    const combinedText = [
      linkedinUrl ? `LinkedIn URL: ${linkedinUrl}` : "",
      Array.isArray(sourceUrls) && sourceUrls.length
        ? `Dodatkowe linki:\n${sourceUrls.join("\n")}`
        : "",
      authorContext ? `Treść o autorze:\n${authorContext}` : ""
    ]
      .filter(Boolean)
      .join("\n\n");

    // MVP fallback:
    // Na tym etapie NIE wołamy jeszcze modelu AI.
    // Zwracamy prostą analizę heurystyczną, żeby podłączyć flow end-to-end.
    // W kolejnym kroku można to podmienić na prawdziwe wywołanie modelu.

    const text = combinedText.toLowerCase();

    let author = "Autor";
    let category = "biznes";
    let tone = "premium";
    let title = "Strategiczny ebook ekspercki";
    let subtitle = "Jak zamienić wiedzę w produkt, który buduje autorytet i sprzedaż";
    let themes = ["eksperckość", "produkt wiedzy"];
    let summary = "To jest wstępna analiza autora w trybie AUTO mode.";
    let confidence = 0.52;

    // Prosta heurystyka pod case Darka / podobne profile
    if (
      text.includes("dariusz skraskowski") ||
      text.includes("stres") ||
      text.includes("rozmow") ||
      text.includes("komunikacj") ||
      text.includes("wpływ")
    ) {
      author = "Dariusz Skraskowski";
      category = "psychologia sprzedaży";
      tone = "premium";
      title = "Jak opanować stres i prowadzić lepsze rozmowy";
      subtitle = "Praktyczna psychologia wpływu, komunikacji i działania dla ekspertów i sprzedawców";
      themes = ["stres", "komunikacja", "wpływ", "rozmowy", "sprzedaż"];
      summary =
        "Autor komunikuje obszary związane ze stresem, komunikacją i wpływem. Najbardziej sprzedażowym kierunkiem jest praktyczny ebook łączący psychologię rozmowy i skuteczność działania.";
      confidence = 0.86;
    } else if (text.includes("sprzeda") || text.includes("negocjacj")) {
      category = "sprzedaż";
      tone = "authority";
      title = "Jak sprzedawać spokojniej i skuteczniej";
      subtitle = "Psychologia rozmowy, wpływu i decyzji w nowoczesnej sprzedaży";
      themes = ["sprzedaż", "negocjacje", "wpływ"];
      summary =
        "Treść wskazuje na ekspercki obszar sprzedaży i wpływu. Najlepszy kierunek to praktyczny produkt wiedzy osadzony w realnych rozmowach sprzedażowych.";
      confidence = 0.74;
    } else if (text.includes("coach") || text.includes("trener") || text.includes("ekspert")) {
      category = "rozwój osobisty";
      tone = "clean";
      title = "Jak zamienić wiedzę w produkt ekspercki";
      subtitle = "Przewodnik dla trenerów, konsultantów i ekspertów, którzy chcą sprzedawać swoją wiedzę";
      themes = ["eksperckość", "produkt cyfrowy", "autorytet"];
      summary =
        "Materiał sugeruje profil ekspercki. Najlepszy kierunek to ebook, który porządkuje wiedzę autora i przygotowuje grunt pod sprzedaż.";
      confidence = 0.67;
    }

    return res.json({
      ok: true,
      result: {
        author,
        themes,
        title,
        subtitle,
        category,
        tone,
        summary,
        confidence
      }
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || "Author analyze failed"
    });
  }
});

export default router;
