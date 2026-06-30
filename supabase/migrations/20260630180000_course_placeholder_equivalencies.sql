-- Static MAHM placeholder codes (#18) paired with 2025–26 PDF registrar codes.
-- Idempotent: skip pairs that already exist in either direction.

SELECT setval(
  pg_get_serial_sequence('public.courses_equivalency', 'id'),
  COALESCE((SELECT MAX(id) FROM public.courses_equivalency), 1),
  true
);

INSERT INTO public.courses_equivalency (code1, code2)
SELECT v.code1, v.code2
FROM (
  VALUES
    ('OM111', 'TCM101'),
    ('HB202', 'HERB202'),
    ('AC111', 'POI201'),
    ('AC112', 'POI202'),
    ('OM201', 'DXM201'),
    ('WM401', 'BIO201'),
    ('WM402', 'BIO202'),
    ('RM400', 'RES301')
) AS v(code1, code2)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.courses_equivalency e
  WHERE (e.code1 = v.code1 AND e.code2 = v.code2)
     OR (e.code1 = v.code2 AND e.code2 = v.code1)
);
