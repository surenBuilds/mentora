import axios from "axios";
import { config } from "./config";
import { searchTopic } from "./search";
import { summarizeTopic } from "./summarize";
import { State } from "./state";
import { getDueTopics } from "./tutor";

function escapeMd(text: string): string {
  return text.replace(/([_*[\]()~`>#+\-=|{}.!])/g, "\\$1");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function buildDigest(state: State): Promise<string> {
  const dateStr = new Date().toLocaleDateString("hy-AM", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  let message = `📚 *Օրվա գիտելիքները* — ${escapeMd(dateStr)}\n\n`;

  const dueTopics = getDueTopics(state.knowledgeMap);
  if (dueTopics.length > 0) {
    message += `🔁 *Կրկնության ժամանակն է*\n${dueTopics
      .map((t) => escapeMd(`• ${t}`))
      .join("\n")}\n_Գրիր /now, հետո այս թեմաներից մեկը՝ կրկնելու համար։_\n\n`;
  }

  const topics = state.topics;
  for (let i = 0; i < topics.length; i++) {
    const topic = topics[i];
    const results = await searchTopic(topic);
    const summary = await summarizeTopic(topic, results);
    message += `*${escapeMd(topic.toUpperCase())}*\n${escapeMd(summary)}\n\n`;
    if (i < topics.length - 1) await sleep(2000); // փոքր դադար՝ rate limit-ից խուսափելու համար
  }

  message += "_Լավ օր, սովորի′ր ամեն օր մի բան նոր\\!_";
  return message;
}

/**
 * Ուղարկում է digest-ը Telegram-ի sendMessage API-ով ուղղակիորեն (axios),
 * որպեսզի cron script-ը ինքնուրույն աշխատի՝ առանց Telegraf bot instance պահանջելու։
 */
export async function sendDigest(state: State): Promise<void> {
  if (!state.chatId) {
    console.error("Chat ID սահմանված չէ. հնարավոր չէ ուղարկել digest-ը:");
    return;
  }

  const digest = await buildDigest(state);
  const chunks = digest.match(/[\s\S]{1,3900}/g) || [digest];
  const url = `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`;

  for (const chunk of chunks) {
    try {
      await axios.post(url, {
        chat_id: state.chatId,
        text: chunk,
        parse_mode: "MarkdownV2",
      });
    } catch (err: any) {
      console.error("Telegram ուղարկման սխալ:", err?.response?.data || err.message);
      // fallback՝ առանց markdown-ի
      try {
        await axios.post(url, {
          chat_id: state.chatId,
          text: "Այսօրվա digest-ը պատրաստելիս սխալ եղավ։ Փորձիր /now հրամանով կրկին։",
        });
      } catch {
        /* no-op */
      }
    }
  }
}
