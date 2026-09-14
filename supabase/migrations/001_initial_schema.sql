-- ============================================
-- Juvenex Database Schema - Phase 1 (Core)
-- ============================================

-- Profiles (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  avatar_url text,
  role text NOT NULL DEFAULT 'patient' CHECK (role IN ('patient', 'org_admin', 'super_admin')),
  organization_id uuid,
  referral_code text UNIQUE,
  referred_by uuid REFERENCES profiles(id),
  utm_source text,
  utm_medium text,
  utm_campaign text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Patient health profiles (non-HIPAA sensitive data for AI features)
CREATE TABLE IF NOT EXISTS patient_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  current_weight numeric,
  target_weight numeric,
  height numeric,
  age int,
  gender text,
  activity_level text,
  diet_type text,
  primary_goal text,
  allergies text[] DEFAULT '{}',
  restrictions text[] DEFAULT '{}',
  favorite_foods text[] DEFAULT '{}',
  foods_to_avoid text[] DEFAULT '{}',
  conditions text[] DEFAULT '{}',
  medications text[] DEFAULT '{}',
  has_glp1_experience boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Organizations (white-label clinics)
CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  type text DEFAULT 'clinic' CHECK (type IN ('clinic', 'practice', 'hospital', 'wellness_center')),
  logo_url text,
  primary_color text DEFAULT '#8FA888',
  custom_domain text,
  referral_code text UNIQUE,
  phone text,
  email text,
  website text,
  stripe_account_id text,
  created_at timestamptz DEFAULT now()
);

-- Add foreign key for profiles -> organizations after organizations table exists
ALTER TABLE profiles ADD CONSTRAINT fk_profiles_organization
  FOREIGN KEY (organization_id) REFERENCES organizations(id);

-- Food logs
CREATE TABLE IF NOT EXISTS food_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  food text NOT NULL,
  meal_type text NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  calories int,
  protein numeric,
  carbs numeric,
  fat numeric,
  fiber numeric,
  blood_sugar numeric,
  notes text,
  logged_at timestamptz DEFAULT now()
);

-- Meal plans (AI-generated)
CREATE TABLE IF NOT EXISTS meal_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  meals jsonb NOT NULL DEFAULT '[]',
  nutrition_summary jsonb,
  preferences jsonb,
  created_at timestamptz DEFAULT now()
);

-- Progress photos
CREATE TABLE IF NOT EXISTS progress_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  weight numeric,
  notes text,
  is_public boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- AI conversation history
CREATE TABLE IF NOT EXISTS ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  messages jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================
-- Phase 2: Social & Forum
-- ============================================

-- Groups
CREATE TABLE IF NOT EXISTS groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  slug text UNIQUE,
  organization_id uuid REFERENCES organizations(id),
  created_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

-- Posts (status updates + forum posts)
CREATE TABLE IF NOT EXISTS posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('status', 'forum')),
  group_id uuid REFERENCES groups(id) ON DELETE CASCADE,
  title text,
  body text NOT NULL,
  image_url text,
  is_public boolean DEFAULT true,
  likes_count int DEFAULT 0,
  comments_count int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Comments
CREATE TABLE IF NOT EXISTS comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Follows
CREATE TABLE IF NOT EXISTS follows (
  follower_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (follower_id, following_id)
);

-- Group members
CREATE TABLE IF NOT EXISTS group_members (
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role text DEFAULT 'member' CHECK (role IN ('member', 'moderator', 'admin')),
  PRIMARY KEY (group_id, user_id)
);

-- Likes
CREATE TABLE IF NOT EXISTS likes (
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, post_id)
);

-- ============================================
-- Phase 3: Payments & Shop
-- ============================================

-- Subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  stripe_subscription_id text UNIQUE,
  stripe_customer_id text,
  plan text NOT NULL CHECK (plan IN ('monthly', 'annual')),
  status text DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due', 'trialing')),
  organization_id uuid REFERENCES organizations(id),
  current_period_end timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Shop products
