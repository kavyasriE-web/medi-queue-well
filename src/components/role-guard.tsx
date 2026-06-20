import { type ReactNode, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth, type Role } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { Loader2 } from "lucide-react";

export function RoleGuard({ role, children }: { role: Role; children: ReactNode }) {
  const { user, role: userRole, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/auth/$role", params: { role } });
      return;
    }
    if (userRole && userRole !== role) {
      navigate({ to: "/auth/$role", params: { role: userRole } });
    }
  }, [loading, user, userRole, role, navigate]);

  if (loading || !user || userRole !== role) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  return <AppShell role={role}>{children}</AppShell>;
}