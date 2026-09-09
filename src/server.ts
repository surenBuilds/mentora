import express from "express";
import axios from "axios";
import { Telegraf } from "telegraf";
import { config } from "./config";
import { loadState, saveState, Session } from "./state";
import { sendDigest } from "./digest";
import { searchTopic } from "./search";
import { summarizeTopic } from "./summarize";
import {
  generateQuizQuestion,
  evaluateAnswer,
  updateKnowledge,
  getDueTopics,
} from "./tutor";

const bot = new Telegraf(config.telegramBotToken);
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;
const WEBHOOK_PATH = `/telegraf/${config.telegramBotToken}`;
const TG_API = `https://api.telegram.org/bot${config.telegramBotToken}`;

function escapeMd(text: string): string {
  return text.replace(/([_*[\]()~`>#+\-=|{}.!])/g, "\\$1");
}

async function send(chatId: string, text: string, markdown = true): Promise<void> {
  const chunks = text.match(/[\s\S]{1,3900}/g) || [text];
  for (const chunk of chunks) {
    try {
      await axios.post(`${TG_API}/sendMessage`, {
        chat_id: chatId,
        text: chunk,
        ...(markdown ? { parse_mode: "MarkdownV2" } : {}),
      });
    } catch (err: any) {
      console.error("Telegram ուղարկման սխալ:", err?.response?.data || err.message);
      if (markdown) {
        // fallback՝ առանց markdown-ի, եթե escape-ի խնդիր կա
        try {
          await axios.post(`${TG_API}/sendMessage`, { chat_id: chatId, text: chunk });
        } catch {
          /* no-op */
        }
      }
    }
  }
}

/**
 * Սովորել + Հասկանալ փուլ. որոնում է նյութ, ամփոփում, ուղարկում,
 * հետո գեներացնում ու ուղարկում է ստուգիչ հարց (Ստուգվել փուլի սկիզբ)։
 */
async function runLearnAndQuiz(chatId: string, topic: string): Promise<void> {
  const results = await searchTopic(topic);
  const summary = await summarizeTopic(topic, results, "detailed");
  await send(chatId, `🔎 *${escapeMd(topic.toUpperCase())}*\n\n${escapeMd(summary)}`);

  const question = await generateQuizQuestion(topic, summary);

  const state = await loadState();
  state.chatId = chatId;
  state.session = { status: "awaiting_answer", topic, summary, question };
  await saveState(state);

  await send(chatId, `❓ ${escapeMd(question)}`);
}

/**
 * Ստուգվել + Feedback փուլ. գնահատում է պատասխանը, տալիս feedback,
 * թարմացնում է գիտելիքի քարտեզը (Կրկնել փուլի ժամանակացույց)։
 */
async function runEvaluateAndSchedule(
  chatId: string,
  session: Required<Pick<Session, "topic" | "summary" | "question">>,
  userAnswer: string
): Promise<void> {
  const { topic, summary, question } = session;
  const result = await evaluateAnswer(topic, summary, question, userAnswer);

  const state = await loadState();
  const existing = state.knowledgeMap[topic];
  const updated = updateKnowledge(existing, result.verdict);
  state.knowledgeMap[topic] = updated;
  state.session = { status: "awaiting_topic" }; // շարունակում ենք ցիկլը հաջորդ թեմայի համար
  await saveState(state);

  const verdictEmoji =
    result.verdict === "correct" ? "✅" : result.verdict === "partial" ? "🟡" : "🔁";
  const nextReviewDays = Math.round(
    (new Date(updated.nextReviewAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
  );
  await send(
    chatId,
    `${verdictEmoji} ${escapeMd(result.feedback)}\n\n_Հաջորդ կրկնությունը՝ մոտ ${nextReviewDays} օր հետո_`
  );
  await send(
    chatId,
    "Էլի ի՞նչ ես ուզում սովորել։ (կամ /review՝ կրկնվող թեմաների համար, /stop՝ ավարտելու)",
    false
  );
}

bot.start(async (ctx) => {
  const state = await loadState();
  state.chatId = String(ctx.chat.id);
  await saveState(state);
  ctx.reply(
    "Բարև՛, ես Mentora-ն եմ 📚 քո անհատական AI ուսուցիչը։\n\n" +
      `Ամեն օր, ծրագրված ժամին, ինքնաբերաբար կուղարկեմ digest այս ոլորտներով՝ ${state.topics.join(", ")}\n\n` +
      "Յուրաքանչյուր թեմա անցնում է ցիկլով՝ Սովորել → Հասկանալ → Ստուգվել → Feedback → Կրկնել (spaced repetition), որ գիտելիքն իրապես մնա հիշողության մեջ։\n\n" +
      "Հրամաններ.\n" +
      "/now — սովորել կոնկրետ ոլորտի մասին հենց հիմա\n" +
      "/review — տեսնել, որ թեմաներն են արդեն կրկնության ժամանակ\n" +
      "/stop — կանգնեցնել հոսքը\n" +
      "/topics — տեսնել ամենօրյա digest-ի ոլորտները\n" +
      "/settopics ոլորտ1, ոլորտ2, ... — փոխել ամենօրյա digest-ի ոլորտները"
  );
});

bot.command("now", async (ctx) => {
  const chatId = String(ctx.chat.id);
  const state = await loadState();
  state.chatId = chatId;
  state.session = { status: "awaiting_topic" };
  await saveState(state);
  await ctx.reply(
    'Ի՞նչ ոլորտի կամ թեմայի մասին ես ուզում սովորել հիմա։ (գրիր, օր. "արհեստական բանականություն" կամ "ապրանքանիշի կառուցում")'
  );
});

bot.command("review", async (ctx) => {
  const state = await loadState();
  const due = getDueTopics(state.knowledgeMap);
  if (due.length === 0) {
    ctx.reply(
      Object.keys(state.knowledgeMap).length === 0
        ? "Դեռ ոչ մի թեմա չես սովորել /now-ով։ Փորձիր հիմա՝ գրիր /now։"
        : "Հիմա կրկնության ժամանակ ունեցող թեմա չկա, ամեն ինչ թարմ է 👍"
    );
    return;
  }
  ctx.reply(
    `Այս թեմաները արդեն կրկնության ժամանակ ունեն.\n${due.map((t) => `• ${t}`).join("\n")}\n\n` +
      "Գրիր /now, հետո նշիր դրանցից մեկը՝ կրկնելու համար։"
  );
});

// Ազատ տեքստով պատասխան.
// 1) եթե սպասում ենք quiz-ի պատասխանի՝ գնահատում ենք
// 2) եթե սպասում ենք թեմայի անվանում՝ սկսում ենք Սովորել+Ստուգվել ցիկլը
// Session-ը պահվում է Redis-ում (ոչ թե հիշողությունում), որ չկորչի,
// երբ Render-ի free tier service-ը «քնում» է հաղորդագրությունների միջև։
bot.on("text", async (ctx, next) => {
  const chatId = String(ctx.chat.id);
  const text = ctx.message.text.trim();

  if (text.startsWith("/")) return next();

  const state = await loadState();
  const session = state.session;

  if (session.status === "awaiting_answer" && session.topic && session.summary && session.question) {
    const sessionData = {
      topic: session.topic,
      summary: session.summary,
      question: session.question,
    };
    await ctx.reply("Ստուգում եմ պատասխանդ, մի պահ...");
    runEvaluateAndSchedule(chatId, sessionData, text).catch((err) =>
      console.error("Գնահատման ֆոնային սխալ:", err)
    );
    return;
  }

  if (session.status === "awaiting_topic") {
    state.chatId = chatId;
    state.session = { status: "idle" }; // մինչև runLearnAndQuiz-ը կսահմանի awaiting_answer
    await saveState(state);

    await ctx.reply(`Փնտրում եմ նյութեր «${text}» թեմայով, մի պահ...`);
    runLearnAndQuiz(chatId, text).catch((err) =>
      console.error("runLearnAndQuiz ֆոնային սխալ:", err)
    );
    return;
  }

  return next();
});

bot.command("stop", async (ctx) => {
  const chatId = String(ctx.chat.id);
  const state = await loadState();
  state.chatId = chatId;
  state.session = { status: "idle" };
  await saveState(state);
  ctx.reply("Լավ, կանգնեցրի։ Երբ ուզես նորից սովորել՝ գրիր /now։");
});

bot.command("topics", async (ctx) => {
  const state = await loadState();
  ctx.reply(`Ամենօրյա digest-ի ոլորտները՝\n${state.topics.map((t) => `• ${t}`).join("\n")}`);
});

bot.command("settopics", async (ctx) => {
  const text = ctx.message.text.replace("/settopics", "").trim();
  if (!text) {
    ctx.reply("Օգտագործում՝ /settopics ոլորտ1, ոլորտ2, ոլորտ3");
    return;
  }
  const newTopics = text.split(",").map((t) => t.trim()).filter(Boolean);
  if (newTopics.length === 0) {
    ctx.reply("Ոչ մի վավեր ոլորտ չգտնվեց։");
    return;
  }
  const state = await loadState();
  state.topics = newTopics;
  state.chatId = String(ctx.chat.id);
  await saveState(state);
  ctx.reply(`Ամենօրյա digest-ի ոլորտները թարմացվեցին՝\n${newTopics.map((t) => `• ${t}`).join("\n")}`);
});

bot.command("settime", (ctx) => {
  ctx.reply(
    "Ամենօրյա digest-ի ուղարկման ժամանակացույցը կառավարվում է GitHub Actions workflow-ով, ոչ թե բոտի միջոցով։\n" +
      "Փոխելու համար՝ խմբագրիր .github/workflows/daily-digest.yml ֆայլի cron տողը " +
      "(հիշիր՝ ժամը UTC է, Երևանից 4 ժամ պակաս)։"
  );
});

bot.catch((err) => console.error("Բոտի սխալ:", err));

app.use(bot.webhookCallback(WEBHOOK_PATH));

app.get("/", (_req, res) => {
  res.send("Mentora bot is running.");
});

// Կանչվում է արտաքին scheduler-ից (GitHub Actions) ամեն օր՝ digest ուղարկելու համար։
app.post("/trigger-digest", async (req, res) => {
  const secret = req.header("X-Trigger-Secret") || req.query.secret;
  if (!process.env.TRIGGER_SECRET || secret !== process.env.TRIGGER_SECRET) {
    res.status(403).send("Forbidden");
    return;
  }
  res.status(202).send("Digest sending started");
  const state = await loadState();
  await sendDigest(state);
});

async function main() {
  const publicUrl = process.env.RENDER_EXTERNAL_URL;
  if (publicUrl) {
    await bot.telegram.setWebhook(`${publicUrl}${WEBHOOK_PATH}`);
    console.log(`Webhook սահմանված է: ${publicUrl}${WEBHOOK_PATH}`);
  } else {
    console.warn(
      "RENDER_EXTERNAL_URL հասանելի չէ. webhook-ը ինքնաբերաբար չի սահմանվի։"
    );
  }
  app.listen(PORT, () => console.log(`Server լսում է port ${PORT}-ին`));
}

main().catch((err) => {
  console.error("Չհաջողվեց գործարկել server-ը:", err);
  process.exit(1);
});