CREATE TABLE IF NOT EXISTS shop_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  price_cents int NOT NULL,
  image_url text,
  category text,
  external_product_id text,
  is_active boolean DEFAULT true,
  organization_id uuid REFERENCES organizations(id),
  created_at timestamptz DEFAULT now()
);

-- Affiliate referrals
CREATE TABLE IF NOT EXISTS affiliate_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES profiles(id),
  referred_id uuid NOT NULL REFERENCES profiles(id),
  subscription_id uuid REFERENCES subscriptions(id),
  commission_cents int,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX idx_food_logs_user ON food_logs(user_id, logged_at DESC);
CREATE INDEX idx_meal_plans_user ON meal_plans(user_id, created_at DESC);
CREATE INDEX idx_posts_user ON posts(user_id, created_at DESC);
CREATE INDEX idx_posts_group ON posts(group_id, created_at DESC);
CREATE INDEX idx_posts_type ON posts(type, created_at DESC);
CREATE INDEX idx_comments_post ON comments(post_id, created_at ASC);
CREATE INDEX idx_follows_following ON follows(following_id);
CREATE INDEX idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX idx_shop_products_active ON shop_products(is_active, category);

-- ============================================
-- Row Level Security (RLS)
-- ============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_products ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read public profiles, edit own
CREATE POLICY "Public profiles are viewable" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Patient profiles: only own
CREATE POLICY "Users can manage own patient profile" ON patient_profiles
  FOR ALL USING (auth.uid() = user_id);

-- Food logs: only own
CREATE POLICY "Users can manage own food logs" ON food_logs
  FOR ALL USING (auth.uid() = user_id);

-- Meal plans: only own
CREATE POLICY "Users can manage own meal plans" ON meal_plans
  FOR ALL USING (auth.uid() = user_id);

-- Progress photos: own + public viewable
CREATE POLICY "Users can manage own photos" ON progress_photos
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Public photos are viewable" ON progress_photos
  FOR SELECT USING (is_public = true);

-- AI conversations: only own
CREATE POLICY "Users can manage own conversations" ON ai_conversations
  FOR ALL USING (auth.uid() = user_id);

-- Posts: public viewable, own manageable
CREATE POLICY "Public posts are viewable" ON posts FOR SELECT USING (is_public = true);
CREATE POLICY "Users can manage own posts" ON posts
  FOR ALL USING (auth.uid() = user_id);

-- Comments: viewable on public posts, own manageable
CREATE POLICY "Comments viewable" ON comments FOR SELECT USING (true);
CREATE POLICY "Users can create comments" ON comments
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own comments" ON comments
  FOR DELETE USING (auth.uid() = user_id);

-- Follows: public, own manageable
CREATE POLICY "Follows viewable" ON follows FOR SELECT USING (true);
CREATE POLICY "Users can manage own follows" ON follows
  FOR ALL USING (auth.uid() = follower_id);

-- Groups: public viewable
CREATE POLICY "Groups viewable" ON groups FOR SELECT USING (true);
CREATE POLICY "Users can create groups" ON groups
  FOR INSERT WITH CHECK (auth.uid() = created_by);

-- Group members: viewable, own manageable
CREATE POLICY "Group members viewable" ON group_members FOR SELECT USING (true);
CREATE POLICY "Users can join/leave groups" ON group_members
  FOR ALL USING (auth.uid() = user_id);

-- Likes: viewable, own manageable
CREATE POLICY "Likes viewable" ON likes FOR SELECT USING (true);
CREATE POLICY "Users can manage own likes" ON likes
  FOR ALL USING (auth.uid() = user_id);

-- Subscriptions: only own
CREATE POLICY "Users can view own subscriptions" ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- Shop products: public viewable
CREATE POLICY "Products viewable" ON shop_products
  FOR SELECT USING (is_active = true);

-- ============================================
-- Trigger: auto-create profile on signup
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
