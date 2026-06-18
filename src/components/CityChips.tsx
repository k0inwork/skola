import { useState, useEffect, useRef } from "react";
import { Star, X, Plus } from "lucide-react";

interface CityChipsProps {
  cities: string[];
  onChange: (cities: string[]) => void;
  /** Cities available to add (from server). */
  available?: string[];
  /** Token for fetching available cities. */
  token?: string;
}

/**
 * Ordered chip selector for a working day's cities. First chip = default
 * (used to seed new slots). Instructors can reorder via star-to-front,
 * remove via ×, and add via the "+ Pilsēta" dropdown.
 */
export function CityChips({ cities, onChange, available, token }: CityChipsProps) {
  const [allCities, setAllCities] = useState<string[]>(available ?? []);
  const [addOpen, setAddOpen] = useState(false);
  const addRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (available) { setAllCities(available); return; }
    if (!token) return;
    fetch("/api/calendar/locations/cities", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : ["Olaine", "Rīga", "Jelgava"])
      .then((c: string[]) => setAllCities(Array.isArray(c) && c.length > 0 ? c : ["Olaine", "Rīga", "Jelgava"]))
      .catch(() => setAllCities(["Olaine", "Rīga", "Jelgava"]));
  }, [available, token]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (addRef.current && !addRef.current.contains(e.target as Node)) setAddOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const setDefault = (city: string) => {
    const rest = cities.filter(c => c !== city);
    onChange([city, ...rest]);
  };
  const remove = (city: string) => {
    if (cities.length <= 1) return;
    onChange(cities.filter(c => c !== city));
  };
  const add = (city: string) => {
    if (!city || cities.includes(city)) return;
    onChange([...cities, city]);
    setAddOpen(false);
  };

  const candidates = allCities.filter(c => !cities.includes(c));

  return (
    <div>
      <div className="flex flex-wrap gap-2 items-center">
        {cities.map((c, i) => (
          <span
            key={c}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium ${
              i === 0 ? "bg-purple-600 text-white" : "bg-purple-100 text-purple-700"
            }`}
          >
            <button
              type="button"
              title="Padarīt par noklusējumu"
              onClick={() => setDefault(c)}
              className={i === 0 ? "text-amber-300" : "text-purple-400 hover:text-purple-700"}
            >
              <Star className={`w-3.5 h-3.5 ${i === 0 ? "fill-amber-300" : ""}`} />
            </button>
            <span>{c}</span>
            {cities.length > 1 && (
              <button
                type="button"
                onClick={() => remove(c)}
                className="hover:text-red-600"
                title="Noņemt"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </span>
        ))}
        <div className="relative" ref={addRef}>
          <button
            type="button"
            onClick={() => setAddOpen(o => !o)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium border border-dashed border-purple-400 text-purple-600 hover:bg-purple-50"
          >
            <Plus className="w-3.5 h-3.5" /> Pilsēta
          </button>
          {addOpen && (
            <div className="absolute z-10 mt-1 bg-white border rounded-lg shadow-lg min-w-[10rem] max-h-48 overflow-auto">
              {candidates.length === 0 ? (
                <div className="px-3 py-2 text-xs text-gray-400">Nav vairāk pieejamo</div>
              ) : (
                candidates.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => add(c)}
                    className="block w-full text-left px-3 py-2 text-sm hover:bg-purple-50"
                  >
                    {c}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-1">Pirmā pilsēta = noklusējuma jauniem slotiem</p>
    </div>
  );
}
