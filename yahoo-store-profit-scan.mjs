#!/usr/bin/env node

/**
 * Yahoo Shopping store scraper (HTML only, no Yahoo API)
 * -> extracts price/point/effective price/JAN
 * -> searches kaitorishouten-co.jp via Playwright browser automation
 * -> computes profit candidates
 */

// 除外キーワード（デフォルト）
const DEFAULT_EXCLUDE_KEYWORDS = [
  "中古", "ジャンク", "訳あり", "展示品", "箱破損", "保証開始",
  "難あり", "傷あり", "返品不可", "アウトレット", "開封済",
];

const DEFAULTS = {
  pages: 1,
  maxItems: 30,
  concurrency: 2,
  minProfit: 0,
  basePointRate: 0.07,      // ストア1% + LINE連携3% + LYP2% + PayPay1%
  maxBaseProfitRate: 0.25,  // 25%超は誤マッチとして除外
  minPrice: 5000,
  maxPrice: 150000,
  priorityMinPrice: 10000,
  priorityMaxPrice: 80000,
  minInventory: 10,
  keywordsFile: "編集可_keywords.txt",
  storesFile: "編集可_stores.txt",
  pointSource: "total",
  timeoutMs: 30000,
  delayMinMs: 1000,
  delayMaxMs: 3000,
  cacheFile: "kaitori_price_cache.json",
  cacheTtlDays: 10,
  noCache: false,
};

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--append-keywords-file") {
      args.appendKeywordsFile = next;
      i += 1;
    } else if (arg === "--stores-file") {
      args.storesFile = next;
      i += 1;
    } else if (arg === "--keywords-file") {
      args.keywordsFile = next;
      i += 1;
    } else if (arg === "--exclude-keyword") {
      if (!args.excludeKeywords) args.excludeKeywords = [];
      args.excludeKeywords.push(next ?? "");
      i += 1;
    } else if (arg === "--exclude-keywords-file") {
      args.excludeKeywordsFile = next;
      i += 1;
    } else if (arg === "--no-default-excludes") {
      args.noDefaultExcludes = true;
    } else if (arg === "--pages") {
      args.pages = Number(next);
      i += 1;
    } else if (arg === "--max-items") {
      args.maxItems = Number(next);
      i += 1;
    } else if (arg === "--concurrency") {
      args.concurrency = Number(next);
      i += 1;
    } else if (arg === "--min-profit") {
      args.minProfit = Number(next);
      i += 1;
    } else if (arg === "--min-price") {
      args.minPrice = Number(next);
      i += 1;
    } else if (arg === "--max-price") {
      args.maxPrice = Number(next);
      i += 1;
    } else if (arg === "--priority-min-price") {
      args.priorityMinPrice = Number(next);
      i += 1;
    } else if (arg === "--priority-max-price") {
      args.priorityMaxPrice = Number(next);
      i += 1;
    } else if (arg === "--min-inventory") {
      args.minInventory = Number(next);
      i += 1;
    } else if (arg === "--json") {
      args.jsonPath = next;
      i += 1;
    } else if (arg === "--storage-state") {
      args.storageState = next;
      i += 1;
    } else if (arg === "--point-source") {
      args.pointSource = next;
      i += 1;
    } else if (arg === "--delay-min") {
      args.delayMinMs = Number(next);
      i += 1;
    } else if (arg === "--delay-max") {
      args.delayMaxMs = Number(next);
      i += 1;
    } else if (arg === "--cache-file") {
      args.cacheFile = next;
      i += 1;
    } else if (arg === "--cache-ttl-days") {
      args.cacheTtlDays = Number(next);
      i += 1;
    } else if (arg === "--no-cache") {
      args.noCache = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    }
  }
  return args;
}

function printHelp() {
  console.log(`Usage:
  node yahoo-store-profit-scan.mjs [options]

Options:
  --stores-file <path>           店舗ファイル（デフォルト: 編集可_stores.txt）
  --keywords-file <path>         キーワードファイル（デフォルト: 編集可_keywords.txt）
  --append-keywords-file <path>  利益商品のキーワードをファイルに自動追記（重複スキップ）
  --pages <n>            Number of search pages to crawl (default: 1)
  --max-items <n>        Max item detail pages to inspect (default: 30)
  --concurrency <n>      並列取得数 (デフォルト: 2)
  --delay-min <ms>       リクエスト間の最小待機時間ミリ秒 (デフォルト: 1000)
  --delay-max <ms>       リクエスト間の最大待機時間ミリ秒 (デフォルト: 3000)
  --exclude-keyword <text>       除外キーワード追加（複数指定可）
  --exclude-keywords-file <path> 除外キーワードをファイルから読み込む
  --no-default-excludes          デフォルト除外キーワードを無効化
  --point-source <total|with-entry>
                         total=point.totalPoint, with-entry=point.totalPointWithEntry
  --min-price <yen>            価格下限（デフォルト: 5000）未満は完全除外
  --max-price <yen>            価格上限（デフォルト: 150000）超えは完全除外
  --priority-min-price <yen>  優先スキャン価格帯の下限（デフォルト: 10000）
  --priority-max-price <yen>  優先スキャン価格帯の上限（デフォルト: 80000）
  --min-inventory <n>          在庫数がこの個数未満の商品をスキップ（デフォルト: 10）
  --min-profit <yen>     最低利益フィルタ (デフォルト: 0)
  --storage-state <path> Playwright storageState JSON (Yahoo ログイン済みセッション)
  --json <path>          結果をJSONファイルに出力
  --cache-file <path>    買取価格キャッシュファイルパス（デフォルト: kaitori_price_cache.json）
  --cache-ttl-days <n>   キャッシュ有効期間・日数（デフォルト: 7）
  --no-cache             キャッシュを使用しない
  --help                 このヘルプを表示
`);
}

function ensureValidArgs(args) {
  if (!args.stores || args.stores.length === 0) {
    throw new Error("--store が必要です（複数指定可）");
  }
  if (!Number.isFinite(args.pages) || args.pages < 1) {
    throw new Error("--pages must be >= 1");
  }
  if (!Number.isFinite(args.maxItems) || args.maxItems < 1) {
    throw new Error("--max-items must be >= 1");
  }
  if (!Number.isFinite(args.concurrency) || args.concurrency < 1) {
    throw new Error("--concurrency must be >= 1");
  }
  if (!["total", "with-entry"].includes(args.pointSource)) {
    throw new Error("--point-source must be one of: total, with-entry");
  }
  if (!Number.isFinite(args.delayMinMs) || args.delayMinMs < 0) {
    throw new Error("--delay-min must be >= 0");
  }
  if (!Number.isFinite(args.delayMaxMs) || args.delayMaxMs < args.delayMinMs) {
    throw new Error("--delay-max must be >= --delay-min");
  }
}

