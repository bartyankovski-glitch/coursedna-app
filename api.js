export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  const { authorContext } = req.body;

  if (!authorContext) {
    return res.status(400).json({ error: "Missing authorContext" });
  }

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
You are a book positioning strategist.

Analyze the author based on provided context and return:

- author (full name or best guess)
- title (compelling book title)
- subtitle (clear benefit-driven subtitle)
- category (1 word)
- tone (premium, dark or light)

Respond ONLY in JSON:
{
  "author": "",
  "title": "",
  "subtitle": "",
  "category": "",
  "tone": ""
}
`
          },
          {
            role: "user",
            content: authorContext
          }
        ],
        temperature: 0.7
      })
    });

    const data = await response.json();

    const text = data.choices?.[0]?.message?.content;

    let parsed;

    try {
      parsed = JSON.parse(text);
    } catch {
      return res.status(500).json({ ok: false, error: "Invalid JSON from AI", raw: text });
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
}
