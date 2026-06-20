import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Clock, Users } from "lucide-react";

export function LiveQueueBoard({ highlightToken }: { highlightToken?: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["live-queue", today],
    queryFn: async () => {
      const { data: depts } = await supabase.from("departments").select("*").order("name");
      const { data: appts } = await supabase
        .from("appointments")
        .select("id, department_id, status, token_number, token_code, slot_time, appointment_date")
        .eq("appointment_date", today)
        .order("token_number");
      return { depts: depts ?? [], appts: appts ?? [] };
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("public-queue")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () => {
        qc.invalidateQueries({ queryKey: ["live-queue"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  if (!data) return <div className="text-muted-foreground">Loading live queue…</div>;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {data.depts.map((d) => {
        const dAppts = data.appts.filter((a) => a.department_id === d.id && a.status !== "cancelled" && a.status !== "completed");
        const current = data.appts.find((a) => a.department_id === d.id && a.status === "in_progress");
        const waiting = dAppts.filter((a) => a.status === "waiting");
        return (
          <Card key={d.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{d.name}</CardTitle>
                <Badge variant="outline" className="font-mono">{d.code}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-primary/5 p-4 text-center">
                <div className="text-xs uppercase text-muted-foreground">Now serving</div>
                <div className="mt-1 font-mono text-3xl font-bold text-primary">
                  {current ? current.token_code : "—"}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center text-sm">
                <div className="rounded-md bg-muted p-2">
                  <Users className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
                  <div className="font-semibold">{waiting.length}</div>
                  <div className="text-xs text-muted-foreground">Waiting</div>
                </div>
                <div className="rounded-md bg-muted p-2">
                  <Clock className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
                  <div className="font-semibold">~{waiting.length * d.avg_wait_minutes}m</div>
                  <div className="text-xs text-muted-foreground">Est. wait</div>
                </div>
              </div>
              <div>
                <div className="mb-2 text-xs font-medium text-muted-foreground">Up next</div>
                <div className="flex flex-wrap gap-1">
                  {waiting.slice(0, 8).map((a) => (
                    <Badge
                      key={a.id}
                      variant={highlightToken === a.token_code ? "default" : "secondary"}
                      className="font-mono text-xs"
                    >
                      {a.token_code}
                    </Badge>
                  ))}
                  {waiting.length === 0 && <span className="text-xs text-muted-foreground">No patients waiting</span>}
                </div>
              </div>
              {highlightToken && dAppts.some((a) => a.token_code === highlightToken) && (
                <div className="rounded-md border border-primary/30 bg-primary/5 p-2 text-center text-xs">
                  <Activity className="mr-1 inline h-3 w-3 text-primary" />
                  Your token <span className="font-mono font-bold">{highlightToken}</span> —
                  {(() => {
                    const idx = waiting.findIndex((a) => a.token_code === highlightToken);
                    return idx >= 0 ? ` ${idx} patient(s) ahead · ~${idx * d.avg_wait_minutes}m wait` : " in progress";
                  })()}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}