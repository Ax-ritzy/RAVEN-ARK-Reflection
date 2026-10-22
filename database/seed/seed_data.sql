-- =================================================================
-- SEED DATA: SAMPLE SESSIONS, REFERENCES, AND KEYWORD SETS
-- For verification and testing of the assessment pipeline.
-- =================================================================

DO $$
DECLARE
    prof_id UUID;
    session_open_id UUID;
    session_closed_id UUID;
    ref_id UUID;
BEGIN
    -- Check if a dummy professor profile exists or create one for test staging
    SELECT id INTO prof_id FROM public.profiles WHERE role = 'PROFESSOR' LIMIT 1;
    
    IF prof_id IS NULL THEN
        INSERT INTO public.profiles (role, usn, full_name, status)
        VALUES ('PROFESSOR', NULL, 'Dr. Alan Turing', 'ACTIVE')
        RETURNING id INTO prof_id;
    END IF;

    -- Create Sample Open Session
    INSERT INTO public.sessions (name, status, created_by)
    VALUES ('Reflection Session 1: Neural Networks & Backprop', 'OPEN', prof_id)
    RETURNING id INTO session_open_id;

    -- Create Sample Closed Session
    INSERT INTO public.sessions (name, status, created_by)
    VALUES ('Reflection Session 0: Introduction to Deep Learning', 'CLOSED', prof_id)
    RETURNING id INTO session_closed_id;

    -- Create Sample Reference Material
    INSERT INTO public.reference_materials (name, storage_path, extracted_text, uploaded_by)
    VALUES (
        'Lecture 1 Reference Note: Gradient Descent and Optimization',
        'references/lecture1_ref.txt',
        'Gradient descent is an optimization algorithm used to minimize the loss function by iteratively moving in the direction of steepest descent. Backpropagation calculates the gradient of the error with respect to each weight using the chain rule. Key components include learning rate, momentum, activation function, convergence, epochs, batch normalization, regularization, stochastic gradient descent, hyperparameter tuning, loss landscape, and weight decay.',
        prof_id
    )
    RETURNING id INTO ref_id;

    -- Link Reference to Open Session
    INSERT INTO public.session_references (session_id, reference_id)
    VALUES (session_open_id, ref_id)
    ON CONFLICT DO NOTHING;

    -- Create exactly 15 distinct keywords for this reference
    INSERT INTO public.reference_keyword_sets (reference_id, version, keywords, is_active)
    VALUES (
        ref_id,
        1,
        ARRAY[
            'optimization',
            'gradient',
            'backpropagation',
            'weights',
            'convergence',
            'epochs',
            'momentum',
            'regularization',
            'hyperparameter',
            'loss',
            'activation',
            'stochastic',
            'normalization',
            'landscape',
            'decay'
        ],
        true
    )
    ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Seed data populated successfully.';
END $$;
