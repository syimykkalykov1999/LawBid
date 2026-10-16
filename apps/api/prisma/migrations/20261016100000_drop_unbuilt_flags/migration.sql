-- Owner 2026-10-16: paid identity checks (Stripe Identity / Persona), the
-- unbuilt profile-promotion switch and device attestation are gone from
-- the code; their feature-flag rows would only show up in the admin as
-- dead switches.
DELETE FROM feature_flags
WHERE key IN ('stripe_identity', 'persona_verification', 'profile_promotion', 'device_attestation');
