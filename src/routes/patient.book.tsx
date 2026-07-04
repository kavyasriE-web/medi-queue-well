import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calendar as CalIcon, CheckCircle2, Loader2, Hospital as HospitalIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RoleGuard } from "@/components/role-guard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { generateSlots, dayOfWeekIso } from "@/lib/slots";
import { toast } from "sonner";

export const Route = createFileRoute("/patient/book")({
  validateSearch: (s: Record<string, unknown>) => ({
    hospital: typeof s.hospital === "string" ? s.hospital : undefined,
  }),
  component: () => <RoleGuard role="patient"><Page /></RoleGuard>,
});

function Page() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [step, setStep] = useState(search.hospital ? 2 : 1);
  const [hospitalId, setHospitalId] = useState(search.hospital ?? "");
  const [departmentId, setDepartmentId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [slot, setSlot] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState<any>(null);

  const { data: hospitals = [] } = useQuery({
    queryKey: ["hospitals-book"],
    queryFn: async () =>
      (await supabase.from("hospitals").select("id,name,city,area,code").order("name")).data ?? [],
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments", hospitalId],
    enabled: !!hospitalId,
    queryFn: async () =>
      (await supabase.from("departments").select("*").eq("hospital_id", hospitalId).order("name")).data ?? [],
  });

  const hospital = hospitals.find((h: any) => h.id === hospitalId);

  useEffect(() => {
    // If hospital changes, reset downstream selections
    setDepartmentId("");
    setDoctorId("");
  }, [hospitalId]);

  const { data: doctors = [] } = useQuery<any[]>({
    queryKey: ["doctors", hospitalId, departmentId],
    enabled: !!departmentId,
    queryFn: async () => (await supabase
      .from("doctors")
      .select("*, profiles:profile_id(full_name)")
      .eq("hospital_id", hospitalId)
      .eq("department_id", departmentId)).data ?? [],
  });

  const doctor = doctors.find((d) => d.id === doctorId);

  const { data: bookedSlots = [] } = useQuery<string[]>({
    queryKey: ["booked", doctorId, date],
    enabled: !!doctorId && !!date,
    queryFn: async () => {
      const { data } = await supabase
        .from("appointments")
        .select("slot_time")
        .eq("doctor_id", doctorId)
        .eq("appointment_date", date)
        .neq("status", "cancelled");
      return (data ?? []).map((x) => x.slot_time as string);
    },
  });

  const slots = useMemo(() => {
    if (!doctor) return [];
    const dow = dayOfWeekIso(date);
    if (!(doctor.working_days as number[]).includes(dow)) return [];
    return generateSlots(doctor.start_time as string, doctor.end_time as string, doctor.slot_minutes as number, bookedSlots);
  }, [doctor, bookedSlots, date]);

  const submit = async () => {
    if (!user) return;
    setBusy(true);
    const { data, error } = await supabase.from("appointments").insert({
      patient_id: user.id, hospital_id: hospitalId, doctor_id: doctorId, department_id: departmentId,
      appointment_date: date, slot_time: slot, symptoms,
      token_number: 0, token_code: "",
    } as any).select("*, departments(name, code), hospitals(name, city)").single();
    if (error) { toast.error(error.message); setBusy(false); return; }
    setConfirmed(data); setBusy(false); toast.success("Appointment booked!");
  };

  if (confirmed) {
    return (
      <div className="mx-auto max-w-xl">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-success/15 text-success"><CheckCircle2 className="h-7 w-7" /></div>
            <CardTitle className="mt-2 text-2xl">Appointment confirmed</CardTitle>
            <CardDescription>Save your token and arrive a few minutes before your slot.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-6">
              <div className="text-xs uppercase text-muted-foreground">Your token</div>
              <div className="mt-1 font-mono text-5xl font-bold text-primary">{confirmed.token_code}</div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-left text-sm">
              <Info label="Hospital" value={confirmed.hospitals?.name} />
              <Info label="Department" value={confirmed.departments?.name} />
              <Info label="Date" value={confirmed.appointment_date} />
              <Info label="Slot" value={String(confirmed.slot_time).slice(0,5)} />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => navigate({ to: "/patient/queue" })} className="flex-1">View live queue</Button>
              <Button variant="outline" onClick={() => navigate({ to: "/patient/appointments" })} className="flex-1">My appointments</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Book an appointment</h1>
        <p className="text-muted-foreground">Step {step} of 6</p>
      </div>
      <div className="flex gap-1">
        {[1,2,3,4,5,6].map((n) => <div key={n} className={`h-1.5 flex-1 rounded ${n <= step ? "bg-primary" : "bg-muted"}`} />)}
      </div>
      <Card>
        <CardContent className="space-y-4 p-6">
          {step === 1 && (
            <div className="space-y-3">
              <Label>Hospital</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {hospitals.map((h: any) => (
                  <button key={h.id} onClick={() => { setHospitalId(h.id); setStep(2); }}
                    className={`rounded-lg border p-4 text-left transition hover:border-primary ${hospitalId === h.id ? "border-primary bg-primary/5" : "border-border"}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold flex items-center gap-2"><HospitalIcon className="h-4 w-4 text-primary" /> {h.name}</span>
                      <Badge variant="outline" className="font-mono">{h.code}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{h.area ? `${h.area}, ` : ""}{h.city}</p>
                  </button>
                ))}
              </div>
              <div className="pt-2 text-sm">
                <button onClick={() => navigate({ to: "/patient/hospitals" })} className="text-primary hover:underline">
                  Or find one near you →
                </button>
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-3">
              <Label>Department</Label>
              {hospital && <p className="text-xs text-muted-foreground">Hospital: {hospital.name}</p>}
              {departments.length === 0 && <div className="rounded border border-dashed p-4 text-sm text-muted-foreground">No departments in this hospital yet.</div>}
              <div className="grid gap-2 sm:grid-cols-2">
                {departments.map((d) => (
                  <button key={d.id} onClick={() => { setDepartmentId(d.id); setStep(3); }}
                    className={`rounded-lg border p-4 text-left transition hover:border-primary ${departmentId === d.id ? "border-primary bg-primary/5" : "border-border"}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{d.name}</span>
                      <Badge variant="outline" className="font-mono">{d.code}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{d.description}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-3">
              <Label>Doctor</Label>
              {doctors.length === 0 && <div className="rounded border border-dashed p-4 text-sm text-muted-foreground">No doctors registered in this department yet.</div>}
              <div className="grid gap-2">
                {doctors.map((d) => (
                  <button key={d.id} onClick={() => { setDoctorId(d.id); setStep(4); }}
                    className={`rounded-lg border p-3 text-left hover:border-primary ${doctorId === d.id ? "border-primary bg-primary/5" : "border-border"}`}>
                    <div className="font-semibold">Dr. {d.profiles?.full_name}</div>
                    <div className="text-xs text-muted-foreground">{d.specialization} · {String(d.start_time).slice(0,5)}–{String(d.end_time).slice(0,5)}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
          {step === 4 && (
            <div className="space-y-3">
              <Label>Date</Label>
              <Input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
              <Button onClick={() => setStep(5)} disabled={!date}>Next</Button>
            </div>
          )}
          {step === 5 && (
            <div className="space-y-3">
              <Label>Available slots</Label>
              {slots.length === 0 ? (
                <div className="rounded border border-dashed p-4 text-sm text-muted-foreground">Doctor not available on this day or no free slots. Pick another date.</div>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {slots.map((s) => (
                    <button key={s} onClick={() => { setSlot(s); setStep(6); }}
                      className={`rounded-md border px-2 py-2 text-sm hover:border-primary ${slot === s ? "border-primary bg-primary/10" : "border-border"}`}>
                      {s.slice(0,5)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {step === 6 && (
            <div className="space-y-3">
              <Label>Symptoms / reason for visit</Label>
              <Textarea value={symptoms} onChange={(e) => setSymptoms(e.target.value)} rows={4} placeholder="Describe your symptoms…" />
              <div className="rounded-lg bg-muted p-3 text-sm">
                <div className="font-medium">Summary</div>
                <div className="mt-1 text-muted-foreground">
                  {hospital?.name} · {departments.find((d) => d.id === departmentId)?.name} · Dr. {doctor?.profiles?.full_name} · {date} · {slot.slice(0,5)}
                </div>
              </div>
              <Button onClick={submit} disabled={busy} className="w-full">
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}<CalIcon className="mr-1 h-4 w-4" /> Confirm appointment
              </Button>
            </div>
          )}
          {step > 1 && <Button variant="ghost" size="sm" onClick={() => setStep(step - 1)}>← Back</Button>}
        </CardContent>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: any }) {
  return <div><div className="text-xs text-muted-foreground">{label}</div><div className="font-medium">{value}</div></div>;
}