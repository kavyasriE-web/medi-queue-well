import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RoleGuard } from "@/components/role-guard";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "./patient.dashboard";
import { toast } from "sonner";
import { Search } from "lucide-react";

export const Route = createFileRoute("/receptionist/search")({ component: () => <RoleGuard role="receptionist"><Page /></RoleGuard> });

function Page() {
  const [q, setQ] = useState("");
  const [date, setDate] = useState("");
  const qc = useQueryClient();

  const { data: appts = [], refetch } = useQuery({
    queryKey: ["search-appts", q, date],
    queryFn: async () => {
      let query = supabase
        .from("appointments")
        .select("*, departments(name, code), doctors(profiles:profile_id(full_name)), patient:profiles!appointments_patient_id_fkey(full_name, phone, email)")
        .order("appointment_date", { ascending: false })
        .order("slot_time", { ascending: false })
        .limit(50);
      if (date) query = query.eq("appointment_date", date);
      if (q) query = query.ilike("token_code", `%${q.toUpperCase()}%`);
      return (await query).data ?? [];
    },
  });

  const cancel = async (id: string) => {
    const { error } = await supabase.from("appointments").update({ status: "cancelled" }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Cancelled"); qc.invalidateQueries({ queryKey: ["search-appts"] }); }
  };

  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl font-bold">Search Appointments</h1><p className="text-muted-foreground">By token code or date.</p></div>
      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-[1fr_180px_auto]">
          <div className="space-y-1"><Label>Token code</Label><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. GEN-001" /></div>
          <div className="space-y-1"><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="flex items-end"><Button onClick={() => refetch()}><Search className="mr-2 h-4 w-4" /> Search</Button></div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Results ({appts.length})</CardTitle></CardHeader>
        <CardContent>
          {appts.length === 0 ? <div className="rounded border border-dashed p-8 text-center text-muted-foreground">No results.</div> :
          <div className="space-y-2">
            {appts.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div>
                  <div className="flex items-center gap-2"><Badge variant="outline" className="font-mono">{a.token_code}</Badge><span className="font-medium">{a.patient?.full_name}</span><StatusBadge status={a.status as string} /></div>
                  <div className="text-xs text-muted-foreground">{a.appointment_date} · {a.slot_time?.slice(0,5)} · {a.departments?.name} · Dr. {a.doctors?.profiles?.full_name}</div>
                </div>
                {a.status === "waiting" && <Button size="sm" variant="outline" onClick={() => cancel(a.id)}>Cancel</Button>}
              </div>
            ))}
          </div>}
        </CardContent>
      </Card>
    </div>
  );
}