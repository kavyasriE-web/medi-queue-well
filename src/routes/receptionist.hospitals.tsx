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
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Hospital, Loader2 } from "lucide-react";
import { createHospital, updateHospital, deleteHospital } from "@/lib/hospitals-admin.functions";

export const Route = createFileRoute("/receptionist/hospitals")({
  component: () => <RoleGuard role="receptionist"><Page /></RoleGuard>,
});

type HospitalRow = {
  id: string; name: string; code: string; city: string; area: string | null;
  address: string | null; phone: string | null; latitude: number | null;
  longitude: number | null; description: string | null;
};

function Page() {
  const qc = useQueryClient();
  const createFn = useServerFn(createHospital);
  const updateFn = useServerFn(updateHospital);
  const deleteFn = useServerFn(deleteHospital);

  const { data: hospitals = [], isLoading } = useQuery<HospitalRow[]>({
    queryKey: ["hospitals-admin"],
    queryFn: async () =>
      ((await supabase.from("hospitals").select("*").order("name")).data ?? []) as HospitalRow[],
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<HospitalRow | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["hospitals-admin"] });

  const collect = (f: FormData) => ({
    name: String(f.get("name")),
    code: String(f.get("code")),
    city: String(f.get("city")),
    area: String(f.get("area") ?? ""),
    address: String(f.get("address") ?? ""),
    phone: String(f.get("phone") ?? ""),
    latitude: f.get("latitude") ? Number(f.get("latitude")) : null,
    longitude: f.get("longitude") ? Number(f.get("longitude")) : null,
    description: String(f.get("description") ?? ""),
  });

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    try {
      await createFn({ data: collect(new FormData(e.currentTarget)) });
      toast.success("Hospital created");
      setCreateOpen(false); refresh();
    } catch (err: any) { toast.error(err?.message ?? "Failed"); }
    finally { setBusy(false); }
  };

  const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    try {
      await updateFn({ data: { hospital_id: editing.id, ...collect(new FormData(e.currentTarget)) } });
      toast.success("Hospital updated");
      setEditing(null); refresh();
    } catch (err: any) { toast.error(err?.message ?? "Failed"); }
    finally { setBusy(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteFn({ data: { hospital_id: id } });
      toast.success("Hospital deleted"); refresh();
    } catch (err: any) { toast.error(err?.message ?? "Failed"); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Hospitals</h1>
          <p className="text-muted-foreground">Create, edit and remove hospitals in the network.</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> New hospital</Button></DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Create hospital</DialogTitle>
              <DialogDescription>Add a hospital patients can book at.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-3">
              <HospitalFields />
              <DialogFooter>
                <Button type="submit" disabled={busy}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Hospital className="h-5 w-5" /> All hospitals</CardTitle>
          <CardDescription>{hospitals.length} total</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid place-items-center p-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : hospitals.length === 0 ? (
            <div className="rounded border border-dashed p-8 text-center text-muted-foreground">No hospitals yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr><th className="p-2">Name</th><th className="p-2">Code</th><th className="p-2">City / Area</th><th className="p-2">Lat / Lng</th><th className="p-2 text-right">Actions</th></tr>
                </thead>
                <tbody>
                  {hospitals.map((h) => (
                    <tr key={h.id} className="border-t border-border">
                      <td className="p-2 font-medium">{h.name}</td>
                      <td className="p-2 font-mono">{h.code}</td>
                      <td className="p-2">{h.city}{h.area ? ` · ${h.area}` : ""}</td>
                      <td className="p-2 text-xs text-muted-foreground">{h.latitude ?? "—"}, {h.longitude ?? "—"}</td>
                      <td className="p-2">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => setEditing(h)}><Pencil className="h-4 w-4" /></Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="destructive"><Trash2 className="h-4 w-4" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete {h.name}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This removes the hospital and cascades to its departments, doctors, and appointments. Cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(h.id)}>Delete</AlertDialogAction>
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
            <DialogTitle>Edit hospital</DialogTitle>
            <DialogDescription>Update hospital details.</DialogDescription>
          </DialogHeader>
          {editing && (
            <form onSubmit={handleUpdate} className="space-y-3">
              <HospitalFields initial={editing} />
              <DialogFooter>
                <Button type="submit" disabled={busy}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function HospitalFields({ initial }: { initial?: HospitalRow }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label>Name</Label><Input name="name" defaultValue={initial?.name} required /></div>
        <div className="space-y-1"><Label>Code (2–8)</Label><Input name="code" defaultValue={initial?.code} required maxLength={8} /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label>City</Label><Input name="city" defaultValue={initial?.city} required /></div>
        <div className="space-y-1"><Label>Area</Label><Input name="area" defaultValue={initial?.area ?? ""} /></div>
      </div>
      <div className="space-y-1"><Label>Address</Label><Input name="address" defaultValue={initial?.address ?? ""} /></div>
      <div className="space-y-1"><Label>Phone</Label><Input name="phone" defaultValue={initial?.phone ?? ""} /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label>Latitude</Label><Input name="latitude" type="number" step="any" defaultValue={initial?.latitude ?? ""} /></div>
        <div className="space-y-1"><Label>Longitude</Label><Input name="longitude" type="number" step="any" defaultValue={initial?.longitude ?? ""} /></div>
      </div>
      <div className="space-y-1"><Label>Description</Label><Textarea name="description" defaultValue={initial?.description ?? ""} rows={2} /></div>
    </>
  );
}