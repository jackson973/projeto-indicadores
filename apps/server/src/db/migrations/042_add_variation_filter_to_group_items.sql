-- Add variation_filter to product_group_items
-- When set, only sales matching this variation prefix are counted for the group.
-- When NULL, all sales of the ad are counted (current behavior).
-- Also remove the UNIQUE(ad_name) constraint so the same ad can appear in
-- different groups with different variation_filter values.

-- Drop old unique constraint on ad_name (allows same ad in multiple groups with different filters)
ALTER TABLE product_group_items DROP CONSTRAINT IF EXISTS product_group_items_ad_name_key;

-- Add variation_filter column
ALTER TABLE product_group_items ADD COLUMN IF NOT EXISTS variation_filter VARCHAR(255) DEFAULT NULL;

-- New unique constraint: same ad+variation can only be in one group
CREATE UNIQUE INDEX IF NOT EXISTS idx_group_items_ad_variation
ON product_group_items (ad_name, COALESCE(variation_filter, ''));