// Ban回避: ランダム遅延
function randomDelay(minMs, maxMs) {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  console.log(`  [待機] ${ms}ms`);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// 3段階ステルス: UA・ヘッダー・Playwright偽装
// ---------------------------------------------------------------------------

// デスクトップ・モバイル混在の多様なUAリスト
const USER_AGENTS = [
  // Windows Chrome
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  // Mac Chrome
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  // Mac Safari
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
  // Windows Firefox
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
  // iPhone Safari
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1",
  // Android Chrome
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36",
];

// UAに応じた自然なプラットフォーム情報を返す
function getUAProfile(ua) {
  if (/iPhone/.test(ua))
    return { platform: "iPhone", viewport: { width: 390, height: 844 } };
  if (/Android/.test(ua))
    return { platform: "Linux armv8l", viewport: { width: 412, height: 915 } };
  if (/Macintosh/.test(ua))
    return { platform: "MacIntel", viewport: { width: 1440 + Math.floor(Math.random() * 160), height: 900 + Math.floor(Math.random() * 100) } };
  // Windows
  return { platform: "Win32", viewport: { width: 1920, height: 1080 } };
}

function randomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// 「トップページから検索した」ように見せる人間らしいヘッダーセット
function buildKaitoriHeaders(ua) {
  const isMobile = /iPhone|Android/.test(ua);
  return {
    "User-Agent": ua,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer": "https://www.kaitorishouten-co.jp/",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-User": "?1",
    ...(isMobile ? {} : { "Sec-CH-UA-Mobile": "?0" }),
  };
}

function normalizeYen(value) {
  if (value == null) return null;
  const n = String(value).replace(/[^\d.-]/g, "");
  if (!n) return null;
  const num = Number(n);
  return Number.isFinite(num) ? num : null;
}

async function fetchText(url, timeoutMs = DEFAULTS.timeoutMs) {
  const RETRY_DELAYS = [5000, 15000, 45000];

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "GET",
        signal: ctrl.signal,
        headers: {
          "User-Agent": randomUserAgent(),
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
          "Accept-Encoding": "gzip, deflate, br",
          "Referer": "https://shopping.yahoo.co.jp/",
          "Cache-Control": "no-cache",
        },
      });

      if (res.status === 429 || res.status === 503) {
        if (attempt < RETRY_DELAYS.length) {
          const wait = RETRY_DELAYS[attempt];
          console.warn(`  [リトライ] HTTP ${res.status} → ${wait / 1000}秒待機後に再試行 (${attempt + 1}/${RETRY_DELAYS.length})`);
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        throw new Error(`HTTP ${res.status} for ${url} (リトライ上限)`);
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      return await res.text();
    } finally {
      clearTimeout(timer);
    }
  }
}

// ---------------------------------------------------------------------------
// Yahoo HTTP client (unchanged from original)
// ---------------------------------------------------------------------------

