import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, Calendar, ChevronRight, Clock, Hospital, Stethoscope, Users, ShieldCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, rolePath } from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MediQueue – Skip the Wait, Book Online" },
      { name: "description", content: "Modern hospital appointment booking with live queue updates. Book, get a token, and arrive when it's your turn." },
    ],
  }),
  component: Home,
});

function Home() {
  const { user, role } = useAuth();
  const today = new Date().toISOString().slice(0, 10);

  const { data: departments = [] } = useQuery({
    queryKey: ["departments-with-stats", today],
    queryFn: async () => {
      const { data: depts } = await supabase.from("departments").select("*").order("name");
      const { data: appts } = await supabase
        .from("appointments")
        .select("department_id, status, token_number")
        .eq("appointment_date", today);
      const { data: docs } = await supabase.from("doctors").select("id, department_id");
      return (depts ?? []).map((d) => {
        const dAppts = (appts ?? []).filter((a) => a.department_id === d.id);
        const current = dAppts.find((a) => a.status === "in_progress");
        return {
          ...d,
          current_token: current ? current.token_number : 0,
          doctor_count: (docs ?? []).filter((x) => x.department_id === d.id).length,
        };
      });
    },
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Hospital className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold tracking-tight">MediQueue</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm md:flex">
            <a href="#departments" className="text-muted-foreground hover:text-foreground">Departments</a>
            <Link to="/queue" className="text-muted-foreground hover:text-foreground">Live Queue</Link>
            <a href="#about" className="text-muted-foreground hover:text-foreground">About</a>
          </nav>
          <div className="flex items-center gap-2">
            {user && role ? (
              <Button asChild size="sm"><Link to={rolePath[role]}>Dashboard</Link></Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm"><Link to="/auth/$role" params={{ role: "patient" }}>Patient Login</Link></Button>
                <Button asChild size="sm"><Link to="/auth/$role" params={{ role: "patient" }} search={{ tab: "signup" }}>Sign up</Link></Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 opacity-90" style={{ background: "var(--gradient-hero)" }} />
        <div className="relative z-10 mx-auto max-w-6xl px-4 py-20 text-black sm:py-28">
          <Badge variant="secondary" className="mb-4 bg-white/70 text-black border-black/10">
            <ShieldCheck className="mr-1 h-3 w-3" /> Trusted by 10,000+ patients
          </Badge>
          <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight text-black sm:text-6xl">
            Skip the wait. <span className="opacity-90">Arrive when it's your turn.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-black opacity-90">
            Book hospital appointments online, get an instant token, and track the live queue in real time.
            MediQueue helps you spend less time in the waiting room and more time on what matters.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="bg-white text-primary hover:bg-white/90">
              <Link to="/patient/hospitals"><Calendar className="mr-2 h-4 w-4" /> Find Hospital & Book</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-black/30 bg-white/60 text-black hover:bg-white/80">
              <Link to="/queue"><Users className="mr-2 h-4 w-4" /> View Live Queue</Link>
            </Button>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-6 sm:grid-cols-4">
            {[
              { label: "Avg. wait saved", value: "42m" },
              { label: "Departments", value: "5" },
              { label: "Daily tokens", value: "300+" },
              { label: "Realtime", value: "Live" },
            ].map((s) => (
              <div key={s.label} className="text-black">
                <div className="text-3xl font-bold text-black">{s.value}</div>
                <div className="text-sm text-black opacity-80">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About */}
      <section id="about" className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid gap-8 md:grid-cols-3">
          {[
            { icon: Calendar, title: "Book in seconds", desc: "Pick a department, doctor, and time slot. Get a token instantly." },
            { icon: Activity, title: "Live updates", desc: "Watch the queue advance in real time so you know exactly when to arrive." },
            { icon: Stethoscope, title: "Doctor-friendly", desc: "Doctors call, skip, or complete with a click. Patients see status update instantly." },
          ].map((f) => (
            <div key={f.title} className="rounded-xl border border-border bg-card p-6">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary"><f.icon className="h-5 w-5" /></div>
              <h3 className="mt-3 text-lg font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Departments */}
      <section id="departments" className="bg-muted/40 py-16">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl font-bold">Departments</h2>
              <p className="mt-1 text-muted-foreground">Live token, average wait, and available doctors.</p>
            </div>
            <Button asChild variant="outline"><Link to="/queue">Full Live Queue <ChevronRight className="ml-1 h-4 w-4" /></Link></Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {departments.map((d) => (
              <Card key={d.id} className="group transition hover:-translate-y-0.5">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="font-mono">{d.code}</Badge>
                    <Stethoscope className="h-4 w-4 text-primary" />
                  </div>
                  <CardTitle className="mt-2">{d.name}</CardTitle>
                  <CardDescription>{d.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-muted p-3">
                      <div className="text-xs text-muted-foreground">Current</div>
                      <div className="text-lg font-bold text-primary">{d.current_token || "—"}</div>
                    </div>
                    <div className="rounded-lg bg-muted p-3">
                      <div className="text-xs text-muted-foreground">Avg wait</div>
                      <div className="text-lg font-bold">{d.avg_wait_minutes}m</div>
                    </div>
                    <div className="rounded-lg bg-muted p-3">
                      <div className="text-xs text-muted-foreground">Doctors</div>
                      <div className="text-lg font-bold">{d.doctor_count}</div>
                    </div>
                  </div>
                  <Button asChild className="mt-4 w-full" size="sm">
                    <Link to="/patient/book">Book {d.name}</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Live preview */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="rounded-2xl border border-border bg-card p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold">Live queue, right now</h2>
              <p className="text-muted-foreground">Realtime status across all departments.</p>
            </div>
            <Button asChild><Link to="/queue"><Clock className="mr-2 h-4 w-4" /> Open Live Board</Link></Button>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {departments.map((d) => (
              <div key={d.id} className="rounded-lg border border-border p-4">
                <div className="text-xs font-medium text-muted-foreground">{d.name}</div>
                <div className="mt-1 font-mono text-2xl font-bold text-primary">{d.code}-{String(d.current_token || 0).padStart(3, "0")}</div>
                <div className="mt-1 text-xs text-muted-foreground">Now serving</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Staff portals */}
      <section className="bg-muted/40 py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-bold">Staff Portals</h2>
          <div className="mx-auto mt-8 grid max-w-4xl gap-4 md:grid-cols-3">
            {[
              { role: "patient" as const, icon: UserPlus, title: "Patient Login", desc: "Book and track appointments" },
              { role: "receptionist" as const, icon: Hospital, title: "Receptionist Login", desc: "Manage today's appointments" },
              { role: "doctor" as const, icon: Stethoscope, title: "Doctor Login", desc: "Run your daily queue" },
            ].map((p) => (
              <Link key={p.role} to="/auth/$role" params={{ role: p.role }} className="group rounded-xl border border-border bg-card p-6 transition hover:border-primary">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary"><p.icon className="h-5 w-5" /></div>
                <h3 className="mt-3 font-semibold group-hover:text-primary">{p.title}</h3>
                <p className="text-sm text-muted-foreground">{p.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-2"><Hospital className="h-4 w-4" /> MediQueue Hospital</div>
          <div>© {new Date().getFullYear()} MediQueue. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}
