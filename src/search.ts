import axios from "axios";
import { config } from "./config";

export interface SearchResult {
  title: string;
  url: string;
  content: string; // short snippet
}

/**
 * Փնտրում է թարմ նյութեր տրված թեմայի շուրջ Tavily-ի միջոցով։
 * Եթե TAVILY_API_KEY սահմանված չէ, վերադարձնում է դատարկ զանգված
 * (այդ դեպքում Gemini-ն ինքն է գեներացնելու ամփոփումը իր գիտելիքից)։
 */
export async function searchTopic(topic: string): Promise<SearchResult[]> {
  if (!config.tavilyApiKey) {
    return [];
  }

  try {
    const response = await axios.post(
      "https://api.tavily.com/search",
      {
        api_key: config.tavilyApiKey,
        query: `${topic} վերջին նորություններ և հետաքրքիր փաստեր`,
        search_depth: "basic",
        max_results: 4,
        include_answer: false,
        days: 7, // վերջին մեկ շաբաթվա նյութեր, որտեղ հնարավոր է
      },
      { timeout: 20000 }
    );

    const results = (response.data?.results || []) as any[];
    return results.map((r) => ({
      title: r.title || "Անանուն նյութ",
      url: r.url || "",
      content: (r.content || "").slice(0, 800),
    }));
  } catch (err: any) {
    console.error(`Որոնման սխալ (${topic}):`, err?.message || err);
    return [];
  }
}
