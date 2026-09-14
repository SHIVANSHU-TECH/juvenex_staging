-- Juvenex GLP-1 Companion App - Database Schema
-- PostgreSQL

BEGIN;

-- =============================================================================
-- TABLES
-- =============================================================================

CREATE TABLE profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT,
    phone TEXT,
    avatar_url TEXT,
    role TEXT DEFAULT 'patient',
    organization_id UUID,
    referral_code TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE patient_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE REFERENCES profiles(id),
    current_weight NUMERIC,
    target_weight NUMERIC,
    height NUMERIC,
    age INT,
    gender TEXT,
    activity_level TEXT,
    diet_type TEXT,
    primary_goal TEXT,
    allergies TEXT[],
    restrictions TEXT[],
    favorite_foods TEXT[],
    foods_to_avoid TEXT[],
    conditions TEXT[],
    medications TEXT[],
    has_glp1_experience BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE food_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id),
    food TEXT NOT NULL,
    meal_type TEXT NOT NULL,
    calories INT,
    protein NUMERIC,
    carbs NUMERIC,
    fat NUMERIC,
    fiber NUMERIC,
    blood_sugar NUMERIC,
    notes TEXT,
    logged_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL,
    logo_url TEXT,
    primary_color TEXT,
    phone TEXT,
    email TEXT,
    custom_domain TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id),
    appointment_status TEXT DEFAULT 'intake_received',
    selected_products TEXT[],
    external_consult_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id),
    type TEXT DEFAULT 'status',
    title TEXT,
    body TEXT NOT NULL,
    group_id UUID,
    image_url TEXT,
    is_public BOOLEAN DEFAULT true,
    likes_count INT DEFAULT 0,
    comments_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE post_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id),
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE post_likes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(post_id, user_id)
);

CREATE TABLE follows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    follower_id UUID REFERENCES profiles(id),
    following_id UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(follower_id, following_id)
);

CREATE TABLE groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    slug TEXT UNIQUE NOT NULL,
    organization_id UUID REFERENCES organizations(id),
    created_by UUID REFERENCES profiles(id),
    member_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id),
    role TEXT DEFAULT 'member',
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(group_id, user_id)
);

CREATE TABLE group_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id),
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE shop_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    price_cents INT NOT NULL,
    category TEXT,
    image_url TEXT,
    is_active BOOLEAN DEFAULT true,
    organization_id UUID REFERENCES organizations(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id),
    status TEXT DEFAULT 'pending',
    total_cents INT,
    items JSONB,
    stripe_session_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE progress_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id),
    photo_url TEXT NOT NULL,
    weight NUMERIC,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE ai_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id),
    messages JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE meal_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id),
    plan JSONB NOT NULL,
    request_params JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    action TEXT NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    details JSONB,
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX idx_profiles_email ON profiles(email);
CREATE INDEX idx_profiles_organization ON profiles(organization_id);
CREATE INDEX idx_profiles_role ON profiles(role);

CREATE INDEX idx_patient_profiles_user ON patient_profiles(user_id);

CREATE INDEX idx_food_logs_user_logged ON food_logs(user_id, logged_at);
CREATE INDEX idx_food_logs_meal_type ON food_logs(user_id, meal_type);

CREATE INDEX idx_appointments_user ON appointments(user_id);
CREATE INDEX idx_appointments_status ON appointments(appointment_status);

CREATE INDEX idx_posts_user_created ON posts(user_id, created_at);
CREATE INDEX idx_posts_group ON posts(group_id);
CREATE INDEX idx_posts_public ON posts(is_public, created_at);

CREATE INDEX idx_post_comments_post ON post_comments(post_id);
CREATE INDEX idx_post_comments_user ON post_comments(user_id);

CREATE INDEX idx_post_likes_post ON post_likes(post_id);
CREATE INDEX idx_post_likes_user ON post_likes(user_id);

CREATE INDEX idx_follows_follower ON follows(follower_id);
CREATE INDEX idx_follows_following ON follows(following_id);

CREATE INDEX idx_groups_org ON groups(organization_id);
CREATE INDEX idx_groups_slug ON groups(slug);

CREATE INDEX idx_group_members_group ON group_members(group_id);
CREATE INDEX idx_group_members_user ON group_members(user_id);

CREATE INDEX idx_group_posts_group ON group_posts(group_id);

CREATE INDEX idx_shop_products_category ON shop_products(category);
CREATE INDEX idx_shop_products_active ON shop_products(is_active);
CREATE INDEX idx_shop_products_org ON shop_products(organization_id);

CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);

CREATE INDEX idx_progress_photos_user ON progress_photos(user_id, created_at);

CREATE INDEX idx_ai_conversations_user ON ai_conversations(user_id);

CREATE INDEX idx_meal_plans_user ON meal_plans(user_id);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);

-- =============================================================================
-- SEED DATA
-- =============================================================================

-- Demo user (password: demo1234)
INSERT INTO profiles (email, password_hash, name, role)
VALUES (
    'demo@juvenex.app',
    '$2a$10$rQEY4x1eCKmiE8KmKzV5YOjH5PKwxLt.HkKL8xYd5.QhJnTbxpXGi',
    'Demo User',
    'patient'
);

-- Sample shop products
INSERT INTO shop_products (name, description, price_cents, category, image_url) VALUES
(
    'GLP-1 Support Probiotic',
    'Specially formulated probiotic blend to support gut health during GLP-1 therapy. Contains 50 billion CFU with strains shown to reduce GI side effects.',
    3999,
    'supplements',
    '/images/products/probiotic.png'
),
(
    'Electrolyte Hydration Mix (30 packets)',
    'Sugar-free electrolyte powder designed for GLP-1 patients. Prevents dehydration and supports energy levels with magnesium, potassium, and sodium.',
    2499,
    'supplements',
    '/images/products/electrolytes.png'
),
(
    'High-Protein Collagen Peptides',
    'Unflavored collagen peptides with 20g protein per serving. Supports skin elasticity during weight loss and helps meet daily protein goals.',
    3499,
    'supplements',
    '/images/products/collagen.png'
),
(
    'Vitamin B12 Sublingual Spray',
    'Fast-absorbing B12 methylcobalamin spray. Addresses common B12 deficiency in GLP-1 patients and supports energy metabolism.',
    1999,
    'supplements',
    '/images/products/b12-spray.png'
),
(
    'Portion Control Plate Set',
    'Color-coded plate and bowl set with built-in portion guides for protein, carbs, and vegetables. Dishwasher safe, BPA-free.',
    2999,
    'accessories',
    '/images/products/portion-plate.png'
),
(
    'GLP-1 Journey Tracker Journal',
    'Guided journal with daily food logging, medication tracking, mood check-ins, and weekly reflection prompts. 90-day format.',
    1499,
    'accessories',
    '/images/products/journal.png'
);

COMMIT;
