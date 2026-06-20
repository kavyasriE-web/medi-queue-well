import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RoleGuard } from "@/components/role-guard";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Settings, Activity } from "lucide-react";

export const Route = createFileRoute("/doctor/dashboard")({ component: () => <RoleGuard role="doctor"><Page /></RoleGuard> });

function Page() {
  const { user } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const { data: doctor } = useQuery({
    queryKey: ["my-doctor", user?.id], enabled: !!user,
    queryFn: async () => (await supabase.from("doctors").select("*, departments(name, code)").eq("profile_id", user!.id).maybeSingle()).data,
  });
  const { data: appts = [] } = useQuery({
    queryKey: ["dr-today-stats", doctor?.id, today], enabled: !!doctor,
    queryFn: async () => (await supabase.from("appointments").select("status").eq("doctor_id", doctor!.id).eq("appointment_date", today)).data ?? [],
  });

  if (!doctor) return <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">Your doctor profile isn't set up yet. Contact the receptionist.</div>;

  const counts = {
    total: appts.length,
    waiting: appts.filter((a) => a.status === "waiting").length,
    completed: appts.filter((a) => a.status === "completed").length,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Dr. Dashboard</h1>
          <p className="text-muted-foreground">{doctor.departments?.name} · {doctor.specialization}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild><Link to="/doctor/queue"><Users className="mr-2 h-4 w-4" /> Today's queue</Link></Button>
          <Button asChild variant="outline"><Link to="/doctor/availability"><Settings className="mr-2 h-4 w-4" /> Availability</Link></Button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Today total" v={counts.total} />
        <Stat label="Waiting" v={counts.waiting} />
        <Stat label="Completed" v={counts.completed} />
      </div>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" /> Working hours</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Info l="Hours" v={`${String(doctor.start_time).slice(0,5)} – ${String(doctor.end_time).slice(0,5)}`} />
          <Info l="Slot length" v={`${doctor.slot_minutes} min`} />
          <Info l="Max patients/day" v={String(doctor.max_patients_per_day)} />
          <Info l="Working days" v={(doctor.working_days as number[]).map((d) => ["","Mon","Tue","Wed","Thu","Fri","Sat","Sun"][d]).join(", ")} />
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, v }: { label: string; v: number }) {
  return <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">{label}</div><div className="text-2xl font-bold">{v}</div></CardContent></Card>;
}
function Info({ l, v }: { l: string; v: string }) { return <div><div className="text-xs text-muted-foreground">{l}</div><div className="font-medium">{v}</div></div>; }