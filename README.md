# 📚 Knowledge Bot — Ամենօրյա գիտելիքների Telegram բոտ

Ամեն օր նշված ժամին ուղարկում է digest՝ քո ընտրած ոլորտների (բիզնես, մարքեթինգ, վաճառք,
ձեռնարկատիրություն, պատմություն, ներդրումներ, ընդհանուր գիտելիքներ) վերաբերյալ, հիմնված
իրական համացանցային որոնման վրա (Tavily) + Gemini-ի ամփոփման վրա։

## Ինչպես է աշխատում

Mentora-ն **AI Tutor** է, ոչ միայն նյութեր փնտրող բոտ։ Ինտերակտիվ `/now` հոսքում
յուրաքանչյուր թեմա անցնում է ամբողջական ուսուցման ցիկլով.

**Սովորել → Հասկանալ → Ստուգվել → Feedback → Կրկնել (spaced repetition)**

1. Դու ասում ես ոլորտը (`/now` → գրում ես թեման)
2. Mentora-ն փնտրում է նյութ (Tavily) և ամփոփում Հայերենով (Gemini) — **Սովորել/Հասկանալ**
3. Անմիջապես տալիս է կարճ, բաց հարց՝ ստուգելու իրական հասկացումը — **Ստուգվել**
4. Դու պատասխանում ես ազատ տեքստով, Gemini-ն գնահատում է (ճիշտ/կիսով/սխալ) և տալիս
   ջերմ, բացատրական feedback — **Feedback**
5. Թեմայի «գիտելիքի մակարդակը» պահվում է **Redis-ում** (գիտելիքի քարտեզ)։ Ճիշտ
   պատասխանը մեծացնում է հաջորդ կրկնության ինտերվալը (1→2→4→7→14→30→60 օր), սխալը
   զրոյացնում է այն — դասական spaced repetition տրամաբանություն — **Կրկնել**
6. `/review` ցույց է տալիս, թե որ թեմաներն են արդեն կրկնության ժամանակ ունեն
7. Ամենօրյա ավտոմատ digest-ը նույնպես ցույց է տալիս կրկնության ենթակա թեմաների
   ցանկը՝ որպես հիշեցում, նախքան նոր նյութեր ուղարկելը

Յուրաքանչյուր օգտատեր ունի իր սեփական «գիտելիքի քարտեզը» (topic → մակարդակ,
վերջին կրկնության արդյունք, հաջորդ կրկնության ամսաթիվ)՝ պահված Render Key-Value-ում։

Եթե Tavily-ի բանալի չկա, բոտը դեռ աշխատում է, պարզապես ամփոփումները հիմնվում են
Gemini-ի սեփական գիտելիքի վրա (առանց իրական հղումների)։

## 1. Տեղական պատրաստում

