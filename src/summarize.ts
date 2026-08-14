import axios from "axios";
import { config } from "./config";
import { SearchResult } from "./search";

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
        const backoffMs = attempt * 5000; // 5s, 10s
        console.warn(
          `Gemini ${isRateLimited ? "429" : "timeout"}, կրկին փորձ ${attempt}/${maxAttempts} ${backoffMs}ms հետո...`
        );
        await sleep(backoffMs);
        continue;
      }
      throw err;
    }
  }
  return "";
}

/**
 * Կանչում է Gemini API-ն՝ տրված թեմայի և որոնման արդյունքների հիման վրա
 * Հայերենով կարճ, օգտակար ամփոփում գեներացնելու համար։
 */
export async function summarizeTopic(
  topic: string,
  results: SearchResult[]
): Promise<string> {
  const hasResults = results.length > 0;

  const sourcesBlock = hasResults
    ? results
        .map(
          (r, i) =>
            `[${i + 1}] ${r.title}\nԱղբյուր: ${r.url}\nՀատված: ${r.content}`
        )
        .join("\n\n")
    : "";

  const prompt = hasResults
    ? `Դու օգնում ես մի պատանու, ով ուզում է ամեն օր խելացի ու տեղեկացված դառնալ։
Թեմա՝ "${topic}"

Ստորև բերված են այս թեմայով վերջին որոնման արդյունքները.

${sourcesBlock}

Այս նյութերի հիման վրա գրիր Հայերենով 2-4 կարճ, կոնկրետ ու օգտակար կետ (bullet point), որոնք իրականում նոր բան են սովորեցնում, ոչ թե ընդհանուր խոսք։ Յուրաքանչյուր կետը պիտի լինի 1-2 նախադասություն։ Եթե տեղին է, կետի վերջում կարող ես նշել աղբյուրի [1], [2] և այլն համարանիշը փակագծերում։ Մի գրիր ներածություն կամ եզրափակում, միայն bullet կետերը՝ "•" նշանով սկսած։`
    : `Դու օգնում ես մի պատանու, ով ուզում է ամեն օր խելացի ու տեղեկացված դառնալ։
Թեմա՝ "${topic}"

Քո սեփական գիտելիքի հիման վրա գրիր Հայերենով 2-4 կարճ, կոնկրետ ու օգտակար փաստ կամ սկզբունք այս թեմայից, որը կիրառելի է իրական կյանքում կամ բիզնեսում։ Յուրաքանչյուր կետը՝ 1-2 նախադասություն, "•" նշանով սկսած։ Առանց ներածության կամ եզրափակման։`;

  try {
    const text = await callGemini(prompt);
    return text || "(չհաջողվեց գեներացնել ամփոփում այս թեմայի համար)";
  } catch (err: any) {
    console.error(`Gemini սխալ (${topic}):`, err?.response?.data || err.message);
    return "(տեխնիկական խնդիր՝ այս թեման այսօր բաց թողնվեց)";
  }
}
