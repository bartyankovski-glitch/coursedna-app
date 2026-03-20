import { env } from "./env.js";

export async function generateBackgroundDataUri(prompt) {
  if (!env.useOpenAiImages || !env.openAiApiKey) return null;

  const response = await fetch("https://api.openai.com/v1/images", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.openAiApiKey}`
    },
    body: JSON.stringify({
      model: env.openAiImageModel,
      prompt,
      size: env.openAiImageSize,
      quality: env.openAiImageQuality,
      output_format: env.openAiImageFormat
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI Images API error: ${response.status} ${text}`);
  }

  const data = await response.json();
  const item = data?.data?.[0];
  if (!item?.b64_json) return null;

  return `data:image/${env.openAiImageFormat};base64,${item.b64_json}`;
}