import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RoleGuard } from "@/components/role-guard";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/patient/profile")({ component: () => <RoleGuard role="patient"><Page /></RoleGuard> });

function Page() {
  const { user } = useAuth();
  const [full_name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle().then(({ data }) => {
      if (data) { setName(data.full_name ?? ""); setPhone(data.phone ?? ""); }
    });
  }, [user]);

  const save = async () => {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase.from("profiles").update({ full_name, phone }).eq("id", user.id);
    setBusy(false);
    if (error) toast.error(error.message); else toast.success("Profile updated");
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div><h1 className="text-3xl font-bold">Profile</h1><p className="text-muted-foreground">Keep your contact details up to date.</p></div>
      <Card>
        <CardHeader><CardTitle>Personal info</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1"><Label>Email</Label><Input value={user?.email ?? ""} disabled /></div>
          <div className="space-y-1"><Label>Full name</Label><Input value={full_name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1"><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <Button onClick={save} disabled={busy}>Save changes</Button>
        </CardContent>
      </Card>
    </div>
  );
}