async function createYahooClient(args) {
  if (!args.storageState) {
    return {
      fetchText: (url, timeoutMs) => fetchText(url, timeoutMs),
      close: async () => {},
      mode: "default-fetch",
    };
  }

  let request;
  try {
    ({ request } = await import("playwright"));
  } catch {
    throw new Error(
      "playwright is required when --storage-state is used. Run: pnpm add -D playwright",
    );
  }

  const ctx = await request.newContext({
    storageState: args.storageState,
    extraHTTPHeaders: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
    ignoreHTTPSErrors: true,
  });

  return {
    mode: "playwright-storage-state",
    fetchText: async (url, timeoutMs = DEFAULTS.timeoutMs) => {
      const res = await ctx.get(url, { timeout: timeoutMs });
      if (!res.ok()) {
        throw new Error(`HTTP ${res.status()} for ${url}`);
      }
      return await res.text();
    },
    close: async () => {
      await ctx.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// Yahoo scraping helpers
// ---------------------------------------------------------------------------

function extractYahooItemUrls(searchHtml, storeId) {
  const absRe = new RegExp(
    `https://store\\.shopping\\.yahoo\\.co\\.jp/${storeId}/[^"'\\s<>]+\\.html`,
    "g",
  );
  const relRe = new RegExp(`href=["'](/${storeId}/[^"'#?\\s<>]+\\.html)`, "g");

  const urls = new Set();
  for (const m of searchHtml.matchAll(absRe)) {
    urls.add(m[0]);
  }
  for (const m of searchHtml.matchAll(relRe)) {
    urls.add(`https://store.shopping.yahoo.co.jp${m[1]}`);
  }

  const blocked = new Set(["guide.html", "info.html", "review.html"]);
  return [...urls].filter((u) => ![...blocked].some((x) => u.includes(x)));
}

/**
 * 検索一覧HTMLから {url, listingPrice} の配列を返す。
 * __NEXT_DATA__ から価格を取得し、取得できない場合は price=null で返す。
 */
function extractYahooItemsFromSearch(searchHtml, storeId) {
  const urls = extractYahooItemUrls(searchHtml, storeId);
  const priceMap = new Map(); // url -> price

  // __NEXT_DATA__ から検索結果アイテムリストを探す
  const m = searchHtml.match(
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (m) {
    try {
      const root = JSON.parse(m[1]);
      // 新構造: props.initialState.bff.searchResults.items（2025年以降）
      const bffItems = root?.props?.initialState?.bff?.searchResults?.items;
      if (bffItems && typeof bffItems === "object") {
        for (const pageArr of Object.values(bffItems)) {
          if (!Array.isArray(pageArr)) continue;
          const resultEntry = pageArr.find((e) => e?.type === "RESULT");
          const items = resultEntry?.content?.items;
          if (!Array.isArray(items) || items.length === 0) continue;
          for (const item of items) {
            const itemUrl = typeof item.url === "string" ? item.url.split("?")[0] : null;
            const price = item.price ?? null;
            if (itemUrl && price != null) {
              priceMap.set(itemUrl, Number(price));
            }
          }
          if (priceMap.size > 0) break;
        }
      }

      // 旧構造フォールバック: props.pageProps 以下の各パス候補
      if (priceMap.size === 0) {
        const candidates = [
          root?.props?.pageProps?.initialState?.SearchResult?.items,
          root?.props?.pageProps?.searchResult?.items,
          root?.props?.pageProps?.items,
        ];
        for (const items of candidates) {
          if (!Array.isArray(items)) continue;
          for (const item of items) {
            const url =
              item.url ||
              item.itemUrl ||
              item.pageUrl ||
              (item.storeId && item.code
                ? `https://store.shopping.yahoo.co.jp/${item.storeId}/${item.code}.html`
                : null);
            const price =
              item.price ??
              item.applicablePrice ??
              item.regularPrice ??
              item.sellPrice ??
              null;
            if (url && price != null) {
              priceMap.set(url.split("?")[0], Number(price));
            }
          }
          if (priceMap.size > 0) break;
        }
      }
    } catch {
      // パース失敗時は price=null のまま継続
    }
  }

  // __NEXT_DATA__ で取得できなかった場合、正規表現で価格をURLの近傍から推定
  if (priceMap.size === 0) {
    // URLの前後500文字以内に現れる最初の「数字+円」パターンを価格とみなす
    const priceRe = /(\d[\d,]+)(?:円|&yen;)/g;
    for (const url of urls) {
      const code = url.replace(/.*\//, "").replace(".html", "");
      const idx = searchHtml.indexOf(code);
      if (idx === -1) continue;
      const snippet = searchHtml.slice(Math.max(0, idx - 100), idx + 500);
      const pm = snippet.match(priceRe);
      if (pm) {
        const price = Number(pm[0].replace(/[^\d]/g, ""));
        if (price > 0) priceMap.set(url, price);
      }
    }
  }

  // 一覧HTMLから「残りあと○個」パターンで在庫数を抽出
  const inventoryMap = new Map(); // url -> inventory count
  for (const url of urls) {
    const code = url.replace(/.*\//, "").replace(".html", "");
    const idx = searchHtml.indexOf(code);
    if (idx === -1) continue;
    const snippet = searchHtml.slice(Math.max(0, idx - 50), idx + 600);
    const m = snippet.match(/残りあと(\d+)個/);
    if (m) inventoryMap.set(url, Number(m[1]));
  }

  return urls.map((url) => ({
    url,
    listingPrice: priceMap.get(url) ?? priceMap.get(url.split("?")[0]) ?? null,
    listingInventory: inventoryMap.get(url) ?? null,
  }));
}

function parseNextDataFromYahooItem(html) {
  const m = html.match(
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (!m) return null;

  let root;
  try {
    root = JSON.parse(m[1]);
  } catch {
    return null;
  }

  const pp = root?.props?.pageProps;
  if (!pp || typeof pp !== "object") return null;

  const item = pp.item || {};
  const point = pp.point || {};

  const price =
    item.applicablePrice ?? item.regularPrice ?? item?.priceTable?.oneLayersPrice?.price ?? null;
  const totalPoint = point.totalPoint ?? 0;
  const totalPointWithEntry = point.totalPointWithEntry ?? totalPoint;
  const janRaw = item.janCode;
  const jan = janRaw != null ? String(janRaw).replace(/\D/g, "") : null;

  const inventory =
    item.inventory ?? item.stock ?? item.stockCount ?? item.quantity ?? null;

  return {
    title: item.name || null,
    jan: jan || null,
    price: normalizeYen(price),
    point: normalizeYen(totalPoint) ?? 0,
    pointWithEntry: normalizeYen(totalPointWithEntry) ?? normalizeYen(totalPoint) ?? 0,
    modelHint: extractModelHint(item.name || ""),
    inventory: inventory != null ? Number(inventory) : null,
  };
}

function extractModelHint(title) {
  if (!title) return "";
  const parts = title
    .replace(/[【】\[\]（）()]/g, " ")
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const candidate = parts.find((p) => /[A-Za-z].*\d|\d.*[A-Za-z]/.test(p) && p.length >= 5);
  return candidate || parts.slice(0, 3).join(" ");
}

// ---------------------------------------------------------------------------
// 買取商店 Playwright browser automation
// ---------------------------------------------------------------------------

let _kaitoriBrowser = null;

async function initKaitoriBrowser() {
  if (_kaitoriBrowser) return;

  // playwright-extra + stealth でボット検知を回避
  let chromium;
  try {
    const { chromium: playwrightExtra } = await import("playwright-extra");
    const StealthPlugin = (await import("puppeteer-extra-plugin-stealth")).default;
    playwrightExtra.use(StealthPlugin());
    chromium = playwrightExtra;
  } catch {
    // playwright-extra が使えない場合は通常のplaywrightにフォールバック
    try {
      ({ chromium } = await import("playwright"));
      console.warn("  [警告] playwright-extra が見つかりません。通常モードで起動します。");
    } catch {
      throw new Error(
        "playwright is required for 買取商店 search. Run: npm install playwright playwright-extra puppeteer-extra-plugin-stealth",
      );
    }
  }

  // headless:true をそのまま使うと navigator.webdriver=true が残る場合があるため
  // stealth プラグインで上書き済み。追加で --disable-blink-features を指定して消去。
  _kaitoriBrowser = await chromium.launch({
    headless: true,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-dev-shm-usage",
    ],
  });
  // コンテキストはリクエストごとに生成するため、ここでは初期化しない
}

async function closeKaitoriBrowser() {
  if (_kaitoriBrowser) {
    await _kaitoriBrowser.close();
    _kaitoriBrowser = null;
  }
}


/**
 * 買取商店でクエリ（JANコードまたは商品名）を検索し、
 * 商品リストを返す。各ページに独立したPageを使うので並列安全。
 */
async function searchKaitorishouten(query, timeoutMs) {
  await initKaitoriBrowser();

  // リクエストごとにUAプロファイルを選び直して新規コンテキストを生成
  const ua = randomUserAgent();
  const { platform, viewport } = getUAProfile(ua);
  const ctx = await _kaitoriBrowser.newContext({
    userAgent: ua,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    platform,
    viewport,
    extraHTTPHeaders: buildKaitoriHeaders(ua),
    // navigator.webdriver を消す追加設定
    javaScriptEnabled: true,
  });

  // navigator.webdriver / window.chrome などの指紋を JS で上書き
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3] });
    Object.defineProperty(navigator, "languages", { get: () => ["ja-JP", "ja", "en-US"] });
    window.chrome = { runtime: {} };
  });

  const page = await ctx.newPage();

  try {
    await page.goto("https://www.kaitorishouten-co.jp/", {
      timeout: timeoutMs,
      waitUntil: "domcontentloaded",
    });

    // 検索inputを探す（複数セレクタを試みる）
    const searchInput = page.locator(
      [
        'input[type="search"]',
        'input[name="name"]',
        'input[name="keyword"]',
        'input[name="q"]',
        'input[placeholder*="検索"]',
        'input[placeholder*="search"]',
        ".search-box input",
        ".header-search input",
        "form input[type='text']",
      ].join(", "),
    ).first();

    await searchInput.waitFor({ timeout: 10000 });
    await searchInput.fill(query);

    // Enterキー or 検索ボタンでsubmit
    await Promise.race([
      searchInput.press("Enter"),
      page
        .locator('button[type="submit"], input[type="submit"], .search-btn')
        .first()
        .click()
        .catch(() => {}),
    ]);

    // 検索結果の行が出るまで待機（URLは変わらないのでselectorで待つ）
    await page
      .waitForSelector("tr.price_list_item", { timeout: timeoutMs })
      .catch(() => {});

    // ブラウザ内でDOM解析 + calc_cartitem APIで価格取得
    const products = await page.evaluate(async () => {
      const rows = document.querySelectorAll("tr.price_list_item");
      const results = [];

      for (const row of rows) {
        const tds = row.querySelectorAll("td");
        if (tds.length < 2) continue;

        // 商品名（2番目のtdの最初のテキストノード）
        const nameTd = tds[1];
        const nameNode = [...nameTd.childNodes].find(
          (n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim(),
        );
        const name = nameNode?.textContent?.trim() || nameTd.innerText?.split("\n")[0]?.trim() || "";

        // JANコード（product-code-default の2番目のspan）
        const codeSpans = nameTd.querySelectorAll(".product-code-default");
        let jan = null;
        for (const sp of codeSpans) {
          const t = sp.textContent.trim();
          if (/^\d{8,14}$/.test(t)) {
            jan = t;
            break;
          }
        }

        // calc_cartitem APIで価格取得（CSRFトークンをHTMLから読んでPOST）
        const calcUrl   = row.querySelector("[data-calc-url]")?.dataset?.calcUrl;
        const token     = row.querySelector("input[name='_token']")?.value;
        const productId = row.querySelector("input[name='product_id']")?.value;
        const classId   = row.querySelector("input[name='ProductClass']")?.value;

        let price = null;
        if (calcUrl && token) {
          try {
            const body = new URLSearchParams({
              quantity: 1,
              product_id: productId,
              ProductClass: classId,
              _token: token,
            });
            const res = await fetch(calcUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "X-Requested-With": "XMLHttpRequest",
              },
              body: body.toString(),
            });
            if (res.ok) {
              const json = await res.json();
              if (json?.done && json?.price != null) {
                price = Number(json.price);
              }
            }
          } catch {
            // price remains null
          }
        }

        // 商品URL（申込みボタンのdata-url）
        const btn = row.querySelector("button.add-product[data-url]");
        const url = btn?.dataset?.url || null;

        if (name || jan) {
          results.push({ name, jan, price, url });
        }
      }

      return results;
    });

    return products;
  } finally {
    await page.close();
    await ctx.close();
  }
}

