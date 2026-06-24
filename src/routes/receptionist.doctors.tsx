import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RoleGuard } from "@/components/role-guard";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Stethoscope, Loader2 } from "lucide-react";
import {
  createDoctor, updateDoctor, deleteDoctor,
} from "@/lib/doctors-admin.functions";

export const Route = createFileRoute("/receptionist/doctors")({
  component: () => <RoleGuard role="receptionist"><Page /></RoleGuard>,
});

const DAYS = [["Mon", 1], ["Tue", 2], ["Wed", 3], ["Thu", 4], ["Fri", 5], ["Sat", 6], ["Sun", 7]] as const;

type DoctorRow = {
  id: string; profile_id: string; department_id: string; specialization: string | null;
  start_time: string; end_time: string; slot_minutes: number; max_patients_per_day: number;
  working_days: number[];
  departments: { name: string; code: string } | null;
  profiles: { full_name: string; email: string | null; phone: string | null } | null;
};

function Page() {
  const qc = useQueryClient();
  const createFn = useServerFn(createDoctor);
  const updateFn = useServerFn(updateDoctor);
  const deleteFn = useServerFn(deleteDoctor);

  const { data: departments = [] } = useQuery({
    queryKey: ["depts"],
    queryFn: async () => (await supabase.from("departments").select("*").order("name")).data ?? [],
  });
  const { data: doctors = [], isLoading } = useQuery<DoctorRow[]>({
    queryKey: ["doctors-admin"],
    queryFn: async () => (await supabase
      .from("doctors")
      .select("*, departments(name,code), profiles:profile_id(full_name,email,phone)")
      .order("created_at", { ascending: false })).data as DoctorRow[] ?? [],
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<DoctorRow | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: ["doctors-admin"] });

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const working_days = DAYS.map(([, n]) => n as number).filter((n) => f.get(`day_${n}`) === "on");
    setBusy(true);
    try {
      await createFn({
        data: {
          email: String(f.get("email")),
          password: String(f.get("password")),
          full_name: String(f.get("full_name")),
          phone: String(f.get("phone") ?? ""),
          department_id: String(f.get("department_id")),
          specialization: String(f.get("specialization") ?? ""),
          start_time: String(f.get("start_time")),
          end_time: String(f.get("end_time")),
          slot_minutes: Number(f.get("slot_minutes")),
          max_patients_per_day: Number(f.get("max_patients_per_day")),
          working_days,
        },
      });
      toast.success("Doctor created");
      setCreateOpen(false);
      refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to create doctor");
    } finally {
      setBusy(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editing) return;
    const f = new FormData(e.currentTarget);
    const working_days = DAYS.map(([, n]) => n as number).filter((n) => f.get(`day_${n}`) === "on");
    setBusy(true);
    try {
      await updateFn({
        data: {
          doctor_id: editing.id,
          full_name: String(f.get("full_name")),
          phone: String(f.get("phone") ?? ""),
          department_id: String(f.get("department_id")),
          specialization: String(f.get("specialization") ?? ""),
          start_time: String(f.get("start_time")),
          end_time: String(f.get("end_time")),
          slot_minutes: Number(f.get("slot_minutes")),
          max_patients_per_day: Number(f.get("max_patients_per_day")),
          working_days,
        },
      });
      toast.success("Doctor updated");
      setEditing(null);
      refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update doctor");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteFn({ data: { doctor_id: id } });
      toast.success("Doctor deleted");
      refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to delete doctor");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Doctors</h1>
          <p className="text-muted-foreground">Create, edit and remove doctor accounts.</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> New doctor</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Create doctor</DialogTitle>
              <DialogDescription>The doctor can sign in immediately with this email and password.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-3">
              <DoctorFormFields departments={departments} />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label>Email</Label><Input name="email" type="email" required /></div>
                <div className="space-y-1"><Label>Password</Label><Input name="password" type="password" required minLength={6} /></div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={busy}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create doctor
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Stethoscope className="h-5 w-5" /> All doctors</CardTitle>
          <CardDescription>{doctors.length} total</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid place-items-center p-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : doctors.length === 0 ? (
            <div className="rounded border border-dashed p-8 text-center text-muted-foreground">No doctors yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr><th className="p-2">Name</th><th className="p-2">Department</th><th className="p-2">Specialization</th><th className="p-2">Hours</th><th className="p-2">Contact</th><th className="p-2 text-right">Actions</th></tr>
                </thead>
                <tbody>
                  {doctors.map((d) => (
                    <tr key={d.id} className="border-t border-border">
                      <td className="p-2 font-medium">Dr. {d.profiles?.full_name}</td>
                      <td className="p-2">{d.departments?.name}</td>
                      <td className="p-2">{d.specialization || "—"}</td>
                      <td className="p-2">{String(d.start_time).slice(0,5)}–{String(d.end_time).slice(0,5)}</td>
                      <td className="p-2"><div>{d.profiles?.email}</div><div className="text-xs text-muted-foreground">{d.profiles?.phone}</div></td>
                      <td className="p-2">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => setEditing(d)}><Pencil className="h-4 w-4" /></Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="destructive"><Trash2 className="h-4 w-4" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Dr. {d.profiles?.full_name}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This removes the doctor's login and all their appointments. This cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(d.id)}>Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit doctor</DialogTitle>
            <DialogDescription>Update the doctor's details and schedule.</DialogDescription>
          </DialogHeader>
          {editing && (
            <form onSubmit={handleUpdate} className="space-y-3">
              <DoctorFormFields departments={departments} initial={editing} />
              <DialogFooter>
                <Button type="submit" disabled={busy}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save changes
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DoctorFormFields({ departments, initial }: { departments: any[]; initial?: DoctorRow }) {
  const initDays = initial?.working_days ?? [1, 2, 3, 4, 5];
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label>Full name</Label><Input name="full_name" defaultValue={initial?.profiles?.full_name ?? ""} required /></div>
        <div className="space-y-1"><Label>Phone</Label><Input name="phone" defaultValue={initial?.profiles?.phone ?? ""} /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Department</Label>
          <Select name="department_id" defaultValue={initial?.department_id} required>
            <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
            <SelectContent>
              {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1"><Label>Specialization</Label><Input name="specialization" defaultValue={initial?.specialization ?? ""} /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label>Start time</Label><Input name="start_time" type="time" defaultValue={String(initial?.start_time ?? "09:00").slice(0,5)} required /></div>
        <div className="space-y-1"><Label>End time</Label><Input name="end_time" type="time" defaultValue={String(initial?.end_time ?? "17:00").slice(0,5)} required /></div>
        <div className="space-y-1"><Label>Slot length (min)</Label><Input name="slot_minutes" type="number" min={5} max={120} defaultValue={initial?.slot_minutes ?? 15} required /></div>
        <div className="space-y-1"><Label>Max patients / day</Label><Input name="max_patients_per_day" type="number" min={1} defaultValue={initial?.max_patients_per_day ?? 30} required /></div>
      </div>
      <div>
        <Label className="mb-2 block">Working days</Label>
        <div className="flex flex-wrap gap-2">
          {DAYS.map(([lbl, n]) => (
            <label key={n} className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
              <input type="checkbox" name={`day_${n}`} defaultChecked={initDays.includes(n as number)} className="h-4 w-4 accent-primary" />
              {lbl}
            </label>
          ))}
        </div>
      </div>
    </>
  );
}