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

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  full_name: z.string().min(1),
  phone: z.string().optional().default(""),
  department_id: z.string().uuid(),
  specialization: z.string().optional().default(""),
  start_time: z.string().default("09:00"),
  end_time: z.string().default("17:00"),
  slot_minutes: z.coerce.number().int().min(5).max(120).default(15),
  max_patients_per_day: z.coerce.number().int().min(1).default(30),
  working_days: z.array(z.coerce.number().int().min(1).max(7)).default([1, 2, 3, 4, 5]),
});

export const createDoctor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertReceptionist(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const norm = (t: string) => (t.length === 5 ? `${t}:00` : t);

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name, phone: data.phone, role: "doctor" },
    });
    if (createErr || !created.user) throw new Error(createErr?.message ?? "Failed to create user");
    const uid = created.user.id;

    // Ensure profile + role exist (handle_new_user trigger may have inserted them).
    const { error: pErr } = await supabaseAdmin.from("profiles").upsert({
      id: uid, full_name: data.full_name, email: data.email, phone: data.phone || null,
    });
    if (pErr) {
      await supabaseAdmin.auth.admin.deleteUser(uid);
      throw new Error(pErr.message);
    }

    const { error: rErr } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: uid, role: "doctor" }, { onConflict: "user_id,role" });
    if (rErr) {
      await supabaseAdmin.auth.admin.deleteUser(uid);
      throw new Error(rErr.message);
    }

    const { data: doctor, error: dErr } = await supabaseAdmin
      .from("doctors")
      .insert({
        profile_id: uid,
        department_id: data.department_id,
        specialization: data.specialization || null,
        start_time: norm(data.start_time),
        end_time: norm(data.end_time),
        slot_minutes: data.slot_minutes,
        max_patients_per_day: data.max_patients_per_day,
        working_days: data.working_days,
      })
      .select()
      .single();
    if (dErr) {
      await supabaseAdmin.auth.admin.deleteUser(uid);
      throw new Error(dErr.message);
    }
    return { id: doctor.id, profile_id: uid };
  });

const updateSchema = z.object({
  doctor_id: z.string().uuid(),
  full_name: z.string().min(1),
  phone: z.string().optional().default(""),
  department_id: z.string().uuid(),
  specialization: z.string().optional().default(""),
  start_time: z.string(),
  end_time: z.string(),
  slot_minutes: z.coerce.number().int().min(5).max(120),
  max_patients_per_day: z.coerce.number().int().min(1),
  working_days: z.array(z.coerce.number().int().min(1).max(7)),
});

export const updateDoctor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => updateSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertReceptionist(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const norm = (t: string) => (t.length === 5 ? `${t}:00` : t);

    const { data: doc, error: gErr } = await supabaseAdmin
      .from("doctors").select("profile_id").eq("id", data.doctor_id).single();
    if (gErr || !doc) throw new Error(gErr?.message ?? "Doctor not found");

    const { error: dErr } = await supabaseAdmin.from("doctors").update({
      department_id: data.department_id,
      specialization: data.specialization || null,
      start_time: norm(data.start_time),
      end_time: norm(data.end_time),
      slot_minutes: data.slot_minutes,
      max_patients_per_day: data.max_patients_per_day,
      working_days: data.working_days,
    }).eq("id", data.doctor_id);
    if (dErr) throw new Error(dErr.message);

    const { error: pErr } = await supabaseAdmin.from("profiles").update({
      full_name: data.full_name, phone: data.phone || null,
    }).eq("id", doc.profile_id);
    if (pErr) throw new Error(pErr.message);

    return { ok: true };
  });

export const deleteDoctor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ doctor_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertReceptionist(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: doc, error: gErr } = await supabaseAdmin
      .from("doctors").select("profile_id").eq("id", data.doctor_id).single();
    if (gErr || !doc) throw new Error(gErr?.message ?? "Doctor not found");
    // Cascades remove profile, doctor row, user_roles.
    const { error } = await supabaseAdmin.auth.admin.deleteUser(doc.profile_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });