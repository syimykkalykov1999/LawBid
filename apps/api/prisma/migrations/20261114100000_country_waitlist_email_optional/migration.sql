SET LOCAL lock_timeout = '5s';
-- Owner 2026-11-02: joining the country waiting list needs no e-mail (no
-- mail, no cost: just "we want LawBid in my country"). Dropping NOT NULL is
-- a catalog-only change in PostgreSQL (no table rewrite). The unique key
-- (country_code, email) stays: NULLs are distinct, so any number of
-- address-less rows can exist, one per accepted request (the API limits
-- those per visitor and country). Old API instances keep working: they
-- always write an address.
ALTER TABLE "country_waitlist" ALTER COLUMN "email" DROP NOT NULL;
