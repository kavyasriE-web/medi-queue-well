import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertReceptionist(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "receptionist")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: receptionist role required");
}

const hospitalSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(2).max(8),
  city: z.string().min(1),
  area: z.string().optional().default(""),
  address: z.string().optional().default(""),
  phone: z.string().optional().default(""),
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
  description: z.string().optional().default(""),
});

export const createHospital = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => hospitalSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertReceptionist(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("hospitals")
      .insert({
        name: data.name,
        code: data.code.toUpperCase(),
        city: data.city,
        area: data.area || null,
        address: data.address || null,
        phone: data.phone || null,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        description: data.description || null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateHospital = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    hospitalSchema.extend({ hospital_id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertReceptionist(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("hospitals")
      .update({
        name: data.name,
        code: data.code.toUpperCase(),
        city: data.city,
        area: data.area || null,
        address: data.address || null,
        phone: data.phone || null,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        description: data.description || null,
      })
      .eq("id", data.hospital_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteHospital = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ hospital_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertReceptionist(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("hospitals")
      .delete()
      .eq("id", data.hospital_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Lets a freshly signed-up receptionist create their own hospital and links it
// to their role row, so they can onboard without an existing hospital.
export const createMyHospital = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => hospitalSchema.parse(data))
  .handler(async ({ data, context }) => {
    // Verify the caller is a receptionist via their RLS-visible role row.
    const { data: roleRow, error: roleErr } = await context.supabase
      .from("user_roles")
      .select("id, hospital_id")
      .eq("user_id", context.userId)
      .eq("role", "receptionist")
      .maybeSingle();
    if (roleErr) throw new Error(roleErr.message);
    if (!roleRow) throw new Error("Forbidden: receptionist role required");
    if (roleRow.hospital_id) throw new Error("You are already assigned to a hospital");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const code = data.code.toUpperCase();
    const { data: clash } = await supabaseAdmin
      .from("hospitals")
      .select("id")
      .eq("code", code)
      .maybeSingle();
    if (clash) throw new Error("A hospital with this code already exists");

    const { data: row, error: insErr } = await supabaseAdmin
      .from("hospitals")
      .insert({
        name: data.name,
        code,
        city: data.city,
        area: data.area || null,
        address: data.address || null,
        phone: data.phone || null,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        description: data.description || null,
      })
      .select()
      .single();
    if (insErr) throw new Error(insErr.message);

    const { error: linkErr } = await supabaseAdmin
      .from("user_roles")
      .update({ hospital_id: row.id })
      .eq("id", roleRow.id);
    if (linkErr) {
      await supabaseAdmin.from("hospitals").delete().eq("id", row.id);
      throw new Error(linkErr.message);
    }
    return row;
  });