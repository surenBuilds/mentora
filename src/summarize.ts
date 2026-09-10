import axios from "axios";
import { config } from "./config";
import { SearchResult } from "./search";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGemini(prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent?key=${config.geminiApiKey}`;
  const maxAttempts = 4;

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
      const isRetryable = status === 429 || status === 503;
      const isTimeout = err?.code === "ECONNABORTED";
      if ((isRetryable || isTimeout) && attempt < maxAttempts) {
        const backoffMs = attempt * 5000; // 5s, 10s
        console.warn(
          `Gemini ${isRetryable ? status : "timeout"}, կրկին փորձ ${attempt}/${maxAttempts} ${backoffMs}ms հետո...`
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
 * Հայերենով ամփոփում գեներացնելու համար։
 * depth: "brief" — 2-4 կարճ կետ (ամենօրյա digest-ի համար),
 *        "detailed" — ամբողջական, կառուցվածքային ~1 էջ նյութ (/now ուսուցման հոսքի համար)
 */
export async function summarizeTopic(
  topic: string,
  results: SearchResult[],
  depth: "brief" | "detailed" = "brief"
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

  const sourcesContext = hasResults
    ? `Ստորև բերված են այս թեմայով վերջին որոնման արդյունքները, օգտագործիր դրանք հիմք որպես.\n\n${sourcesBlock}\n\n`
    : "Իրական որոնման արդյունքներ չկան, օգտագործիր քո սեփական գիտելիքը։\n\n";

  const prompt =
    depth === "detailed"
      ? `Դու անհատական ուսուցիչ ես մի պատանու համար, ով ուզում է իրապես խորը հասկանալ նյութը, ոչ միայն մակերեսային փաստեր իմանալ։
Թեմա՝ "${topic}"

${sourcesContext}Գրիր Հայերենով ընդարձակ, կառուցվածքային բացատրություն այս թեմայի մասին՝ մոտ 500-700 բառի սահմաններում (մոտ 1 էջ)։ Կառուցվածքը.

1. Կարճ ներածություն (2-3 նախադասություն)՝ ինչու է այս թեման կարևոր
2. 3-4 հիմնական ենթաթեմա կամ սկզբունք, յուրաքանչյուրը՝ 3-5 նախադասությամբ բացատրված, կոնկրետ օրինակով կամ իրական դեպքով (եթե տեղին է, նշիր [1], [2] աղբյուրի համարանիշը)
3. Կարճ եզրափակիչ պարբերություն՝ ինչպես կիրառել այս գիտելիքը գործնականում

Օգտագործիր պարբերություններ, ոչ թե կարճ bullet-ներ։ Ենթաթեմաների առաջ կարող ես գրել կարճ վերնագիր՝ առանց markdown նշանների (առանց աստղանիշների), պարզապես նոր տողից։ Մի գրիր «Ներածություն» կամ «Եզրակացություն» բառերը որպես վերնագիր, ուղղակի սահուն տեքստ։`
      : `Դու օգնում ես մի պատանու, ով ուզում է ամեն օր խելացի ու տեղեկացված դառնալ։
Թեմա՝ "${topic}"

${sourcesContext}Այս նյութերի հիման վրա գրիր Հայերենով 2-4 կարճ, կոնկրետ ու օգտակար կետ (bullet point), որոնք իրականում նոր բան են սովորեցնում, ոչ թե ընդհանուր խոսք։ Յուրաքանչյուր կետը պիտի լինի 1-2 նախադասություն։ Եթե տեղին է, կետի վերջում կարող ես նշել աղբյուրի [1], [2] և այլն համարանիշը փակագծերում։ Մի գրիր ներածություն կամ եզրափակում, միայն bullet կետերը՝ "•" նշանով սկսած։`;

  try {
    const text = await callGemini(prompt);
    return text || "(չհաջողվեց գեներացնել ամփոփում այս թեմայի համար)";
  } catch (err: any) {
    console.error(`Gemini սխալ (${topic}):`, err?.response?.data || err.message);
    return "(տեխնիկական խնդիր՝ այս թեման այսօր բաց թողնվեց)";
  }
}
