import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RoleGuard } from "@/components/role-guard";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, UserPlus, Calendar } from "lucide-react";
import { StatusBadge } from "./patient.dashboard";
import { toast } from "sonner";

export const Route = createFileRoute("/receptionist/dashboard")({ component: () => <RoleGuard role="receptionist"><Page /></RoleGuard> });

function Page() {
  const today = new Date().toISOString().slice(0, 10);
  const qc = useQueryClient();

  const { data: appts = [] } = useQuery({
    queryKey: ["recep-today", today],
    queryFn: async () => (await supabase
      .from("appointments")
      .select("*, departments(name, code), doctors(profiles:profile_id(full_name)), patient:profiles!appointments_patient_id_fkey(full_name, phone)")
      .eq("appointment_date", today)
      .order("slot_time")).data ?? [],
  });

  useEffect(() => {
    const ch = supabase.channel("recep-rt").on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () => {
      qc.invalidateQueries({ queryKey: ["recep-today"] });
    }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const cancel = async (id: string) => {
    const { error } = await supabase.from("appointments").update({ status: "cancelled" }).eq("id", id);
    if (error) toast.error(error.message); else toast.success("Cancelled");
  };

  const counts = {
    total: appts.length,
    waiting: appts.filter((a) => a.status === "waiting").length,
    inProgress: appts.filter((a) => a.status === "in_progress").length,
    completed: appts.filter((a) => a.status === "completed").length,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-3xl font-bold">Receptionist Dashboard</h1><p className="text-muted-foreground">All appointments for today.</p></div>
        <div className="flex gap-2">
          <Button asChild><Link to="/receptionist/walkin"><UserPlus className="mr-2 h-4 w-4" /> Walk-in</Link></Button>
          <Button asChild variant="outline"><Link to="/receptionist/search"><Search className="mr-2 h-4 w-4" /> Search</Link></Button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { l: "Today total", v: counts.total },
          { l: "Waiting", v: counts.waiting },
          { l: "In progress", v: counts.inProgress },
          { l: "Completed", v: counts.completed },
        ].map((s) => (
          <Card key={s.l}><CardContent className="p-4"><div className="text-xs text-muted-foreground">{s.l}</div><div className="text-2xl font-bold">{s.v}</div></CardContent></Card>
        ))}
      </div>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5" /> Today's appointments</CardTitle></CardHeader>
        <CardContent>
          {appts.length === 0 ? (
            <div className="rounded border border-dashed p-8 text-center text-muted-foreground">No appointments today.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr><th className="p-2">Token</th><th className="p-2">Patient</th><th className="p-2">Doctor</th><th className="p-2">Dept</th><th className="p-2">Slot</th><th className="p-2">Status</th><th className="p-2">Actions</th></tr>
                </thead>
                <tbody>
                  {appts.map((a) => (
                    <tr key={a.id} className="border-t border-border">
                      <td className="p-2"><Badge variant="outline" className="font-mono">{a.token_code}</Badge></td>
                      <td className="p-2"><div className="font-medium">{a.patient?.full_name}</div><div className="text-xs text-muted-foreground">{a.patient?.phone}</div></td>
                      <td className="p-2">Dr. {a.doctors?.profiles?.full_name}</td>
                      <td className="p-2">{a.departments?.name}</td>
                      <td className="p-2">{a.slot_time?.slice(0,5)}</td>
                      <td className="p-2"><StatusBadge status={a.status as string} /></td>
                      <td className="p-2">
                        {a.status === "waiting" && <Button size="sm" variant="outline" onClick={() => cancel(a.id)}>Cancel</Button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}