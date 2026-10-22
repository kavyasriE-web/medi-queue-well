import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Hospital, Stethoscope, User as UserIcon, UserPlus, Loader2, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, rolePath, type Role } from "@/lib/auth";
import { createMyHospital } from "@/lib/hospitals-admin.functions";
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
  const createMyHospitalFn = useServerFn(createMyHospital);
  const [hospitalMode, setHospitalMode] = useState<"existing" | "new">("existing");
  const [newLat, setNewLat] = useState("");
  const [newLng, setNewLng] = useState("");
  const [pendingSetup, setPendingSetup] = useState(false);

  const safeRole = (VALID_ROLES.includes(role as Role) ? role : "patient") as Role;
  const Meta = roleMeta[safeRole];

  useEffect(() => {
    if (!loading && user && userRole && !pendingSetup) {
      navigate({ to: rolePath[userRole] });
    }
  }, [user, userRole, loading, pendingSetup, navigate]);

  const fillGps = () => {
    if (!("geolocation" in navigator)) { toast.error("Location not supported in this browser."); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setNewLat(pos.coords.latitude.toFixed(6));
        setNewLng(pos.coords.longitude.toFixed(6));
        toast.success("Location captured for the new hospital");
      },
      (err) => toast.error(err.message || "Could not get your location"),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const { data: departments = [] } = useQuery({
    queryKey: ["departments-list"],
    queryFn: async () => (await supabase.from("departments").select("*").order("name")).data ?? [],
    enabled: safeRole === "doctor" && tab === "signup",
  });

  const { data: hospitals = [] } = useQuery({
    queryKey: ["hospitals-signup"],
    queryFn: async () =>
      (await supabase.from("hospitals").select("id,name,city").order("name")).data ?? [],
    enabled: (safeRole === "doctor" || safeRole === "receptionist") && tab === "signup",
  });

  const [signupHospital, setSignupHospital] = useState<string>("");
  const doctorDepartments = departments.filter((d: any) =>
    signupHospital ? d.hospital_id === signupHospital : true,
  );

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
    const hospital_id = String(f.get("hospital_id") ?? "");
    const useNewHospital = safeRole === "receptionist" && hospitalMode === "new";
    if ((safeRole === "receptionist" || safeRole === "doctor") && !useNewHospital && !hospital_id) {
      toast.error("Please select a hospital");
      setBusy(false);
      return;
    }
    if (useNewHospital && (!String(f.get("new_name") ?? "") || !String(f.get("new_code") ?? "") || !String(f.get("new_city") ?? ""))) {
      toast.error("Please fill in the new hospital details");
      setBusy(false);
      return;
    }
    if (useNewHospital) setPendingSetup(true);
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { full_name, phone, role: safeRole, hospital_id: hospital_id || null },
      },
    });
    if (error) { toast.error(error.message); setPendingSetup(false); setBusy(false); return; }

    if (useNewHospital && data.user) {
      try {
        await createMyHospitalFn({ data: {
          name: String(f.get("new_name")),
          code: String(f.get("new_code")),
          city: String(f.get("new_city")),
          area: String(f.get("new_area") ?? ""),
          address: String(f.get("new_address") ?? ""),
          phone,
          latitude: newLat ? Number(newLat) : null,
          longitude: newLng ? Number(newLng) : null,
          description: "",
        }});
        toast.success("Hospital created and linked to your account!");
        await refreshRole();
        setPendingSetup(false);
        setBusy(false);
        navigate({ to: rolePath.receptionist });
        return;
      } catch (err: any) {
        toast.error(err?.message ?? "Hospital setup failed — add it from the Hospitals page.");
        setPendingSetup(false);
        setBusy(false);
        navigate({ to: "/receptionist/hospitals" });
        return;
      }
    }

    if (safeRole === "doctor" && data.user) {
      const department_id = String(f.get("department_id"));
      const specialization = String(f.get("specialization") ?? "");
      setTimeout(async () => {
        await supabase.from("doctors").insert({
          profile_id: data.user!.id, hospital_id, department_id, specialization,
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
          <h2 className="text-4xl font-bold leading-tight text-primary-foreground">{Meta.title}</h2>
          <p className="mt-2 max-w-md text-lg text-primary-foreground opacity-90">{Meta.desc}</p>
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
                  {safeRole === "receptionist" && (
                    <div className="space-y-1">
                      <Label>Hospital</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <Button type="button" variant={hospitalMode === "existing" ? "default" : "outline"} onClick={() => setHospitalMode("existing")}>Choose existing</Button>
                        <Button type="button" variant={hospitalMode === "new" ? "default" : "outline"} onClick={() => setHospitalMode("new")}>Create new</Button>
                      </div>
                    </div>
                  )}
                  {(safeRole === "doctor" || (safeRole === "receptionist" && hospitalMode === "existing")) && (
                    <div className="space-y-1">
                      <Label>Hospital</Label>
                      <Select name="hospital_id" value={signupHospital} onValueChange={setSignupHospital} required>
                        <SelectTrigger><SelectValue placeholder="Select your hospital" /></SelectTrigger>
                        <SelectContent>
                          {hospitals.map((h: any) => (
                            <SelectItem key={h.id} value={h.id}>{h.name} — {h.city}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {safeRole === "receptionist" && hospitalMode === "new" && (
                    <>
                      <div className="space-y-1"><Label>New hospital name</Label><Input name="new_name" required /></div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1"><Label>Code (2–8)</Label><Input name="new_code" required maxLength={8} /></div>
                        <div className="space-y-1"><Label>City</Label><Input name="new_city" required /></div>
                      </div>
                      <div className="space-y-1"><Label>Area / locality</Label><Input name="new_area" /></div>
                      <div className="space-y-1"><Label>Address</Label><Input name="new_address" /></div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1"><Label>Latitude</Label><Input name="new_lat" value={newLat} onChange={(e) => setNewLat(e.target.value)} /></div>
                        <div className="space-y-1"><Label>Longitude</Label><Input name="new_lng" value={newLng} onChange={(e) => setNewLng(e.target.value)} /></div>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={fillGps}>
                        <Navigation className="mr-2 h-4 w-4" /> Use my current location
                      </Button>
                    </>
                  )}
                  {safeRole === "doctor" && (
                    <>
                      <div className="space-y-1">
                        <Label>Department</Label>
                        <Select name="department_id" required>
                          <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                          <SelectContent>
                            {doctorDepartments.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
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