import "dotenv/config";

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    throw new Error(`Բացակայում է անհրաժեշտ environment փոփոխականը: ${name}`);
  }
  return val;
}

export const config = {
  telegramBotToken: requireEnv("TELEGRAM_BOT_TOKEN"),
  // Chat ID-ն կարող է սկզբում դատարկ լինել. բոտը ինքն է սովորելու այն, երբ դու գրես նրան /start
  telegramChatId: process.env.TELEGRAM_CHAT_ID || "",
  geminiApiKey: requireEnv("GEMINI_API_KEY"),
  geminiModel: process.env.GEMINI_MODEL || "gemini-3.5-flash",
  tavilyApiKey: process.env.TAVILY_API_KEY || "", // եթե դատարկ է, կանցնենք fallback ռեժիմի
  // cron ֆորմատ: "րոպե ժամ * * *"  (օրինակ '0 9 * * *' = ամեն օր 09:00)
  sendTime: process.env.SEND_TIME || "0 9 * * *",
  timezone: process.env.TIMEZONE || "Asia/Yerevan",
  defaultTopics: (
    process.env.DEFAULT_TOPICS ||
    "բիզնես,մարքեթինգ,վաճառք,ձեռնարկատիրություն,պատմություն,ներդրումներ,ընդհանուր գիտելիքներ"
  )
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean),
};
