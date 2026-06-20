import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Hospital, Stethoscope, User as UserIcon, UserPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, rolePath, type Role } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/auth/$role")({
  validateSearch: (s: Record<string, unknown>) => ({ tab: (s.tab as string) === "signup" ? "signup" : "login" }),
  component: AuthPage,
});

const VALID_ROLES: Role[] = ["patient", "receptionist", "doctor"];
const roleMeta = {
  patient: { icon: UserIcon, title: "Patient Portal", desc: "Book and track your appointments." },
  receptionist: { icon: UserPlus, title: "Receptionist Portal", desc: "Manage walk-ins and appointments." },
  doctor: { icon: Stethoscope, title: "Doctor Portal", desc: "Run your daily patient queue." },
};

function AuthPage() {
  const { role } = useParams({ from: "/auth/$role" });
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { user, role: userRole, loading, refreshRole } = useAuth();
  const [tab, setTab] = useState<"login" | "signup">(search.tab);
  const [busy, setBusy] = useState(false);

  const safeRole = (VALID_ROLES.includes(role as Role) ? role : "patient") as Role;
  const Meta = roleMeta[safeRole];

  useEffect(() => {
    if (!loading && user && userRole) {
      navigate({ to: rolePath[userRole] });
    }
  }, [user, userRole, loading, navigate]);

  const { data: departments = [] } = useQuery({
    queryKey: ["departments-list"],
    queryFn: async () => (await supabase.from("departments").select("*").order("name")).data ?? [],
    enabled: safeRole === "doctor" && tab === "signup",
  });

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: String(f.get("email")), password: String(f.get("password")),
    });
    if (error) { toast.error(error.message); setBusy(false); return; }
    await refreshRole();
    toast.success("Welcome back!");
    setBusy(false);
  };

  const handleSignup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const email = String(f.get("email"));
    const password = String(f.get("password"));
    const full_name = String(f.get("full_name"));
    const phone = String(f.get("phone") ?? "");
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { full_name, phone, role: safeRole },
      },
    });
    if (error) { toast.error(error.message); setBusy(false); return; }

    if (safeRole === "doctor" && data.user) {
      const department_id = String(f.get("department_id"));
      const specialization = String(f.get("specialization") ?? "");
      setTimeout(async () => {
        await supabase.from("doctors").insert({
          profile_id: data.user!.id, department_id, specialization,
        });
      }, 800);
    }

    toast.success("Account created! You're signed in.");
    setBusy(false);
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between p-12 text-primary-foreground lg:flex" style={{ background: "var(--gradient-hero)" }}>
        <Link to="/" className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-white/15"><Hospital className="h-5 w-5" /></div>
          <span className="text-lg font-bold">MediQueue</span>
        </Link>
        <div>
          <h2 className="text-4xl font-bold leading-tight">{Meta.title}</h2>
          <p className="mt-2 max-w-md text-lg opacity-90">{Meta.desc}</p>
        </div>
        <p className="text-sm opacity-70">© {new Date().getFullYear()} MediQueue Hospital</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary"><Meta.icon className="h-5 w-5" /></div>
            <CardTitle className="mt-2">{Meta.title}</CardTitle>
            <CardDescription>{Meta.desc}</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={tab} onValueChange={(v) => setTab(v as "login" | "signup")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Login</TabsTrigger>
                <TabsTrigger value="signup">Sign up</TabsTrigger>
              </TabsList>
              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-3">
                  <div className="space-y-1"><Label>Email</Label><Input name="email" type="email" required /></div>
                  <div className="space-y-1"><Label>Password</Label><Input name="password" type="password" required minLength={6} /></div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Login
                  </Button>
                </form>
              </TabsContent>
              <TabsContent value="signup">
                <form onSubmit={handleSignup} className="space-y-3">
                  <div className="space-y-1"><Label>Full name</Label><Input name="full_name" required /></div>
                  <div className="space-y-1"><Label>Phone</Label><Input name="phone" /></div>
                  <div className="space-y-1"><Label>Email</Label><Input name="email" type="email" required /></div>
                  <div className="space-y-1"><Label>Password</Label><Input name="password" type="password" required minLength={6} /></div>
                  {safeRole === "doctor" && (
                    <>
                      <div className="space-y-1">
                        <Label>Department</Label>
                        <Select name="department_id" required>
                          <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                          <SelectContent>
                            {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1"><Label>Specialization</Label><Input name="specialization" placeholder="e.g. Interventional Cardiologist" /></div>
                    </>
                  )}
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create account
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
            <div className="mt-6 flex flex-wrap justify-center gap-3 text-xs text-muted-foreground">
              {VALID_ROLES.filter((r) => r !== safeRole).map((r) => (
                <Link key={r} to="/auth/$role" params={{ role: r }} className="hover:text-primary">
                  {r === "patient" ? "Patient" : r === "doctor" ? "Doctor" : "Receptionist"} login
                </Link>
              ))}
              <Link to="/" className="hover:text-primary">← Back to home</Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}