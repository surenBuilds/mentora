import Redis from "ioredis";
import { config } from "./config";

export interface TopicKnowledge {
  level: number; // 0 = նոր, մեծանում է ամեն ճիշտ պատասխանից, նվազում սխալից
  lastStudiedAt: string; // ISO timestamp
  nextReviewAt: string; // ISO timestamp — երբ պիտի կրկնվի (spaced repetition)
  timesReviewed: number;
  lastResult: "correct" | "partial" | "incorrect" | null;
}

export interface State {
  chatId: string;
  topics: string[];
  sendTime: string; // cron expression, minute hour * * *
  knowledgeMap: Record<string, TopicKnowledge>;
}

const REDIS_URL = process.env.REDIS_URL || "";
const STATE_KEY = "mentora:state";

let redis: Redis | null = null;
if (REDIS_URL) {
  redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: true });
  redis.on("error", (err) => console.error("Redis սխալ:", err.message));
}

function defaultState(): State {
  return {
    chatId: config.telegramChatId,
    topics: config.defaultTopics,
    sendTime: config.sendTime,
    knowledgeMap: {},
  };
}

/**
 * Բեռնում է state-ը Redis-ից։ Եթե Redis հասանելի չէ կամ դատարկ է,
 * վերադարձնում է լռելյայն արժեքները (env փոփոխականներից)։
 */
export async function loadState(): Promise<State> {
  const fallback = defaultState();
  if (!redis) return fallback;

  try {
    if (redis.status === "wait") await redis.connect();
    const raw = await redis.get(STATE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<State>;
    return { ...fallback, ...parsed, knowledgeMap: parsed.knowledgeMap || {} };
  } catch (err: any) {
    console.error("State բեռնման սխալ, օգտագործում ենք լռելյայն արժեքները:", err.message);
    return fallback;
  }
}

export async function saveState(state: State): Promise<void> {
  if (!redis) {
    console.warn("REDIS_URL սահմանված չէ. փոփոխությունները չեն պահպանվի restart-ից հետո։");
    return;
  }
  try {
    if (redis.status === "wait") await redis.connect();
    await redis.set(STATE_KEY, JSON.stringify(state));
  } catch (err: any) {
    console.error("State պահպանման սխալ:", err.message);
  }
}
