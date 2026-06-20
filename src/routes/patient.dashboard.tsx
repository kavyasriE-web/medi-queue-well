import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, Calendar, Clock, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RoleGuard } from "@/components/role-guard";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/patient/dashboard")({ component: () => <RoleGuard role="patient"><Page /></RoleGuard> });

function Page() {
  const { user } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const { data: appts = [] } = useQuery({
    queryKey: ["my-appts", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase
      .from("appointments")
      .select("*, departments(name, code), doctors(specialization, profiles:profile_id(full_name))")
      .eq("patient_id", user!.id)
      .order("appointment_date", { ascending: false })
      .limit(5)).data ?? [],
  });
  const upcoming = appts.filter((a) => a.appointment_date >= today && a.status !== "cancelled" && a.status !== "completed");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Welcome back</h1>
        <p className="text-muted-foreground">Manage your appointments and watch the live queue.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Calendar} label="Upcoming" value={upcoming.length} />
        <StatCard icon={Activity} label="Total visits" value={appts.length} />
        <StatCard icon={Clock} label="Next slot" value={upcoming[0]?.slot_time?.slice(0,5) ?? "—"} />
        <StatCard icon={Users} label="Active token" value={upcoming[0]?.token_code ?? "—"} mono />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div><CardTitle>Recent appointments</CardTitle><CardDescription>Your last 5 bookings</CardDescription></div>
            <Button asChild size="sm"><Link to="/patient/appointments">View all</Link></Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {appts.length === 0 && <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">No appointments yet. <Link to="/patient/book" className="text-primary underline">Book one now</Link></div>}
            {appts.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono">{a.token_code}</Badge>
                    <span className="font-medium">{a.departments?.name}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{a.appointment_date} · {a.slot_time?.slice(0,5)} · Dr. {a.doctors?.profiles?.full_name}</div>
                </div>
                <StatusBadge status={a.status as string} />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Quick actions</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Button asChild className="w-full"><Link to="/patient/book"><Calendar className="mr-2 h-4 w-4" /> Book appointment</Link></Button>
            <Button asChild variant="outline" className="w-full"><Link to="/patient/queue"><Users className="mr-2 h-4 w-4" /> Live queue</Link></Button>
            <Button asChild variant="outline" className="w-full"><Link to="/patient/profile">Update profile</Link></Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, mono }: { icon: any; label: string; value: any; mono?: boolean }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className={`text-xl font-bold ${mono ? "font-mono" : ""}`}>{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    waiting: { label: "Waiting", cls: "bg-warning/15 text-warning-foreground border-warning/30" },
    in_progress: { label: "In progress", cls: "bg-primary/15 text-primary border-primary/30" },
    completed: { label: "Completed", cls: "bg-success/15 text-success border-success/30" },
    skipped: { label: "Skipped", cls: "bg-muted text-muted-foreground" },
    cancelled: { label: "Cancelled", cls: "bg-destructive/10 text-destructive border-destructive/30" },
  };
  const m = map[status] ?? { label: status, cls: "" };
  return <Badge variant="outline" className={m.cls}>{m.label}</Badge>;
}