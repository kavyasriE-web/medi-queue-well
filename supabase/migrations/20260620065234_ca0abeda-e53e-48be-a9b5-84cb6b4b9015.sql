
-- Roles
CREATE TYPE public.app_role AS ENUM ('patient', 'receptionist', 'doctor');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users read own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  phone text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone signed in can view profiles"
  ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users insert own profile"
  ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Receptionist manages profiles"
  ON public.profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'receptionist'))
  WITH CHECK (public.has_role(auth.uid(), 'receptionist'));

-- Departments
CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  code text NOT NULL UNIQUE,
  description text,
  avg_wait_minutes int NOT NULL DEFAULT 15,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.departments TO anon, authenticated;
GRANT ALL ON public.departments TO service_role;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Departments are public" ON public.departments FOR SELECT USING (true);

-- Doctors
CREATE TABLE public.doctors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE RESTRICT,
  specialization text,
  working_days int[] NOT NULL DEFAULT ARRAY[1,2,3,4,5],
  start_time time NOT NULL DEFAULT '09:00',
  end_time time NOT NULL DEFAULT '17:00',
  slot_minutes int NOT NULL DEFAULT 15,
  max_patients_per_day int NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id)
);
GRANT SELECT ON public.doctors TO anon, authenticated;
GRANT UPDATE ON public.doctors TO authenticated;
GRANT ALL ON public.doctors TO service_role;
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Doctors are public" ON public.doctors FOR SELECT USING (true);
CREATE POLICY "Doctor updates own row" ON public.doctors FOR UPDATE TO authenticated
  USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());
CREATE POLICY "Receptionist manages doctors" ON public.doctors FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'receptionist'))
  WITH CHECK (public.has_role(auth.uid(), 'receptionist'));

-- Appointments
CREATE TYPE public.appt_status AS ENUM ('waiting','in_progress','completed','skipped','cancelled');

CREATE TABLE public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE RESTRICT,
  appointment_date date NOT NULL,
  slot_time time NOT NULL,
  symptoms text,
  status appt_status NOT NULL DEFAULT 'waiting',
  token_number int NOT NULL,
  token_code text NOT NULL,
  is_walk_in boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX appts_doctor_date_idx ON public.appointments(doctor_id, appointment_date);
CREATE INDEX appts_dept_date_idx ON public.appointments(department_id, appointment_date);
CREATE INDEX appts_patient_idx ON public.appointments(patient_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO authenticated;
GRANT SELECT ON public.appointments TO anon;
GRANT ALL ON public.appointments TO service_role;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- Public can read appointments for live queue board (no PII columns exposed via app projection)
CREATE POLICY "Public can view appointments for queue"
  ON public.appointments FOR SELECT USING (true);
CREATE POLICY "Patient creates own appointment"
  ON public.appointments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = patient_id);
CREATE POLICY "Patient updates/cancels own waiting appointment"
  ON public.appointments FOR UPDATE TO authenticated
  USING (auth.uid() = patient_id) WITH CHECK (auth.uid() = patient_id);
CREATE POLICY "Doctor updates assigned appointments"
  ON public.appointments FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.doctors d WHERE d.id = doctor_id AND d.profile_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.doctors d WHERE d.id = doctor_id AND d.profile_id = auth.uid()));
CREATE POLICY "Receptionist manages appointments"
  ON public.appointments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'receptionist'))
  WITH CHECK (public.has_role(auth.uid(), 'receptionist'));

-- Token generation trigger
CREATE OR REPLACE FUNCTION public.assign_token()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  dept_code text;
  next_num int;
BEGIN
  SELECT code INTO dept_code FROM public.departments WHERE id = NEW.department_id;
  SELECT COALESCE(MAX(token_number), 0) + 1 INTO next_num
    FROM public.appointments
    WHERE department_id = NEW.department_id AND appointment_date = NEW.appointment_date;
  NEW.token_number := next_num;
  NEW.token_code := dept_code || '-' || LPAD(next_num::text, 3, '0');
  RETURN NEW;
END $$;

CREATE TRIGGER assign_token_trg BEFORE INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.assign_token();

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER appts_touch BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Auto create profile + default patient role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, phone)
  VALUES (NEW.id,
          COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
          NEW.email,
          NEW.raw_user_meta_data->>'phone')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'patient'))
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.doctors;

-- Seed departments
INSERT INTO public.departments (name, code, description, avg_wait_minutes) VALUES
  ('General Medicine','GEN','Primary care and general consultations',15),
  ('Cardiology','CAR','Heart and vascular care',20),
  ('Orthopedics','ORT','Bone, joint and muscle care',25),
  ('ENT','ENT','Ear, nose and throat',12),
  ('Pediatrics','PED','Care for infants and children',15);
