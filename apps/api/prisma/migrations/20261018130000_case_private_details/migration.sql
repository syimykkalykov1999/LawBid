-- Owner 2026-10-18: private case details, shown only to the owner and the
-- attorney whose bid was accepted. The admin's limit
-- (`limits.case_private_details_chars`, up to 50000) is checked by the API;
-- this CHECK is the outer bound.
ALTER TABLE "cases" ADD COLUMN "private_details" TEXT;
ALTER TABLE "cases" ADD CONSTRAINT cases_private_details_len CHECK (private_details IS NULL OR char_length(private_details) <= 50000);
