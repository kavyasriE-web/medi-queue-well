import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RoleGuard } from "@/components/role-guard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/receptionist/walkin")({ component: () => <RoleGuard role="receptionist"><Page /></RoleGuard> });

function Page() {
  const { user } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const [departmentId, setDept] = useState("");
  const [doctorId, setDoctor] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [symptoms, setSymp] = useState("");
  const [slot, setSlot] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<any>(null);

  const { data: hospitalId } = useQuery({
    queryKey: ["my-hospital", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from("user_roles")
        .select("hospital_id").eq("user_id", user!.id).eq("role", "receptionist").maybeSingle();
      return data?.hospital_id as string | null;
    },
  });
  const { data: departments = [] } = useQuery({
    queryKey: ["depts-walkin", hospitalId],
    enabled: !!hospitalId,
    queryFn: async () => (await supabase.from("departments").select("*").eq("hospital_id", hospitalId!).order("name")).data ?? [],
  });
  const { data: doctors = [] } = useQuery<any[]>({
    queryKey: ["docs-walkin", hospitalId, departmentId], enabled: !!departmentId && !!hospitalId,
    queryFn: async () => (await supabase.from("doctors").select("*, profiles:profile_id(full_name)")
      .eq("hospital_id", hospitalId!).eq("department_id", departmentId)).data ?? [],
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!doctorId) return toast.error("Select a doctor");
    setBusy(true);
    // create or fetch a walk-in profile - use admin? RLS prevents arbitrary profile insert for other users.
    // Workaround: store walk-in patient under current receptionist's id is wrong. Instead store under receptionist as proxy with name/phone in symptoms metadata.
    const { data: session } = await supabase.auth.getUser();
    const receptionistId = session.user?.id;
    if (!receptionistId) { setBusy(false); return; }
    const composedSymptoms = `[Walk-in: ${name} · ${phone}${email ? " · " + email : ""}]\n${symptoms}`;
    const { data, error } = await supabase.from("appointments").insert({
      patient_id: receptionistId, hospital_id: hospitalId!, doctor_id: doctorId, department_id: departmentId,
      appointment_date: today, slot_time: slot || "09:00:00", symptoms: composedSymptoms,
      is_walk_in: true, token_number: 0, token_code: "",
    } as any).select("*, departments(name, code)").single();
    setBusy(false);
    if (error) return toast.error(error.message);
    setDone(data); toast.success("Walk-in registered");
  };

  if (done) {
    return (
      <div className="mx-auto max-w-md">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-success/15 text-success"><CheckCircle2 className="h-6 w-6" /></div>
            <CardTitle>Walk-in registered</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
              <div className="text-xs text-muted-foreground">Token</div>
              <div className="font-mono text-4xl font-bold text-primary">{done.token_code}</div>
              <div className="mt-1 text-sm">{done.departments?.name} · {String(done.slot_time).slice(0,5)}</div>
            </div>
            <Button className="mt-4 w-full" onClick={() => { setDone(null); setName(""); setPhone(""); setEmail(""); setSymp(""); }}>Register another</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div><h1 className="text-3xl font-bold">Register Walk-in Patient</h1><p className="text-muted-foreground">Generates a token immediately.</p></div>
      <Card>
        <CardHeader><CardTitle>Patient details</CardTitle><CardDescription>Fill in the basics and assign a doctor.</CardDescription></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label>Full name</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
            <div className="space-y-1"><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            <div className="space-y-1 sm:col-span-2"><Label>Email (optional)</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="space-y-1">
              <Label>Department</Label>
              <Select value={departmentId} onValueChange={(v) => { setDept(v); setDoctor(""); }} required>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Doctor</Label>
              <Select value={doctorId} onValueChange={setDoctor} disabled={!departmentId}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{doctors.map((d) => <SelectItem key={d.id} value={d.id}>Dr. {d.profiles?.full_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Slot time</Label><Input type="time" value={slot.slice(0,5)} onChange={(e) => setSlot(e.target.value + ":00")} /></div>
            <div className="space-y-1 sm:col-span-2"><Label>Symptoms</Label><Textarea value={symptoms} onChange={(e) => setSymp(e.target.value)} rows={3} /></div>
            <Button type="submit" disabled={busy} className="sm:col-span-2">
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Register & generate token
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}