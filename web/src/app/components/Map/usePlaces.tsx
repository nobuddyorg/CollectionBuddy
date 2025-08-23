'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import { Place } from './types';

export function usePlaces(categoryId: string) {
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPlaces = async () => {
      setLoading(true);
      try {
        const { data: items, error } = await supabase
          .from('items')
          .select('place')
          .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
          .not('place', 'is', null)
          .neq('place', '');

        if (error) {
          throw error;
        }

        const uniquePlaces = Array.from(new Set(items.map((i) => i.place!)));

        const placeCoordinates = await Promise.all(
          uniquePlaces.map(async (place) => {
            try {
              const url = new URL('https://photon.komoot.io/api/');
              url.searchParams.set('q', place);
              url.searchParams.set('limit', '1');
              const res = await fetch(url.toString());
              if (!res.ok) {
                console.error(`Failed to fetch coordinates for ${place}`);
                return null;
              }
              const data = await res.json();
              if (data.features && data.features.length > 0) {
                const [lng, lat] = data.features[0].geometry.coordinates;
                return { name: place, lat, lng };
              }
              return null;
            } catch (e) {
              console.error(`Error fetching coordinates for ${place}`, e);
              return null;
            }
          }),
        );

        setPlaces(placeCoordinates.filter((p): p is Place => p !== null));
      } catch (error) {
        console.error('Error fetching places:', error);
      } finally {
        setLoading(false);
      }
    };

    void fetchPlaces();
  }, [categoryId]);

  return { places, loading };
}
