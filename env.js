export const env = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || "development",
  appBaseUrl: process.env.APP_BASE_URL || "",
  openAiApiKey: process.env.OPENAI_API_KEY || "",
  useOpenAiImages: String(process.env.USE_OPENAI_IMAGES || "false").toLowerCase() === "true",
  openAiImageModel: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
  openAiImageSize: process.env.OPENAI_IMAGE_SIZE || "1024x1536",
  openAiImageQuality: process.env.OPENAI_IMAGE_QUALITY || "medium",
  openAiImageFormat: process.env.OPENAI_IMAGE_FORMAT || "png"
};