// JANで検索→0件ならmodelHint（型番候補）の順に試みる
function buildKaitoriQueries(yahooItem) {
  const queries = [];
  if (yahooItem.jan) queries.push(yahooItem.jan);
  if (yahooItem.modelHint) queries.push(yahooItem.modelHint);
  return queries.length ? queries : [""];
}

function pickKaitorishoutenBest(products, yahooItem) {
  if (!products.length) return null;

  const withPrice = products.filter((p) => p.price != null);
  if (!withPrice.length) return null;

  // 1. JANが完全一致するものを優先
  if (yahooItem.jan) {
    const exact = withPrice.filter((p) => p.jan === yahooItem.jan);
    if (exact.length) {
      return exact.sort((a, b) => b.price - a.price)[0];
    }
  }

  // 2. モデルヒントが商品名に含まれるものを優先
  const hint = (yahooItem.modelHint || "").toLowerCase();
  if (hint) {
    const hinted = withPrice.filter((p) => p.name.toLowerCase().includes(hint));
    if (hinted.length) {
      return hinted.sort((a, b) => b.price - a.price)[0];
    }
  }

  // 3. フォールバック: 最高買取価格
  return withPrice.sort((a, b) => b.price - a.price)[0];
}

// ---------------------------------------------------------------------------
// Concurrency pool
// ---------------------------------------------------------------------------

