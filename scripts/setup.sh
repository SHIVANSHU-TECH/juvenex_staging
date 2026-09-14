#!/bin/bash
# Juvenex Setup Script - Run this to configure your environment

echo "🏥 Juvenex Setup"
echo "================"
echo ""

# Check if .env.local exists
if [ -f .env.local ]; then
  echo "⚠️  .env.local already exists. Backing up to .env.local.bak"
  cp .env.local .env.local.bak
fi

echo "Enter your credentials (press Enter to skip):"
echo ""

read -p "Supabase URL: " SUPABASE_URL
read -p "Supabase Anon Key: " SUPABASE_ANON
read -p "Supabase Service Role Key: " SUPABASE_SERVICE
read -p "Anthropic API Key: " ANTHROPIC_KEY
read -p "Stripe Secret Key: " STRIPE_SECRET
read -p "Stripe Publishable Key: " STRIPE_PUB
read -p "Stripe Webhook Secret: " STRIPE_WEBHOOK
read -p "App URL (default: http://localhost:3000): " APP_URL

APP_URL=${APP_URL:-http://localhost:3000}

cat > .env.local << EOF
# Supabase
NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${SUPABASE_ANON}
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE}

# AI - Anthropic Claude
ANTHROPIC_API_KEY=${ANTHROPIC_KEY}

# Stripe
STRIPE_SECRET_KEY=${STRIPE_SECRET}
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=${STRIPE_PUB}
STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK}

# App
NEXT_PUBLIC_APP_URL=${APP_URL}
EOF

echo ""
echo "✅ .env.local created!"
echo ""
echo "Next steps:"
echo "1. Run the database migration in your Supabase SQL editor:"
echo "   - supabase/migrations/001_initial_schema.sql"
echo "   - supabase/migrations/002_fixes.sql"
echo "2. Create a Supabase Storage bucket named 'progress-photos'"
echo "3. Enable Google OAuth in Supabase Auth settings"
echo "4. npm install && npm run dev"
echo ""
