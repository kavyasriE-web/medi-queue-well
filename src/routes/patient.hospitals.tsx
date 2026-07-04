import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Hospital, MapPin, Navigation, Search, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/patient/hospitals")({
  head: () => ({
    meta: [
      { title: "Find a Hospital – MediQueue" },
      { name: "description", content: "Find nearby hospitals and book an appointment. Location-based search or filter by name, city, or area." },
    ],
  }),
  component: HospitalsPage,
});

type Hospital = {
  id: string; name: string; code: string; city: string; area: string | null;
  address: string | null; phone: string | null;
  latitude: number | null; longitude: number | null; description: string | null;
};

type GeoState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "granted"; lat: number; lng: number }
  | { status: "denied"; message: string };

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = s1 * s1 + Math.cos(lat1) * Math.cos(lat2) * s2 * s2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function HospitalsPage() {
  const navigate = useNavigate();
  const [geo, setGeo] = useState<GeoState>({ status: "idle" });
  const [query, setQuery] = useState("");

  const { data: hospitals = [], isLoading } = useQuery<Hospital[]>({
    queryKey: ["hospitals-all"],
    queryFn: async () =>
      ((await supabase.from("hospitals").select("*").order("name")).data ?? []) as Hospital[],
  });

  const requestLocation = () => {
    if (!("geolocation" in navigator)) {
      setGeo({ status: "denied", message: "Location not supported in this browser." });
      return;
    }
    setGeo({ status: "loading" });
    navigator.geolocation.getCurrentPosition(
      (pos) => setGeo({ status: "granted", lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => setGeo({ status: "denied", message: err.message || "Permission denied." }),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 },
    );
  };

  // Auto-prompt on first mount
  useEffect(() => {
    if (geo.status === "idle") requestLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = hospitals.map((h) => {
      let distanceKm: number | null = null;
      if (geo.status === "granted" && h.latitude != null && h.longitude != null) {
        distanceKm = haversineKm(
          { lat: geo.lat, lng: geo.lng },
          { lat: h.latitude, lng: h.longitude },
        );
      }
      return { ...h, distanceKm };
    });
    if (q) {
      list = list.filter((h) =>
        [h.name, h.city, h.area ?? "", h.address ?? ""].some((v) => v.toLowerCase().includes(q)),
      );
    }
    if (geo.status === "granted") {
      list.sort((a, b) => {
        if (a.distanceKm == null) return 1;
        if (b.distanceKm == null) return -1;
        return a.distanceKm - b.distanceKm;
      });
    } else {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return list;
  }, [hospitals, query, geo]);

  const pick = (hospitalId: string) => {
    navigate({ to: "/patient/book", search: { hospital: hospitalId } as any });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Hospital className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold tracking-tight">MediQueue</span>
          </Link>
          <Button asChild variant="ghost" size="sm"><Link to="/">← Home</Link></Button>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Find a hospital</h1>
          <p className="text-muted-foreground">Pick a hospital to start booking. Nearby hospitals appear first when location is on.</p>
        </div>

        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={requestLocation} size="sm" variant={geo.status === "granted" ? "outline" : "default"}>
                {geo.status === "loading" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Navigation className="mr-2 h-4 w-4" />}
                {geo.status === "granted" ? "Location on" : "Use my location"}
              </Button>
              {geo.status === "granted" && (
                <Badge variant="secondary">Sorted by distance</Badge>
              )}
              {geo.status === "denied" && (
                <span className="text-sm text-muted-foreground">Location off — search below.</span>
              )}
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, city, or area…"
                className="pl-9"
              />
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="grid place-items-center p-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="rounded border border-dashed p-8 text-center text-muted-foreground">
            No hospitals match your search.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {filtered.map((h) => (
              <Card key={h.id} className="transition hover:border-primary">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-lg">{h.name}</CardTitle>
                      <CardDescription className="flex items-center gap-1 mt-1">
                        <MapPin className="h-3 w-3" />
                        {h.area ? `${h.area}, ` : ""}{h.city}
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="font-mono">{h.code}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {h.description && <p className="text-sm text-muted-foreground">{h.description}</p>}
                  <div className="flex items-center justify-between">
                    <span className="text-sm">
                      {h.distanceKm != null ? (
                        <span className="font-medium text-primary">{h.distanceKm.toFixed(1)} km away</span>
                      ) : (
                        <span className="text-muted-foreground">{h.address ?? "—"}</span>
                      )}
                    </span>
                    <Button size="sm" onClick={() => pick(h.id)}>
                      Book <ArrowRight className="ml-1 h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}