### 1.1 Ստեղծիր Telegram բոտ
1. Telegram-ում գրիր [@BotFather](https://t.me/BotFather)-ին
2. `/newbot` → հետևիր հրահանգներին → կստանաս **TELEGRAM_BOT_TOKEN**

### 1.2 Ստացիր Tavily API բանալի (ազատընտրովի, բայց խորհուրդ է տրվում)
1. Գնա [tavily.com](https://tavily.com) → գրանցվիր (անվճար tier՝ ամսական 1000 որոնում)
2. Պատճենիր **TAVILY_API_KEY**

### 1.3 Env փոփոխականներ
Պատճենիր `.env.example`-ը որպես `.env` և լրացրու.
```
TELEGRAM_BOT_TOKEN=<քո bot token-ը>
GEMINI_API_KEY=<քո Gemini բանալին>
TAVILY_API_KEY=<քո Tavily բանալին>
```

### 1.4 Գործարկում
```bash
npm install
npm run dev
```
Հետո Telegram-ում գտիր քո բոտը և գրիր `/start`։ Chat ID-ն ավտոմատ կպահվի։

## 2. Ենթակառուցվածք

Render-ի cron job resource-ը հասանելի է միայն վճարովի plan-ներում, ուստի deploy-ը
կառուցված է ամբողջությամբ **անվճար** ենթակառուցվածքով.

1. **Render Web Service** (free) — մշակում է interactive հրամանները (`/start`, `/now`,
   `/review`, `/settopics`) webhook-ով, և ունի պաշտպանված `/trigger-digest` endpoint
2. **GitHub Actions scheduled workflow** (`.github/workflows/daily-digest.yml`) — ամեն օր,
   նշված ժամին, ուղարկում է POST հարցում `/trigger-digest`-ին
3. **Render Key-Value** (Redis, free) — պահում է ընդհանուր state (chat ID, ոլորտներ,
   գիտելիքի քարտեզ)

## 3. Deploy Render-ում (անվճար)

1. Render dashboard-ում՝ **New → Web Service** → կապակցրու `surenBuilds/mentora` repo-ն
2. Build Command՝ `npm install && npm run build`   Start Command՝ `npm start`
3. Ավելացրու Environment Variables. `TELEGRAM_BOT_TOKEN`, `GEMINI_API_KEY`, `TAVILY_API_KEY`,
   `DEFAULT_TOPICS`, `REDIS_URL` (Key-Value instance-ի internal connection string), և
   `TRIGGER_SECRET` (ցանկացած պատահական տող՝ /trigger-digest endpoint-ը պաշտպանելու համար)
4. Deploy-ից հետո կստանաս հրապարակային URL (օր. `https://mentora-xxxx.onrender.com`)

## 4. Ամենօրյա ուղարկումը (GitHub Actions, անվճար)

1. GitHub repo-ում՝ **Settings → Secrets and variables → Actions → New repository secret**
2. Ավելացրու երկու secret. `RENDER_URL` (նախորդ քայլից ստացված URL-ը, առանց վերջում `/`) և
   `TRIGGER_SECRET` (նույնը, ինչ Render-ում սահմանեցիր)
3. `.github/workflows/daily-digest.yml`-ը արդեն կարգավորված է ամեն օր 09:00 Երևանի
   ժամանակով (05:00 UTC) կանչելու `/trigger-digest`-ը։ Ժամը փոխելու համար խմբագրիր
   `cron:` տողը (հիշիր՝ UTC է, ոչ թե Երևանի ժամանակ)

## 5. Render Key-Value store

Ստեղծիր **New → Key Value** (free plan, persistence՝ off, քանի որ free tier-ը
persistence չի աջակցում)։ Copy արա internal connection string-ը որպես `REDIS_URL`
env variable Web Service-ում։ Առանց դրա բոտը դեռ կաշխատի, բայց `/settopics`-ով
արած փոփոխությունները, chat ID-ն և գիտելիքի քարտեզը չեն պահպանվի service-ի
restart-ից հետո։

## 6. Telegram հրամաններ

| Հրաման | Ինչ է անում |
|---|---|
| `/start` | Գրանցում է քո chat-ը և ցույց տալիս ընթացիկ կարգավորումները |
| `/now` | Սկսում է ուսուցման ցիկլը մեկ կոնկրետ թեմայի համար (հարցնում է ոլորտը) |
| `/review` | Ցույց է տալիս, թե որ թեմաներն են արդեն կրկնության ժամանակ ունեն |
| `/stop` | Ընդհատում է ընթացիկ ուսուցման հոսքը |
| `/topics` | Ցույց է տալիս ամենօրյա digest-ի ոլորտները |
| `/settopics ոլորտ1, ոլորտ2, ...` | Փոխում է ամենօրյա digest-ի ոլորտները |
| `/settime` | Բացատրում է, թե ինչպես փոխել ուղարկման ժամը (GitHub Actions workflow-ի cron-ով) |

## 7. Հաջորդ քայլեր (ազատընտրովի)

- **Ավելի շատ աղբյուրներ**՝ կարելի է ավելացնել RSS feed-ներ (օր. HBR, TechCrunch) `search.ts`-ում։
- **Multi-user**՝ ներկայումս մեկ chat-ի համար է. easy է ընդլայնել Supabase-ով (ինչպես Voxline-ում)՝ մի քանի օգտատերերի աջակցելու համար։
- **Ուսուցման ոճեր**՝ կարելի է հարմարեցնել բացատրության ոճը թեմայի տեսակին (փաստացի vs հայեցակարգային) և օգտատիրոջ մակարդակին ըստ knowledgeMap-ի history-ի։
- **Ամբողջական quiz-ներ digest-ում**՝ inline կոճակներով (👍/👎) ուղղակի digest հաղորդագրության մեջ, ոչ միայն /now հոսքում։
