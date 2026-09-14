-- Per-tenant storefront branding overrides. Maps to Phase 2 of the
-- PrescribeRx storefront customization PR (docs/PRESCRIBERX_BRANDING_AUDIT.md).
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS brand_name text,
  ADD COLUMN IF NOT EXISTS brand_primary_color text,
  ADD COLUMN IF NOT EXISTS brand_logo_url text;

-- Length sanity: hex color is `#rrggbb` (7 chars); brand_name <= 80; logo URL <= 500.
ALTER TABLE organizations
  ADD CONSTRAINT brand_primary_color_format CHECK (
    brand_primary_color IS NULL OR brand_primary_color ~ '^#[0-9A-Fa-f]{6}$'
  ),
  ADD CONSTRAINT brand_name_length CHECK (
    brand_name IS NULL OR char_length(brand_name) <= 80
  ),
  ADD CONSTRAINT brand_logo_url_length CHECK (
    brand_logo_url IS NULL OR char_length(brand_logo_url) <= 500
  );
