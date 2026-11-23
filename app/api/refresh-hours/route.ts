import { NextRequest, NextResponse } from 'next/server';
import { SavedPlace } from '@/types/place';
import { parseGoogleOpeningHours } from '@/lib/google-maps-enricher';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const places: SavedPlace[] = body.places || [];
    const googleMapsApiKey: string =
      body.googleMapsApiKey || process.env.GOOGLE_MAPS_API_KEY || '';

    const nowIso = new Date().toISOString();
    const updatedPlaces: SavedPlace[] = [];

    for (const place of places) {
      let nextHours = place.opening_hours_json || {
        open_now: true,
        weekday_descriptions: ['每日 10:00–21:00'],
        daily_hours: { open: '10:00', close: '21:00' },
      };
      let nextRating = place.rating;
      let nextBusinessStatus = place.business_status || 'OPERATIONAL';

      if (
        googleMapsApiKey &&
        googleMapsApiKey !== 'your-google-maps-api-key' &&
        place.google_place_id &&
        place.google_place_id.startsWith('ChIJ') &&
        !place.google_place_id.startsWith('ChIJ_')
      ) {
        try {
          const res = await fetch(
            `https://places.googleapis.com/v1/places/${encodeURIComponent(
              place.google_place_id
            )}?languageCode=zh-TW`,
            {
              headers: {
                'X-Goog-Api-Key': googleMapsApiKey,
                'X-Goog-FieldMask':
                  'id,rating,regularOpeningHours,businessStatus',
              },
              signal: AbortSignal.timeout(4000),
            }
          );
          if (res.ok) {
            const detail = await res.json();
            if (typeof detail.rating === 'number') {
              nextRating = detail.rating;
            }
            if (detail.businessStatus) {
              nextBusinessStatus = detail.businessStatus;
            }
            const parsedHours = parseGoogleOpeningHours(
              detail.regularOpeningHours
            );
            if (parsedHours) {
              nextHours = parsedHours;
            }
          }
        } catch (err) {
          console.warn('Refresh place hours fallback:', err);
        }
      }

      updatedPlaces.push({
        ...place,
        rating: nextRating,
        business_status: nextBusinessStatus,
        opening_hours_json: nextHours,
        hours_updated_at: nowIso,
        updated_at: nowIso,
      });
    }

    return NextResponse.json({
      places: updatedPlaces,
      refreshedCount: updatedPlaces.length,
      timestamp: nowIso,
    });
  } catch (error) {
    console.error('Refresh hours error:', error);
    return NextResponse.json(
      { error: '更新營業資訊失敗' },
      { status: 500 }
    );
  }
}