async function runPool(items, concurrency, worker) {
  const out = [];
  let idx = 0;

  async function loop() {
    while (idx < items.length) {
      const myIdx = idx;
      idx += 1;
      try {
        out[myIdx] = await worker(items[myIdx], myIdx);
      } catch (err) {
        out[myIdx] = { error: err?.message || String(err) };
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => loop());
  await Promise.all(workers);
  return out;
}

// ---------------------------------------------------------------------------
// 買取価格キャッシュ
// ---------------------------------------------------------------------------

async function loadKaitoriCache(filePath) {
  const fs = await import("node:fs/promises");
  try {
    const text = await fs.readFile(filePath, "utf8");
    return new Map(Object.entries(JSON.parse(text)));
  } catch {
    return new Map(); // ファイルなし or JSON破損 → 空Map
  }
}

async function saveKaitoriCache(filePath, cache) {
  const fs = await import("node:fs/promises");
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(Object.fromEntries(cache), null, 2), "utf8");
  await fs.rename(tmp, filePath);
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// キーワードファイル管理
// ---------------------------------------------------------------------------

/**
 * キーワードファイルを行単位でパースし、構造を保持したオブジェクト配列を返す。
 *
 * 行フォーマット:
 *   keyword #YYYY-MM-DD miss:N          ← アクティブ（日付・連続ミス数あり）
 *   keyword, 25000 #YYYY-MM-DD miss:N   ← アクティブ（期待価格あり）
 *   keyword                             ← アクティブ（日付なし）
 *   # keyword #YYYY-MM-DD miss:N        ← コメントアウト済み
 *   # 見出しコメント                    ← 純粋なコメント or 空行
 */

/**
 * キーワード行の本文部分をパースして { keyword, jan, expectedPrice } を返す。
 * フォーマット例:
 *   "WF-1000XM5"                          → keyword のみ
 *   "WF-1000XM5, 26000"                   → keyword + 期待価格
 *   "WF-1000XM5, 4548736143548, 26000"    → keyword + JAN + 期待価格
 *   "WF-1000XM5, 4548736143548"           → keyword + JAN のみ
 * JAN判定: 8桁または12〜13桁の数字。それ以外の数字は期待価格として扱う。
 */
function parseKeywordAndExpectedPrice(raw) {
  const parts = raw.split(",").map((s) => s.trim());
  const keyword = parts[0];
  let jan = null;
  let expectedPrice = null;
  for (const part of parts.slice(1)) {
    if (/^\d{8}$|^\d{12,13}$/.test(part)) {
      jan = part;
    } else if (/^\d+$/.test(part)) {
      expectedPrice = Number(part);
    }
  }
  // キーワード自体がJANコードの場合（例: "4548736132566, 32400"）
  if (jan == null && /^\d{8}$|^\d{12,13}$/.test(keyword)) {
    jan = keyword;
  }
  return { keyword, jan, expectedPrice };
}

function parseKeywordsFileFull(text) {
  // "keyword #YYYY-MM-DD miss:N" の末尾パターン
  const META_RE = /^(.+?)\s+#(\d{4}-\d{2}-\d{2})(?:\s+miss:(\d+))?\s*$/;

  return text.split(/\r?\n/).map((original) => {
    const trimmed = original.trim();
    if (!trimmed) return { type: "comment", original };

    // コメントアウト済みキーワード: "# keyword #YYYY-MM-DD [miss:N]"
    if (trimmed.startsWith("#")) {
      const body = trimmed.slice(1).trim();
      const m = body.match(META_RE);
      if (m) {
        const { keyword, jan, expectedPrice } = parseKeywordAndExpectedPrice(m[1]);
        return { type: "commented_keyword", keyword, jan, expectedPrice, date: m[2], miss: Number(m[3] ?? 0), original };
      }
      return { type: "comment", original };
    }

    // アクティブキーワード（日付あり）
    const m = trimmed.match(META_RE);
    if (m) {
      const { keyword, jan, expectedPrice } = parseKeywordAndExpectedPrice(m[1]);
      return { type: "keyword", keyword, jan, expectedPrice, date: m[2], miss: Number(m[3] ?? 0), original };
    }

    // アクティブキーワード（日付なし）
    const { keyword, jan, expectedPrice } = parseKeywordAndExpectedPrice(trimmed);
    return { type: "keyword", keyword, jan, expectedPrice, date: null, miss: 0, original };
  });
}

/**
 * スキャン結果をもとにキーワードファイルを書き直す。
 *
 * ルール:
 *   - 利益あり → 日付を今日に更新、missを0にリセット
 *   - 利益なし → miss+1。以下どちらかを満たせば自動コメントアウト:
 *       a) miss が 10 以上（10回連続ミス）
 *       b) 日付が 180日以上前
 *   - コメントアウト済みは変更しない（復帰なし）
 */
async function rewriteKeywordsFile(filePath, parsedLines, profitableKeywords, scannedKeywords, today) {
  const STALE_MS   = 180 * 24 * 60 * 60 * 1000;
  const MAX_MISS   = 10;
  const todayMs    = new Date(today).getTime();

  const newLines = parsedLines.map((entry) => {
    if (entry.type !== "keyword") return entry.original; // comment / commented_keyword はそのまま

    // "keyword", "keyword, JAN", "keyword, expectedPrice", "keyword, JAN, expectedPrice" を復元
    const keywordPart = [
      entry.keyword,
      entry.jan ?? null,
      entry.expectedPrice != null ? String(entry.expectedPrice) : null,
    ].filter((v) => v != null).join(", ");

    if (profitableKeywords.has(entry.keyword)) {
      // 利益あり: 日付更新・miss リセット
      return `${keywordPart} #${today} miss:0`;
    }

    // max-items の切り捨てでスキャン未実施のキーワードは miss を変えない
    if (!scannedKeywords.has(entry.keyword)) return entry.original;

    // 利益なし: miss をインクリメント
    const newMiss = entry.miss + 1;
    const staleByDate = entry.date && (todayMs - new Date(entry.date).getTime() >= STALE_MS);
    const staleByMiss = newMiss >= MAX_MISS;

    if (staleByDate || staleByMiss) {
      const reason = staleByMiss ? `連続${newMiss}回ミス` : `最終利益: ${entry.date}`;
      console.log(`  [自動コメントアウト] ${entry.keyword} (${reason})`);
      const datePart = ` #${entry.date ?? today}`;
      return `# ${keywordPart}${datePart} miss:${newMiss}`;
    }

    const datePart = ` #${entry.date ?? today}`;
    return `${keywordPart}${datePart} miss:${newMiss}`;
  });

  const fs = await import("node:fs/promises");
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, newLines.join("\n"), "utf8");
  await fs.rename(tmp, filePath);
  console.log(`\nキーワードファイル更新: ${filePath}`);
}

function buildStoreSearchUrl(storeId, keyword, page) {
  const q = new URLSearchParams();
  q.set("p", keyword || "");
  q.set("in_stock", "1");
  if (page > 1) q.set("page", String(page));
  return `https://store.shopping.yahoo.co.jp/${storeId}/search.html?${q.toString()}`;
}

function formatYen(n) {
  if (n == null || !Number.isFinite(n)) return "-";
  return `${Math.round(n).toLocaleString("ja-JP")}円`;
}

function printResultTable(results) {
  if (!results.length) {
    console.log("\n利益が出る候補は見つかりませんでした。");
    return;
  }

  const SEP = "\t";
  const header = ["No", "利益率", "現金利益", "最大利益", "Yahoo価格", "買取価格", "JAN", "商品名", "URL"];
  console.log(`\n${header.join(SEP)}`);

  results.forEach((r, i) => {
    const rateStr = r.baseProfitRate != null
      ? `${(r.baseProfitRate * 100).toFixed(1)}%`
      : "-";
    const line = [
      String(i + 1),
      rateStr,
      formatYen(r.baseProfit),
      formatYen(r.profitWithEntry),
      formatYen(r.yahooPrice),
      formatYen(r.kaitoriPrice),
      r.jan || "-",
      (r.title || "").replace(/\t/g, " ").slice(0, 60),
      r.itemUrl || "-",
    ];
    console.log(line.join(SEP));
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }
  // 店舗ファイルの読み込み（ensureValidArgs より先に実行）
  if (args.storesFile) {
    const fs = await import("node:fs/promises");
    const text = await fs.readFile(args.storesFile, "utf8");
    const fileStores = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
    if (!args.stores) args.stores = [];
    args.stores.push(...fileStores);
    console.log(`店舗ファイル読み込み: ${args.storesFile} (${fileStores.length}件)`);
  }

  ensureValidArgs(args);

  // 除外キーワードの構築
  {
    const excludes = args.noDefaultExcludes ? [] : [...DEFAULT_EXCLUDE_KEYWORDS];
    if (args.excludeKeywords) excludes.push(...args.excludeKeywords);
    if (args.excludeKeywordsFile) {
      const fs = await import("node:fs/promises");
      const text = await fs.readFile(args.excludeKeywordsFile, "utf8");
      const fileExcludes = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"));
      excludes.push(...fileExcludes);
      console.log(`除外キーワードファイル読み込み: ${args.excludeKeywordsFile} (${fileExcludes.length}件)`);
    }
    args.excludeKeywords = [...new Set(excludes)];
  }

  // キーワードファイルの読み込み（アクティブのみ検索対象）
  let keywordsParsedLines = null;
  if (args.keywordsFile) {
    const fs = await import("node:fs/promises");
    const text = await fs.readFile(args.keywordsFile, "utf8");
    keywordsParsedLines = parseKeywordsFileFull(text);
    const activeEntries = keywordsParsedLines.filter((e) => e.type === "keyword");
    const commentedCount = keywordsParsedLines.filter((e) => e.type === "commented_keyword").length;
    if (!args.keywords) args.keywords = [];
    args.keywords.push(...activeEntries.map((e) => e.keyword));
    console.log(`キーワードファイル読み込み: ${args.keywordsFile} (検索対象: ${activeEntries.length}件, 除外済み: ${commentedCount}件)`);
  }

  // キーワード → 期待価格マップ / JANマップ / entryオブジェクト（自動更新用）
  const keywordExpectedPriceMap = new Map();
  const keywordJanMap = new Map();
  const keywordEntryMap = new Map();
  if (keywordsParsedLines) {
    for (const entry of keywordsParsedLines) {
      if (entry.type === "keyword") {
        keywordEntryMap.set(entry.keyword, entry);
        if (entry.expectedPrice != null) keywordExpectedPriceMap.set(entry.keyword, entry.expectedPrice);
        if (entry.jan != null) keywordJanMap.set(entry.keyword, entry.jan);
      }
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const cacheTtlMs = args.cacheTtlDays * 24 * 60 * 60 * 1000;
  const kaitoriCache = args.noCache ? new Map() : await loadKaitoriCache(args.cacheFile);
  let kaitoriCacheDirty = false;

  const yahooClient = await createYahooClient(args);
  const keywords = args.keywords?.length ? args.keywords : [""];
  console.log(
    `Scanning stores=${args.stores.join(",")}, keywords=[${keywords.join(", ")}], pages=${args.pages}, yahooMode=${yahooClient.mode}, pointSource=${args.pointSource}`,
  );

  try {
    // --- 全店舗×全キーワードの検索ページエントリを生成 ---
    const pageEntries = args.stores.flatMap((storeId) =>
      keywords.flatMap((kw) =>
        Array.from({ length: args.pages }, (_, i) => ({
          url: buildStoreSearchUrl(storeId, kw, i + 1),
          keyword: kw,
          storeId,
        })),
      ),
    );
    const pageUrls = pageEntries.map((e) => e.url);

    // 検索ページは常に直列（1並列）で取得 — 最もBanリスクが高いため
    const searchHtmlList = await runPool(
      pageUrls,
      1,
      async (u) => {
        const html = await yahooClient.fetchText(u, args.timeoutMs);
        await randomDelay(args.delayMinMs, args.delayMaxMs);
        return html;
      },
    );

    // 全店舗の商品URLをまとめて収集（プレフィルター＋優先度分類）
    const priority1 = new Set(); // 最優先: priorityMinPrice〜priorityMaxPrice
    const priority2 = new Set(); // 通常:   その他の許容価格帯
    const urlKeywordMap = new Map();      // itemUrl → 検索キーワードSet
    const urlListingPriceMap = new Map(); // itemUrl → listingPrice
    let preFilteredCount = 0;

    for (let i = 0; i < pageEntries.length; i++) {
      const html = searchHtmlList[i];
      if (!html || typeof html !== "string") continue;
      const { storeId, keyword } = pageEntries[i];
      const items = extractYahooItemsFromSearch(html, storeId);
      for (const { url, listingPrice, listingInventory } of items) {
        // ハードフィルター: 価格帯外は完全除外
        if (listingPrice != null && (listingPrice < args.minPrice || listingPrice > args.maxPrice)) {
          console.log(`  [価格除外] ${formatYen(listingPrice)}: ${url.split("/").pop()}`);
          preFilteredCount++;
          continue;
        }
        // 在庫フィルター
        if (listingInventory != null && listingInventory < args.minInventory) {
          console.log(`  [在庫除外] 残り${listingInventory}個 < 下限${args.minInventory}個: ${url.split("/").pop()}`);
          preFilteredCount++;
          continue;
        }
        if (!urlKeywordMap.has(url)) urlKeywordMap.set(url, new Set());
        if (keyword) urlKeywordMap.get(url).add(keyword);
        if (listingPrice != null) urlListingPriceMap.set(url, listingPrice);
        // 優先度分類（価格不明はpriority2）
        const isPriority1 = listingPrice != null
          && listingPrice >= args.priorityMinPrice
          && listingPrice <= args.priorityMaxPrice;
        if (isPriority1) priority1.add(url);
        else priority2.add(url);
      }
    }

    // 優先度1 → 優先度2 の順に並べて max-items で切る
    // 各優先度グループ内は「期待価格との差が小さい順」にソートして本体候補を先頭にする
    function sortByExpectedPrice(urls) {
      return [...urls].sort((a, b) => {
        const priceA = urlListingPriceMap.get(a);
        const priceB = urlListingPriceMap.get(b);
        const kwsA = urlKeywordMap.get(a) ?? new Set();
        const kwsB = urlKeywordMap.get(b) ?? new Set();
        const expA = Math.max(0, ...[...kwsA].map((kw) => keywordExpectedPriceMap.get(kw) ?? 0));
        const expB = Math.max(0, ...[...kwsB].map((kw) => keywordExpectedPriceMap.get(kw) ?? 0));
        const diffA = expA > 0 && priceA != null ? Math.abs(priceA - expA) : Infinity;
        const diffB = expB > 0 && priceB != null ? Math.abs(priceB - expB) : Infinity;
        return diffA - diffB;
      });
    }
    const allUrls = [
      ...sortByExpectedPrice(priority1),
      ...sortByExpectedPrice([...priority2].filter((u) => !priority1.has(u))),
    ];
    const itemUrls = allUrls.slice(0, args.maxItems);
    const preFilterNote = preFilteredCount > 0 ? ` (除外: ${preFilteredCount}件)` : "";
    console.log(`Found item URLs: 優先(${priority1.size}) + 通常(${priority2.size})${preFilterNote} → スキャン対象: ${itemUrls.length}件`);

    // キーワードごとの買取商店アクセス済み結果（1キーワード1検索の原則）
    const keywordKaitoriResultMap = new Map(); // keyword → kaitoriPrice | null

    // --- 各商品の詳細取得 + 買取商店検索 ---
    const detailRows = await runPool(itemUrls, args.concurrency, async (itemUrl) => {
      const html = await yahooClient.fetchText(itemUrl, args.timeoutMs);
      await randomDelay(args.delayMinMs, args.delayMaxMs);
      const parsed = parseNextDataFromYahooItem(html);
      if (!parsed || parsed.price == null || !parsed.title) {
        return { itemUrl, skipped: true, reason: "failed to parse yahoo item" };
      }

      if (parsed.price < args.minPrice || parsed.price > args.maxPrice) {
        console.log(`  [価格除外] ${formatYen(parsed.price)} (許容: ${formatYen(args.minPrice)}〜${formatYen(args.maxPrice)}): ${parsed.title?.slice(0, 50)}`);
        return { itemUrl, skipped: true, reason: `価格範囲外: ${parsed.price}円` };
      }

      if (parsed.inventory != null && parsed.inventory < args.minInventory) {
        console.log(`  [在庫除外] 在庫${parsed.inventory}個 < 下限${args.minInventory}個: ${parsed.title?.slice(0, 50)}`);
        return { itemUrl, skipped: true, reason: `在庫不足: ${parsed.inventory}個` };
      }

      const hitExclude = args.excludeKeywords.find((kw) =>
        parsed.title.includes(kw),
      );
      if (hitExclude) {
        console.log(`  [除外] "${hitExclude}" を含む商品をスキップ: ${parsed.title.slice(0, 50)}`);
        return { itemUrl, skipped: true, reason: `除外キーワード: ${hitExclude}` };
      }

      // 期待価格チェック（アクセサリー除外）
      // 優先度: 1.キャッシュの前回買取価格 → 2.キーワードファイルの指定価格
      {
        let expectedPrice = null;
        const itemKeywordsForExp = urlKeywordMap.get(itemUrl) ?? new Set();
        // 1. キャッシュから取得（parsed.jan → キーワードファイルのJANの順でフォールバック）
        if (!args.noCache) {
          const janForCache = parsed.jan
            ?? [...itemKeywordsForExp].map((kw) => keywordJanMap.get(kw)).find(Boolean)
            ?? null;
          if (janForCache) {
            const cacheEntry = kaitoriCache.get(janForCache);
            if (cacheEntry?.kaitoriPrice != null) expectedPrice = cacheEntry.kaitoriPrice;
          }
        }
        // 2. キーワードファイルの期待価格
        if (expectedPrice == null) {
          for (const kw of itemKeywordsForExp) {
            const ep = keywordExpectedPriceMap.get(kw);
            if (ep != null) { expectedPrice = ep; break; }
          }
        }
        if (expectedPrice != null && parsed.price <= expectedPrice * 0.7) {
          console.log(`  [期待価格除外] Yahoo:${formatYen(parsed.price)} ≤ 期待${formatYen(expectedPrice)}×70%: ${parsed.title?.slice(0, 50)}`);
          return { itemUrl, skipped: true, reason: `期待価格比較で除外: ${parsed.price}円` };
        }
      }

      const selectedPoint =
        args.pointSource === "with-entry" ? parsed.pointWithEntry : parsed.point;
      const selectedEffectivePrice = parsed.price - selectedPoint;
      const effectivePrice = parsed.price - parsed.point;
      const effectivePriceWithEntry = parsed.price - parsed.pointWithEntry;

      // 買取商店をPlaywrightで検索（JAN→型番→タイトルの順でフォールバック）
      // キャッシュがあれば Playwright をスキップ
      const queries = buildKaitoriQueries(parsed);
      let kaitoriProducts = [];
      let usedQuery = queries[0];
      let kaitoriPrice = null;
      let kaitoriMatched = null;
      let kaitoriCacheHit = false;

      // 1キーワード1検索の原則: 同一キーワードで取得済みならその価格を再利用
      const itemKws = urlKeywordMap.get(itemUrl) ?? new Set();
      const reusedEntry = [...itemKws]
        .map((kw) => ({ kw, result: keywordKaitoriResultMap.get(kw) }))
        .find((e) => keywordKaitoriResultMap.has(e.kw));

      if (reusedEntry !== undefined) {
        kaitoriPrice = reusedEntry.result;
        kaitoriCacheHit = true;
        const label = kaitoriPrice == null ? "買い取りなし" : formatYen(kaitoriPrice);
        console.log(`  [Skip] 同一キーワード "${reusedEntry.kw}" のため、取得済みの買取価格を再利用します: ${label}`);
      } else {
        for (const q of queries) {
          usedQuery = q;

          // キャッシュチェック
          if (!args.noCache) {
            const entry = kaitoriCache.get(q);
            if (entry) {
              const isFresh = (new Date(today) - new Date(entry.cachedAt)) <= cacheTtlMs;
              if (isFresh) {
                kaitoriPrice = entry.kaitoriPrice;
                kaitoriCacheHit = true;
                const label = kaitoriPrice == null ? "買い取りなし" : `${kaitoriPrice}円`;
                console.log(`  [キャッシュ] query="${q}" → ${label}`);
                break;
              }
            }
          }

          // Playwright検索
          kaitoriProducts = await searchKaitorishouten(q, args.timeoutMs);
          kaitoriMatched = pickKaitorishoutenBest(kaitoriProducts, parsed);
          kaitoriPrice = kaitoriMatched?.price ?? null;

          // キャッシュ保存（null も「結果なし」として記録）
          if (!args.noCache) {
            kaitoriCache.set(q, { kaitoriPrice, cachedAt: today });
            kaitoriCacheDirty = true;
          }

          if (kaitoriProducts.length > 0) break;
        }

        // 取得結果をキーワードごとに記録（以降の同キーワード商品はアクセス不要）
        for (const kw of itemKws) {
          if (!keywordKaitoriResultMap.has(kw)) {
            keywordKaitoriResultMap.set(kw, kaitoriPrice);
          }
        }
      }

      // 買取価格がYahoo販売価格の1.5倍以上なら誤マッチとして除外（キャッシュ利用時はスキップ）
      // （アクセサリーがPS5本体価格にマッチするようなケースを防ぐ）
      if (!kaitoriCacheHit && kaitoriPrice != null && kaitoriPrice > parsed.price * 1.5) {
        console.warn(`  [誤マッチ除外] ${parsed.title?.slice(0, 30)}… Yahoo:${parsed.price}円 買取:${kaitoriPrice}円`);
        kaitoriPrice = null;
      }

      // キーワードファイルの期待価格を最新買取価格で自動更新
      if (kaitoriPrice != null && kaitoriPrice > 0 && keywordsParsedLines) {
        const itemKeywords = urlKeywordMap.get(itemUrl) ?? new Set();
        for (const kw of itemKeywords) {
          const kwEntry = keywordEntryMap.get(kw);
          if (!kwEntry) continue;
          if (kwEntry.expectedPrice !== kaitoriPrice) {
            console.log(`  [期待価格更新] "${kw}" ${formatYen(kwEntry.expectedPrice)} → ${formatYen(kaitoriPrice)}`);
            kwEntry.expectedPrice = kaitoriPrice;
          }
        }
      } else if (kaitoriPrice === 0) {
        console.warn(`  [期待価格スキップ] 買取価格0円のため期待価格を保持: ${parsed.title?.slice(0, 50)}`);
      }

      const profit = kaitoriPrice != null ? kaitoriPrice - effectivePrice : null;
      const profitWithEntry =
        kaitoriPrice != null ? kaitoriPrice - effectivePriceWithEntry : null;
      const selectedProfit =
        kaitoriPrice != null ? kaitoriPrice - selectedEffectivePrice : null;

      // ベース利益計算（固定還元率 basePointRate を使用）
      // ベース実質価格 = Yahoo販売価格 × (1 - basePointRate)
      const baseCost = parsed.price != null
        ? Math.round(parsed.price * (1 - args.basePointRate))
        : null;
      const baseProfit = kaitoriPrice != null && baseCost != null
        ? kaitoriPrice - baseCost
        : null;
      const baseProfitRate = baseProfit != null && parsed.price > 0
        ? baseProfit / parsed.price
        : null;

      return {
        storeId: args.stores.find((s) => itemUrl.includes(`/${s}/`)) || "",
        itemUrl,
        title: parsed.title,
        jan: parsed.jan,
        yahooPrice: parsed.price,
        yahooPoint: parsed.point,
        yahooPointWithEntry: parsed.pointWithEntry,
        selectedPoint,
        selectedEffectivePrice,
        pointSource: args.pointSource,
        effectivePrice,
        effectivePriceWithEntry,
        baseCost,
        baseProfit,
        baseProfitRate,
        kaitoriQuery: usedQuery,
        kaitoriMatchCount: kaitoriProducts.length,
        kaitoriMatched,
        kaitoriCacheHit,
        kaitoriPrice,
        profit,
        profitWithEntry,
        selectedProfit,
      };
    });

    const completed = detailRows.filter((r) => r && !r.error && !r.skipped);
    const profitable = completed
      .filter((r) =>
        Number.isFinite(r.baseProfitRate) &&
        r.baseProfitRate >= 0 &&
        r.baseProfitRate <= args.maxBaseProfitRate &&
        (r.baseProfit ?? -Infinity) >= args.minProfit,
      )
      .sort((a, b) => b.baseProfitRate - a.baseProfitRate);

    console.log(`Parsed items: ${completed.length}`);
    console.log(`Profitable candidates (利益率 0%〜${(args.maxBaseProfitRate * 100).toFixed(0)}%): ${profitable.length}件`);

    printResultTable(profitable);

    // 利益が出たキーワードを特定（urlKeywordMap で逆引き、1URLに複数キーワード対応）
    const profitableKeywords = new Set(
      profitable.flatMap((r) => [...(urlKeywordMap.get(r.itemUrl) ?? [])]),
    );

    // 実際にスキャンした商品のキーワードのみmiss更新対象とする（max-items切り捨て分は除外）
    const scannedKeywords = new Set(
      itemUrls.flatMap((u) => [...(urlKeywordMap.get(u) ?? [])]),
    );

    // キーワードファイルのメンテナンス（日付更新・miss カウント・自動コメントアウト）
    if (keywordsParsedLines && args.keywordsFile) {
      await rewriteKeywordsFile(args.keywordsFile, keywordsParsedLines, profitableKeywords, scannedKeywords, today);
    }

    // 新規利益商品のキーワードをファイルに追記
    if (args.appendKeywordsFile && profitable.length > 0) {
      const fs = await import("node:fs/promises");

      // 既存ファイルのキーワードを全取得（アクティブ + コメントアウト済み両方）
      let existingParsed = [];
      try {
        const existing = await fs.readFile(args.appendKeywordsFile, "utf8");
        existingParsed = parseKeywordsFileFull(existing);
      } catch { /* 新規作成 */ }
      const existingKeywords = new Set(
        existingParsed
          .filter((e) => e.type === "keyword" || e.type === "commented_keyword")
          .map((e) => e.keyword),
      );

      const newLines = [];
      for (const r of profitable) {
        // JAN > 型番(kaitoriQuery) > タイトル先頭 の優先順位で最も短い識別子を選ぶ
        const modelHint = r.kaitoriMatched?.jan === r.jan ? null : r.kaitoriQuery;
        const kw = r.jan
          || (modelHint && modelHint.length <= 30 ? modelHint : null)
          || (r.title || "").split(/\s+/).slice(0, 3).join(" ").slice(0, 30);
        if (kw && !existingKeywords.has(kw)) {
          newLines.push(kw);
          existingKeywords.add(kw);
        }
      }

      if (newLines.length > 0) {
        // 既存内容 + 新規ブロックを一時ファイル経由で安全に書き込む
        const block = `\n# 利益商品 ${today}\n` + newLines.join("\n") + "\n";
        const existingText = existingParsed.length > 0
          ? existingParsed.map((e) => e.original).join("\n")
          : "";
        const tmp = `${args.appendKeywordsFile}.tmp`;
        await fs.writeFile(tmp, existingText + block, "utf8");
        await fs.rename(tmp, args.appendKeywordsFile);
        console.log(`\nキーワード追記: ${args.appendKeywordsFile} (+${newLines.length}件)`);
        newLines.forEach((kw) => console.log(`  + ${kw}`));
      } else {
        console.log(`\nキーワード追記: 新規追加なし（すべて既存またはコメントアウト済み）`);
      }
    }

    if (args.jsonPath) {
      const fs = await import("node:fs/promises");
      await fs.writeFile(
        args.jsonPath,
        JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            input: args,
            counts: {
              foundItemUrls: allUrls.length,
              usedItemUrls: itemUrls.length,
              parsedItems: completed.length,
              profitableItems: profitable.length,
            },
            profitable,
            allParsed: completed,
          },
          null,
          2,
        ),
        "utf8",
      );
      console.log(`\nJSON saved: ${args.jsonPath}`);
    }
  } finally {
    if (!args.noCache && kaitoriCacheDirty) {
      await saveKaitoriCache(args.cacheFile, kaitoriCache);
      console.log(`\n買取価格キャッシュ保存: ${args.cacheFile} (${kaitoriCache.size}件)`);
    }
    await yahooClient.close();
    await closeKaitoriBrowser();
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message || err}`);
  process.exit(1);
});
