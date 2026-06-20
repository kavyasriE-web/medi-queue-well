import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RoleGuard } from "@/components/role-guard";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

export const Route = createFileRoute("/doctor/availability")({ component: () => <RoleGuard role="doctor"><Page /></RoleGuard> });

const DAYS = [["Mon",1],["Tue",2],["Wed",3],["Thu",4],["Fri",5],["Sat",6],["Sun",7]] as const;

function Page() {
  const { user } = useAuth();
  const [doctorId, setId] = useState<string>("");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const [slot, setSlot] = useState(15);
  const [maxPer, setMax] = useState(30);
  const [days, setDays] = useState<number[]>([1,2,3,4,5]);
  const [specialization, setSpec] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("doctors").select("*").eq("profile_id", user.id).maybeSingle().then(({ data }) => {
      if (!data) return;
      setId(data.id);
      setStart(String(data.start_time).slice(0,5));
      setEnd(String(data.end_time).slice(0,5));
      setSlot(data.slot_minutes);
      setMax(data.max_patients_per_day);
      setDays(data.working_days as number[]);
      setSpec(data.specialization ?? "");
    });
  }, [user]);

  const save = async () => {
    if (!doctorId) return toast.error("Doctor profile missing");
    setBusy(true);
    const { error } = await supabase.from("doctors").update({
      start_time: start + ":00", end_time: end + ":00",
      slot_minutes: slot, max_patients_per_day: maxPer,
      working_days: days, specialization,
    }).eq("id", doctorId);
    setBusy(false);
    if (error) toast.error(error.message); else toast.success("Saved");
  };

  const toggleDay = (d: number) => setDays((cur) => cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort());

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div><h1 className="text-3xl font-bold">Availability</h1><p className="text-muted-foreground">Used to generate bookable slots.</p></div>
      <Card>
        <CardHeader><CardTitle>Schedule</CardTitle><CardDescription>Patients can only book slots within these hours on these days.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1"><Label>Specialization</Label><Input value={specialization} onChange={(e) => setSpec(e.target.value)} /></div>
          <div>
            <Label className="mb-2 block">Working days</Label>
            <div className="flex flex-wrap gap-2">
              {DAYS.map(([lbl, n]) => (
                <label key={n} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${days.includes(n as number) ? "border-primary bg-primary/5" : "border-border"}`}>
                  <Checkbox checked={days.includes(n as number)} onCheckedChange={() => toggleDay(n as number)} />
                  {lbl}
                </label>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label>Start time</Label><Input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div className="space-y-1"><Label>End time</Label><Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
            <div className="space-y-1"><Label>Slot length (min)</Label><Input type="number" min={5} max={120} value={slot} onChange={(e) => setSlot(parseInt(e.target.value) || 15)} /></div>
            <div className="space-y-1"><Label>Max patients / day</Label><Input type="number" min={1} value={maxPer} onChange={(e) => setMax(parseInt(e.target.value) || 30)} /></div>
          </div>
          <Button onClick={save} disabled={busy}>Save changes</Button>
        </CardContent>
      </Card>
    </div>
  );
}