'use client';
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Leaflet's default icon path is not set up for Next.js.
// This is a workaround to make the default marker icon work.
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: iconRetinaUrl.src,
  iconUrl: iconUrl.src,
  shadowUrl: shadowUrl.src,
});

interface MapProps {
  markers: { lat: number; lng: number; popupText: string }[];
}

const Map: React.FC<MapProps> = ({ markers }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);

  useEffect(() => {
    if (mapRef.current && !mapInstance.current) {
      mapInstance.current = L.map(mapRef.current).setView([51.505, -0.09], 13);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(mapInstance.current);
    }
  }, []);

  useEffect(() => {
    if (mapInstance.current && markers.length > 0) {
      // Clear existing markers
      mapInstance.current.eachLayer((layer) => {
        if (layer instanceof L.Marker) {
          mapInstance.current?.removeLayer(layer);
        }
      });

      const bounds = L.latLngBounds(
        markers.map((m) => [m.lat, m.lng] as L.LatLngExpression)
      );

      markers.forEach((marker) => {
        L.marker([marker.lat, marker.lng])
          .addTo(mapInstance.current!)
          .bindPopup(marker.popupText);
      });

      if (bounds.isValid()) {
        mapInstance.current.fitBounds(bounds);
      }
    }
  }, [markers]);

  return <div ref={mapRef} style={{ height: '400px', width: '100%' }} />;
};

export default Map;
