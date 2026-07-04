
-- 1. Hospitals table
CREATE TABLE public.hospitals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  city text NOT NULL,
  area text,
  address text,
  phone text,
  latitude double precision,
  longitude double precision,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.hospitals TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.hospitals TO authenticated;
GRANT ALL ON public.hospitals TO service_role;

ALTER TABLE public.hospitals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Hospitals are public"
  ON public.hospitals FOR SELECT
  USING (true);

CREATE POLICY "Receptionists manage hospitals"
  ON public.hospitals FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'receptionist'))
  WITH CHECK (public.has_role(auth.uid(), 'receptionist'));

-- 2. Seed default hospital + demo hospitals
INSERT INTO public.hospitals (name, code, city, area, address, phone, latitude, longitude, description)
VALUES
  ('MediQueue Central', 'MQC', 'Bengaluru', 'MG Road', '1 Central Ave, MG Road, Bengaluru', '+91-80-1111-0000', 12.9756, 77.6050, 'Flagship multi-specialty hospital.'),
  ('Green Valley Hospital', 'GVH', 'Bengaluru', 'Whitefield', '42 Green Valley Rd, Whitefield, Bengaluru', '+91-80-2222-0000', 12.9698, 77.7500, 'Community hospital in Whitefield.'),
  ('Harbor City Medical', 'HCM', 'Mumbai', 'Bandra West', '88 Marine Dr, Bandra West, Mumbai', '+91-22-3333-0000', 19.0596, 72.8295, 'Coastal facility with 24×7 emergency.'),
  ('Capital Care Clinic', 'CCC', 'New Delhi', 'Connaught Place', '12 Rajpath, Connaught Place, New Delhi', '+91-11-4444-0000', 28.6329, 77.2195, 'Outpatient specialty clinic.'),
  ('Sunrise Multi-Specialty', 'SMS', 'Hyderabad', 'Banjara Hills', '55 Road No 12, Banjara Hills, Hyderabad', '+91-40-5555-0000', 17.4126, 78.4482, 'Modern multi-specialty center.');

-- 3. Add hospital_id to existing tables (nullable first, backfill, then NOT NULL)
ALTER TABLE public.departments ADD COLUMN hospital_id uuid REFERENCES public.hospitals(id) ON DELETE CASCADE;
ALTER TABLE public.doctors ADD COLUMN hospital_id uuid REFERENCES public.hospitals(id) ON DELETE CASCADE;
ALTER TABLE public.appointments ADD COLUMN hospital_id uuid REFERENCES public.hospitals(id) ON DELETE CASCADE;
ALTER TABLE public.user_roles ADD COLUMN hospital_id uuid REFERENCES public.hospitals(id) ON DELETE SET NULL;

-- Backfill: everything existing → MediQueue Central
UPDATE public.departments SET hospital_id = (SELECT id FROM public.hospitals WHERE code = 'MQC');
UPDATE public.doctors SET hospital_id = (SELECT id FROM public.hospitals WHERE code = 'MQC');
UPDATE public.appointments SET hospital_id = (SELECT id FROM public.hospitals WHERE code = 'MQC');
UPDATE public.user_roles SET hospital_id = (SELECT id FROM public.hospitals WHERE code = 'MQC')
  WHERE role IN ('receptionist','doctor');

ALTER TABLE public.departments ALTER COLUMN hospital_id SET NOT NULL;
ALTER TABLE public.doctors ALTER COLUMN hospital_id SET NOT NULL;
ALTER TABLE public.appointments ALTER COLUMN hospital_id SET NOT NULL;

-- Department code must now be unique per hospital, not globally
ALTER TABLE public.departments DROP CONSTRAINT IF EXISTS departments_code_key;
ALTER TABLE public.departments ADD CONSTRAINT departments_hospital_code_key UNIQUE (hospital_id, code);

CREATE INDEX IF NOT EXISTS idx_departments_hospital ON public.departments(hospital_id);
CREATE INDEX IF NOT EXISTS idx_doctors_hospital ON public.doctors(hospital_id);
CREATE INDEX IF NOT EXISTS idx_appointments_hospital ON public.appointments(hospital_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_hospital ON public.user_roles(hospital_id);

-- 4. Seed one department per demo hospital so patients see options right away
INSERT INTO public.departments (hospital_id, name, code, description, avg_wait_minutes)
SELECT h.id, 'General Medicine', 'GEN', 'General consultation and checkups.', 15
FROM public.hospitals h
WHERE h.code IN ('GVH','HCM','CCC','SMS')
ON CONFLICT DO NOTHING;

-- 5. Helper: get the hospital a staff member belongs to
CREATE OR REPLACE FUNCTION public.get_user_hospital(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT hospital_id
  FROM public.user_roles
  WHERE user_id = _user_id
    AND role IN ('receptionist','doctor')
    AND hospital_id IS NOT NULL
  LIMIT 1
$$;

-- 6. Token generator: scope by hospital + department + date
CREATE OR REPLACE FUNCTION public.assign_token()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dept_code text;
  next_num int;
BEGIN
  SELECT code INTO dept_code FROM public.departments WHERE id = NEW.department_id;
  SELECT COALESCE(MAX(token_number), 0) + 1 INTO next_num
    FROM public.appointments
    WHERE hospital_id = NEW.hospital_id
      AND department_id = NEW.department_id
      AND appointment_date = NEW.appointment_date;
  NEW.token_number := next_num;
  NEW.token_code := dept_code || '-' || LPAD(next_num::text, 3, '0');
  RETURN NEW;
END $$;

-- Ensure trigger is wired (it already exists on the table, but re-create defensively)
DROP TRIGGER IF EXISTS appointments_assign_token ON public.appointments;
CREATE TRIGGER appointments_assign_token
  BEFORE INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.assign_token();

-- 7. Sign-up trigger now captures hospital_id from user metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role app_role := COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'patient');
  _hospital uuid := NULLIF(NEW.raw_user_meta_data->>'hospital_id','')::uuid;
BEGIN
  INSERT INTO public.profiles (id, full_name, email, phone)
  VALUES (NEW.id,
          COALESCE(NEW.raw_user_meta_data->>'full_name',''),
          NEW.email,
          NEW.raw_user_meta_data->>'phone')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role, hospital_id)
  VALUES (NEW.id, _role, CASE WHEN _role IN ('receptionist','doctor') THEN _hospital ELSE NULL END)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

-- 8. Tighten staff policies to their own hospital
DROP POLICY IF EXISTS "Receptionist manages doctors" ON public.doctors;
CREATE POLICY "Receptionist manages doctors"
  ON public.doctors FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'receptionist')
    AND hospital_id = public.get_user_hospital(auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'receptionist')
    AND hospital_id = public.get_user_hospital(auth.uid())
  );

DROP POLICY IF EXISTS "Receptionist manages appointments" ON public.appointments;
CREATE POLICY "Receptionist manages appointments"
  ON public.appointments FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'receptionist')
    AND hospital_id = public.get_user_hospital(auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'receptionist')
    AND hospital_id = public.get_user_hospital(auth.uid())
  );

-- Departments: keep public read; add receptionist write scoped to their hospital
CREATE POLICY "Receptionist manages departments"
  ON public.departments FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'receptionist')
    AND hospital_id = public.get_user_hospital(auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'receptionist')
    AND hospital_id = public.get_user_hospital(auth.uid())
  );
