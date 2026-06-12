import { useState, useRef, useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix Leaflet default icon issue with bundlers
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const CITIES = ["Olaine", "Rīga", "Jelgava"] as const;
const CITY_CENTERS: Record<string, [number, number]> = {
  Olaine: [56.8587, 24.0841],
  Rīga: [56.9496, 24.1052],
  Jelgava: [56.6511, 23.7216],
};

interface LocationMapPickerProps {
  onClose: () => void;
  onSaved: (location: { id: string; name: string; city: string }) => void;
  defaultCity?: string;
  token?: string;
}

function MapClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function FlyToCity({ city }: { city: string }) {
  const map = useMap();
  const prevCity = useRef(city);
  useEffect(() => {
    if (prevCity.current !== city) {
      const center = CITY_CENTERS[city];
      if (center) map.flyTo(center, 14, { duration: 1 });
      prevCity.current = city;
    }
  }, [city, map]);
  return null;
}

export default function LocationMapPicker({ onClose, onSaved, defaultCity, token }: LocationMapPickerProps) {
  const [city, setCity] = useState(defaultCity || "Olaine");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [marker, setMarker] = useState<{ lat: number; lng: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const reverseGeocodeTimeout = useRef<ReturnType<typeof setTimeout>>();

  const handleMapClick = async (lat: number, lng: number) => {
    setMarker({ lat, lng });
    setGeocoding(true);

    // Debounce reverse geocode
    clearTimeout(reverseGeocodeTimeout.current);
    reverseGeocodeTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=lv`
        );
        const data = await res.json();
        if (data.display_name) {
          setAddress(data.display_name);
          if (!name && data.address) {
            const road = data.address.road || data.address.suburb || data.address.city || "";
            setName(road);
          }
        }
      } catch {
        // Ignore geocoding errors
      } finally {
        setGeocoding(false);
      }
    }, 300);
  };

  const handleSave = async () => {
    if (!name.trim() || !marker) return;
    setSaving(true);
    try {
      const res = await fetch("/api/calendar/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ name: name.trim(), address, lat: marker.lat, lng: marker.lng, city }),
      });
      const loc = await res.json();
      onSaved(loc);
      onClose();
    } catch {
      alert("Kļūda saglabājot vietu");
    } finally {
      setSaving(false);
    }
  };

  const center = CITY_CENTERS[city] || CITY_CENTERS.Olaine;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold">Pievienot vietu</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-xl">&times;</button>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Pilsēta</label>
              <select
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full border rounded px-3 py-2"
              >
                {CITIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="flex-[2]">
              <label className="block text-sm font-medium text-gray-700 mb-1">Nosaukums</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Piem., Autoosta"
                className="w-full border rounded px-3 py-2"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Adrese</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Tiks aizpildīts automātiski"
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div className="rounded overflow-hidden border" style={{ height: 320 }}>
            <MapContainer center={center} zoom={14} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="/api/calendar/tiles/{z}/{x}/{y}"
              />
              <MapClickHandler onClick={handleMapClick} />
              <FlyToCity city={city} />
              {marker && <Marker position={[marker.lat, marker.lng]} />}
            </MapContainer>
          </div>
          <p className="text-xs text-gray-500">
            {geocoding ? "Nosaka adresi..." : "Noklikšķiniet uz kartes, lai izvēlētos vietu"}
          </p>
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:text-gray-800">Atcelt</button>
            <button
              onClick={handleSave}
              disabled={!name.trim() || !marker || saving}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saglabā..." : "Saglabāt"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
