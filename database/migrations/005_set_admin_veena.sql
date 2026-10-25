-- Migration 005: Setup/Update Admin Credentials for Prof. Veena
DO $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Look up user by email
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'Reflectveena@rvu.edu.in';

  IF v_user_id IS NULL THEN
    -- Insert user into auth.users with password 'Welcome2rvu'
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
      'Reflectveena@rvu.edu.in', crypt('Welcome2rvu', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{"full_name":"Prof. Veena"}', now(), now()
    ) RETURNING id INTO v_user_id;
  ELSE
    -- If user already exists, update encrypted password to 'Welcome2rvu'
    UPDATE auth.users
    SET encrypted_password = crypt('Welcome2rvu', gen_salt('bf')),
        email_confirmed_at = now(),
        updated_at = now()
    WHERE id = v_user_id;
  END IF;

  -- Ensure profile is attached with role 'PROFESSOR'
  INSERT INTO public.profiles (auth_user_id, usn, full_name, role, status)
  VALUES (v_user_id, 'FAC-VEENA', 'Prof. Veena', 'PROFESSOR', 'ACTIVE')
  ON CONFLICT (auth_user_id) DO UPDATE
  SET role = 'PROFESSOR', full_name = 'Prof. Veena', status = 'ACTIVE';

END $$;
