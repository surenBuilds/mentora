import axios from "axios";
import { config } from "./config";
import { TopicKnowledge } from "./state";

// Spaced repetition ինտերվալներ (օրերով)՝ ըստ մակարդակի. level 0 → 1 օր հետո կրկնել, ..., level 5+ → 60 օր
const INTERVALS_DAYS = [1, 2, 4, 7, 14, 30, 60];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGemini(prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent?key=${config.geminiApiKey}`;
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await axios.post(
        url,
        { contents: [{ parts: [{ text: prompt }] }] },
        { timeout: 45000 }
      );
      const text =
        response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      return text || "";
    } catch (err: any) {
      const status = err?.response?.status;
      const isRateLimited = status === 429;
      const isTimeout = err?.code === "ECONNABORTED";
      if ((isRateLimited || isTimeout) && attempt < maxAttempts) {
        await sleep(attempt * 5000);
        continue;
      }
      throw err;
    }
  }
  return "";
}

/**
 * Գեներացնում է 1 կարճ, կոնկրետ ստուգիչ հարց՝ հենց ներկայացված ամփոփման հիման վրա
 * (ոչ թե ընդհանուր գիտելիքից), որ իրապես ստուգի՝ արդյոք օգտատերը հասկացավ նյութը։
 */
export async function generateQuizQuestion(
  topic: string,
  summary: string
): Promise<string> {
  const prompt = `Ստորև տրված է Հայերեն ամփոփում «${topic}» թեմայով, որը հենց նոր ուղարկվել է օգտատիրոջը.

${summary}

Կազմիր ՄԵԿ կարճ, կոնկրետ հարց Հայերենով, որը ստուգում է՝ արդյոք օգտատերը հասկացավ ու կարող է կիրառել այս ամփոփման մեջ եղած գաղափարներից գոնե մեկը։ Հարցը պիտի կարողանա պատասխանվել 1-2 նախադասությամբ, առանց ընտրովի պատասխանների (open-ended)։ Մի գրիր ոչինչ բացի հենց հարցից, ոչ մի «Հարց.» կամ նախաբան։`;

  try {
    const text = await callGemini(prompt);
    return text || `Ի՞նչն ամենակարևորն էր, որ սովորեցիր «${topic}» թեմայից։`;
  } catch (err: any) {
    console.error(`Quiz գեներացման սխալ (${topic}):`, err?.response?.data || err.message);
    return `Ի՞նչն ամենակարևորն էր, որ սովորեցիր «${topic}» թեմայից։`;
  }
}

export interface EvaluationResult {
  verdict: "correct" | "partial" | "incorrect";
  feedback: string;
}

/**
 * Գնահատում է օգտատիրոջ պատասխանը՝ համեմատած բնօրինակ ամփոփման հետ,
 * և տալիս կարճ, աջակցող feedback Հայերենով։
 */
export async function evaluateAnswer(
  topic: string,
  summary: string,
  question: string,
  userAnswer: string
): Promise<EvaluationResult> {
  const prompt = `Դու ուսուցիչ ես։ Թեմա՝ "${topic}"

Բնօրինակ նյութը, որը սովորեցվել էր.
${summary}

Հարցը, որ տրվեց օգտատիրոջը.
${question}

Օգտատիրոջ պատասխանը.
${userAnswer}

Գնահատիր պատասխանը և պատասխանիր ՀԵՆՑ այս ֆորմատով, առանց այլ տեքստի.
ԳՆԱՀԱՏՈՒՄ: ճիշտ (եթե պատասխանը ցույց է տալիս իրական հասկացում) կամ կիսով (եթե մասամբ ճիշտ է կամ մակերեսային) կամ սխալ (եթե սխալ է կամ բացակայում է հասկացումը)
ՄԵԿՆԱԲԱՆՈՒԹՅՈՒՆ: 1-2 կարճ, աջակցող նախադասություն Հայերենով, որը բացատրում է ինչու, և եթե պետք է՝ ուղղում է սխալ պատկերացումը։ Եղիր ջերմ ու խրախուսող, ոչ դատողական։`;

  try {
    const text = await callGemini(prompt);
    const verdictMatch = text.match(/ԳՆԱՀԱՏՈՒՄ:\s*(ճիշտ|կիսով|սխալ)/i);
    const feedbackMatch = text.match(/ՄԵԿՆԱԲԱՆՈՒԹՅՈՒՆ:\s*([\s\S]*)/i);

    let verdict: EvaluationResult["verdict"] = "partial";
    const v = verdictMatch?.[1]?.toLowerCase();
    if (v === "ճիշտ") verdict = "correct";
    else if (v === "սխալ") verdict = "incorrect";
    else verdict = "partial";

    const feedback = feedbackMatch?.[1]?.trim() || text || "Շնորհակալ եմ պատասխանի համար։";
    return { verdict, feedback };
  } catch (err: any) {
    console.error(`Գնահատման սխալ (${topic}):`, err?.response?.data || err.message);
    return {
      verdict: "partial",
      feedback: "(տեխնիկական խնդրի պատճառով չկարողացա ամբողջությամբ գնահատել պատասխանդ, բայց շարունակենք)",
    };
  }
}

/**
 * Թարմացնում է թեմայի գիտելիքի մակարդակը՝ ըստ պատասխանի արդյունքի,
 * և հաշվարկում հաջորդ կրկնության ամսաթիվը (spaced repetition)։
 */
export function updateKnowledge(
  existing: TopicKnowledge | undefined,
  verdict: EvaluationResult["verdict"]
): TopicKnowledge {
  const now = new Date();
  let level = existing?.level ?? 0;
  const timesReviewed = (existing?.timesReviewed ?? 0) + 1;

  if (verdict === "correct") {
    level = Math.min(level + 1, INTERVALS_DAYS.length - 1);
  } else if (verdict === "incorrect") {
    level = 0; // սխալ պատասխանը զրոյացնում է progress-ը, շուտ կրկնվի
  }
  // partial-ի դեպքում level-ը մնում է նույնը

  const intervalDays = INTERVALS_DAYS[level];
  const nextReviewAt = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);

  return {
    level,
    lastStudiedAt: now.toISOString(),
    nextReviewAt: nextReviewAt.toISOString(),
    timesReviewed,
    lastResult: verdict,
  };
}

/**
 * Վերադարձնում է թեմաների ցանկը, որոնց կրկնության ժամանակն արդեն հասել է։
 */
export function getDueTopics(knowledgeMap: Record<string, TopicKnowledge>): string[] {
  const now = new Date();
  return Object.entries(knowledgeMap)
    .filter(([, k]) => new Date(k.nextReviewAt) <= now)
    .map(([topic]) => topic);
}
