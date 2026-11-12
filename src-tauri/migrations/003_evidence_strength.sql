-- What makes a piece of evidence weighable. All empty on older rows: nobody has rated them, and the
-- app won't guess, so they show as "not rated".
ALTER TABLE evidence_links ADD COLUMN strength TEXT;
ALTER TABLE evidence_links ADD COLUMN source_type TEXT;
ALTER TABLE evidence_links ADD COLUMN limitation TEXT;
