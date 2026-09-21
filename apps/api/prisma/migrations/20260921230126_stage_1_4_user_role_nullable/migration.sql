-- Stage 1.4: users.role becomes nullable. docs/01_FOUNDATION_AUTH.md §11's
-- guard logic treats "no role yet" as a real intermediate state (a user
-- exists from the moment OTP/social login succeeds, stage 1.4, but picks
-- client/attorney during onboarding step 2, later) -- the stage 1.3
-- schema didn't account for that. Hand-written for the same reason as the
-- session_chain_id migration: too small to need a shadow-DB diff.
ALTER TABLE "users" ALTER COLUMN "role" DROP NOT NULL;
