import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { resolvePlaceDescription } from '@/lib/place-notes';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name: string = (body.name || '').trim();
    const city: string = (body.city || '台南市').trim();
    const district: string = (body.district || '').trim();
    const address: string = (body.address || '').trim();
    const googleMapsUrl: string = (body.googleMapsUrl || '').trim();
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

    // 1. Google Places API (New) with editorialSummary & reviews
    if (googleMapsApiKey && googleMapsApiKey !== 'your-google-maps-api-key') {
      try {
        const query = `${name} ${city} ${district}`.trim();
        const res = await fetch(
          'https://places.googleapis.com/v1/places:searchText',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': googleMapsApiKey,
              'X-Goog-FieldMask':
                'places.displayName,places.formattedAddress,places.editorialSummary,places.reviews',
            },
            body: JSON.stringify({
              textQuery: query,
              languageCode: 'zh-TW',
            }),
            signal: AbortSignal.timeout(4000),
          }
        );

        if (res.ok) {
          const data = await res.json();
          const place = data.places?.[0];
          if (place?.editorialSummary?.text) {
            return NextResponse.json({
              description: place.editorialSummary.text,
              source: 'google_places_editorial',
            });
          }
          if (Array.isArray(place?.reviews) && place.reviews.length > 0) {
            const topReview = place.reviews[0]?.text?.text;
            if (topReview && topReview.length > 10) {
              const snippet = topReview.slice(0, 80).replace(/\r?\n/g, ' ');
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

    // 2. Gemini AI Google Maps Review Summary generator (like Google Maps "評論摘要 - 摘要由 Gemini 生成")
    if (geminiApiKey && geminiApiKey !== 'your-gemini-api-key') {
      try {
        const ai = new GoogleGenAI({ apiKey: geminiApiKey });
        const prompt = `你現在是 Google Maps 上的「評論摘要 (摘要由 Gemini 生成)」模組。
請為位於「${city}${district}」的「${name}」（地址/參考：${address || '在地人氣推薦'}）生成一段 35~75 字的真實顧客評價精華總結。
寫作規範：
1. 必須以客觀歸納口吻（如：「顧客表示這家餐廳的...，他們特別提到...」或「在地老饕推薦必點...」）。
2. 內容必須嚴格針對「${city}${district}」的這間具體店家，精準點出該店真實的招牌菜色（如牛肉湯、肉燥飯、續湯免費等）、口味特色或氛圍服務，絕對不可把中西區的特色寫到新化區去。
3. 輸出純文字繁體中文，不加 Markdown 粗體、不加引號或標題。`;

        const resp = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
        });

        if (resp.text) {
          const cleanText = resp.text.trim();
          if (cleanText.length > 10) {
            return NextResponse.json({
              description: cleanText,
              source: 'gemini_review_summary',
            });
          }
        }
      } catch (err) {
        console.warn('Gemini note fetch error:', err);
      }
    }

    // 3. High-precision curated & district-aware description
    const curated = resolvePlaceDescription(
      name,
      city,
      district,
      '',
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
