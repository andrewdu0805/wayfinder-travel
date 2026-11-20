import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { resolvePlaceDescription } from '@/lib/place-notes';
import { inferPlaceCategoryByName } from '@/lib/geo-utils';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name: string = (body.name || '').trim();
    const city: string = (body.city || '台南市').trim();
    const district: string = (body.district || '').trim();
    const subCategory: string =
      (body.subCategory || '').trim() ||
      inferPlaceCategoryByName(name).sub_category;
    const address: string = (body.address || '').trim();
    const latitude: number | undefined =
      typeof body.latitude === 'number' ? body.latitude : undefined;
    const longitude: number | undefined =
      typeof body.longitude === 'number' ? body.longitude : undefined;
    const geminiApiKey: string =
      body.geminiApiKey || process.env.GEMINI_API_KEY || '';
    const googleMapsApiKey: string =
      body.googleMapsApiKey || process.env.GOOGLE_MAPS_API_KEY || '';

    if (!name) {
      return NextResponse.json(
        { error: '缺少店家或景點名稱' },
        { status: 400 }
      );
    }

    // 1. Google Places API (New) with official reviewSummary & generativeSummary & editorialSummary
    if (googleMapsApiKey && googleMapsApiKey !== 'your-google-maps-api-key') {
      try {
        const query = `${name} ${city} ${district}`.trim();
        const requestBody: Record<string, unknown> = {
          textQuery: query,
          languageCode: 'zh-TW',
        };
        if (latitude && longitude && latitude > 20 && latitude < 27) {
          requestBody.locationBias = {
            circle: {
              center: { latitude, longitude },
              radius: 2000.0,
            },
          };
        }

        const res = await fetch(
          'https://places.googleapis.com/v1/places:searchText',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': googleMapsApiKey,
              'X-Goog-FieldMask':
                'places.displayName,places.formattedAddress,places.reviewSummary,places.generativeSummary,places.editorialSummary,places.reviews',
            },
            body: JSON.stringify(requestBody),
            signal: AbortSignal.timeout(5000),
          }
        );

        if (res.ok) {
          const data = await res.json();
          const place = data.places?.[0];

          // A. Official Google Maps Gemini Review Summary (評論摘要 - 摘要由 Gemini 生成)
          let reviewSummaryText =
            place?.reviewSummary?.text?.text ||
            (typeof place?.reviewSummary?.text === 'string'
              ? place.reviewSummary.text
              : '');
          reviewSummaryText = reviewSummaryText.trim();
          if (reviewSummaryText && !/[\u4e00-\u9fff]/.test(reviewSummaryText)) {
            if (geminiApiKey && geminiApiKey !== 'your-gemini-api-key') {
              try {
                const ai = new GoogleGenAI({ apiKey: geminiApiKey });
                const tr = await ai.models.generateContent({
                  model: 'gemini-2.5-flash',
                  contents: `請將以下 Google Maps 評論摘要忠實翻譯為自然流暢的繁體中文（保留客觀歸納語氣，只輸出翻譯後的繁體中文，不加引號）：\n${reviewSummaryText}`,
                });
                if (tr.text && /[\u4e00-\u9fff]/.test(tr.text)) {
                  reviewSummaryText = tr.text.trim();
                } else {
                  reviewSummaryText = '';
                }
              } catch {
                reviewSummaryText = '';
              }
            } else {
              reviewSummaryText = '';
            }
          }
          if (reviewSummaryText && reviewSummaryText.length > 5) {
            return NextResponse.json({
              description: reviewSummaryText,
              source: 'google_places_review_summary',
            });
          }

          // B. Official Google Maps Gemini Generative Place Summary
          const genDescText =
            place?.generativeSummary?.description?.text ||
            place?.generativeSummary?.overview?.text;
          if (genDescText && genDescText.length > 5) {
            return NextResponse.json({
              description: genDescText.trim(),
              source: 'google_places_generative_summary',
            });
          }

          // C. Editorial Summary
          if (place?.editorialSummary?.text) {
            return NextResponse.json({
              description: place.editorialSummary.text.trim(),
              source: 'google_places_editorial',
            });
          }

          // D. Synthesize from actual user reviews via Gemini if available, or return top review snippet
          if (Array.isArray(place?.reviews) && place.reviews.length > 0) {
            const reviewTexts = place.reviews
              .map((r: { text?: { text?: string } }) => r?.text?.text)
              .filter(Boolean)
              .slice(0, 5);

            if (
              reviewTexts.length > 0 &&
              geminiApiKey &&
              geminiApiKey !== 'your-gemini-api-key'
            ) {
              try {
                const ai = new GoogleGenAI({ apiKey: geminiApiKey });
                const synthResp = await ai.models.generateContent({
                  model: 'gemini-2.5-flash',
                  contents: `以下是 Google Maps 上關於「${city}${district} ${name}」的真實使用者評論：\n${reviewTexts
                    .map((t: string, i: number) => `${i + 1}. ${t}`)
                    .join('\n')}\n\n請完全根據上述真實評論內容，仿照 Google Maps 官方「評論摘要 (摘要由 Gemini 生成)」的客觀歸納語氣，濃縮成一段 50~95 字的繁體中文摘要。若該地點為藝文場館、古蹟或景點，請使用「遊客表示」或「參觀者表示」，切勿誤稱為餐廳。只輸出摘要內文，不加引號或標題。`,
                });
                if (synthResp.text && synthResp.text.trim().length > 10) {
                  return NextResponse.json({
                    description: synthResp.text.trim(),
                    source: 'google_places_reviews_gemini_synthesized',
                  });
                }
              } catch {
                // fallback to top review snippet below
              }
            }

            const topReview = reviewTexts[0];
            if (topReview && topReview.length > 10) {
              const snippet = topReview.slice(0, 95).replace(/\r?\n/g, ' ');
              return NextResponse.json({
                description: snippet,
                source: 'google_places_review',
              });
            }
          }
        }
      } catch (err) {
        console.warn('Google Places API note fetch error:', err);
      }
    }

    // 2. Gemini AI with Google Maps Grounding tool (Grounding with Google Maps)
    if (geminiApiKey && geminiApiKey !== 'your-gemini-api-key') {
      try {
        const ai = new GoogleGenAI({ apiKey: geminiApiKey });
        const categoryTypeLabel =
          subCategory === 'museum'
            ? '藝文展館／博物館／文化中心'
            : subCategory === 'landmark'
            ? '文化古蹟／地標景點'
            : subCategory === 'trail'
            ? '自然步道／戶外景觀'
            : subCategory === 'bar'
            ? '酒吧／餐酒館'
            : subCategory === 'snack_dessert'
            ? '咖啡廳／甜點小吃'
            : subCategory === 'souvenir'
            ? '伴手禮／名產店'
            : '在地店家／地點';

        const prompt = `請查詢位於「${city}${district}」的「${name}」（地址：${address || `${city}${district}`}，性質：${categoryTypeLabel}）在 Google Maps 上的真實顧客評論與地點特色，並產生一段 50~95 字的 Google Maps「評論摘要 (摘要由 Gemini 生成)」。
嚴格規範：
1. 必須完全符合「${name}」的真實屬性（${categoryTypeLabel}）與具體特色（例如：若為衛武營國家藝術文化中心，必須提及其流線型白色波浪建築、榕樹廣場、音樂廳與戲劇院聲學效果、戶外草坪散步等；若為餐廳或酒吧，才提及招牌菜色或調酒）。
2. 絕對禁止把「博物館、藝術中心、文化古蹟、公園步道」寫成「這家餐廳的餐點美味」！
3. 依地點性質使用「遊客表示…他們也特別提到…評論提到…」（景點/展館/古蹟）或「顧客表示…他們特別提到…評論也提到…」（餐飲/酒吧/商店）的 Google Maps 官方摘要語氣。
4. 只輸出純文字繁體中文，不加 Markdown、不加引號或標題。`;

        let cleanText = '';
        try {
          // Try with Google Maps Grounding enabled first
          const groundedResp = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
              tools: [{ googleMaps: {} }],
              ...(latitude && longitude
                ? {
                    toolConfig: {
                      retrievalConfig: {
                        latLng: { latitude, longitude },
                      },
                    },
                  }
                : {}),
            },
          });
          cleanText = (groundedResp.text || '').trim();
        } catch {
          // Fallback to standard Gemini generation if grounding tool is not enabled on user's key tier
          const stdResp = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
          });
          cleanText = (stdResp.text || '').trim();
        }

        if (cleanText.length > 10) {
          return NextResponse.json({
            description: cleanText,
            source: 'gemini_maps_grounded_summary',
          });
        }
      } catch (err) {
        console.warn('Gemini note fetch error:', err);
      }
    }

    // 3. High-precision curated & district-aware description (passing subCategory so museums/landmarks never fall back to restaurant!)
    const curated = resolvePlaceDescription(
      name,
      city,
      district,
      subCategory,
      address
    );

    return NextResponse.json({
      description: curated,
      source: 'curated_district_maps_summary',
    });
  } catch (error) {
    console.error('enrich-notes route error:', error);
    return NextResponse.json(
      { error: '取得說明摘要失敗' },
      { status: 500 }
    );
  }
}
