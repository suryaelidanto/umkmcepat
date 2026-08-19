-- Seed Booster Pack default pricing, naming, description, and popular badge into AppSetting table

INSERT INTO "AppSetting" ("key", "category", "value", "updatedAt")
VALUES
  -- Pocket Booster
  ('booster.pocket.amount', 'booster', '4900'::jsonb, NOW()),
  ('booster.pocket.compare_at_amount', 'booster', '7900'::jsonb, NOW()),
  ('booster.pocket.energy', 'booster', '50000'::jsonb, NOW()),
  ('booster.pocket.name', 'booster', '"Eceran Hemat"'::jsonb, NOW()),
  ('booster.pocket.desc', 'booster', '"Pas buat uji coba fitur"'::jsonb, NOW()),
  ('booster.pocket.is_popular', 'booster', 'false'::jsonb, NOW()),

  -- Starter Booster (Usaha Rintisan - Terlaris)
  ('booster.starter.amount', 'booster', '14900'::jsonb, NOW()),
  ('booster.starter.compare_at_amount', 'booster', '24900'::jsonb, NOW()),
  ('booster.starter.energy', 'booster', '200000'::jsonb, NOW()),
  ('booster.starter.name', 'booster', '"Usaha Rintisan"'::jsonb, NOW()),
  ('booster.starter.desc', 'booster', '"Ideal untuk toko online pemula"'::jsonb, NOW()),
  ('booster.starter.is_popular', 'booster', 'true'::jsonb, NOW()),

  -- Popular Booster (Laris Manis)
  ('booster.popular.amount', 'booster', '39900'::jsonb, NOW()),
  ('booster.popular.compare_at_amount', 'booster', '69900'::jsonb, NOW()),
  ('booster.popular.energy', 'booster', '600000'::jsonb, NOW()),
  ('booster.popular.name', 'booster', '"Laris Manis"'::jsonb, NOW()),
  ('booster.popular.desc', 'booster', '"Pendamping tumbuh cepat"'::jsonb, NOW()),
  ('booster.popular.is_popular', 'booster', 'false'::jsonb, NOW()),

  -- Max Booster (Juragan Besar)
  ('booster.max.amount', 'booster', '99900'::jsonb, NOW()),
  ('booster.max.compare_at_amount', 'booster', '179900'::jsonb, NOW()),
  ('booster.max.energy', 'booster', '1500000'::jsonb, NOW()),
  ('booster.max.name', 'booster', '"Juragan Besar"'::jsonb, NOW()),
  ('booster.max.desc', 'booster', '"Energi tambahan melimpah"'::jsonb, NOW()),
  ('booster.max.is_popular', 'booster', 'false'::jsonb, NOW())
ON CONFLICT ("key") DO UPDATE
SET "category" = EXCLUDED."category",
    "value" = EXCLUDED."value",
    "updatedAt" = NOW();
