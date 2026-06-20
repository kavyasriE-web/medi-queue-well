import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RoleGuard } from "@/components/role-guard";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { LiveQueueBoard } from "@/components/live-queue-board";

export const Route = createFileRoute("/patient/queue")({ component: () => <RoleGuard role="patient"><Page /></RoleGuard> });

function Page() {
  const { user } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const { data: myToday } = useQuery({
    queryKey: ["my-today", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase
      .from("appointments").select("token_code")
      .eq("patient_id", user!.id).eq("appointment_date", today)
      .neq("status", "cancelled").neq("status", "completed").limit(1).maybeSingle()).data,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Live Queue</h1>
        <p className="text-muted-foreground">Your token is highlighted. Updates automatically.</p>
      </div>
      <LiveQueueBoard highlightToken={myToday?.token_code} />
    </div>
  );
}