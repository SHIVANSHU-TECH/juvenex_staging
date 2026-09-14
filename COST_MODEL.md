# GLP-1 Companion App - Infrastructure Cost Model

## Overview
This model calculates operational costs for scaling from 20 to 1,700 clinics with up to 200,000 users.

---

## Cost Assumptions

### Base Infrastructure (Per Month)

| Service | Base Cost | Per Unit Cost | Notes |
|---------|-----------|---------------|-------|
| **Frontend Hosting (Netlify)** | $0 | Pro plan: $19/site/mo | 1 base site |
| **Backend API (Railway/Render/Fly)** | $25 | +$5 per 10k users | Server + DB |
| **Database (PostgreSQL)** | $20 | $10/50k records | Up to 1M records |
| **Video (Daily.co)** | $0 | $0.007/min per user | ~10 min/telehealth |
| **SMS (Twilio)** | $1 | $0.007/per message | ~5 msgs/user/mo |
| **Email (SendGrid)** | $0 | $0.10/1k emails | ~2 emails/user/mo |
| **Storage (S3/Cloudflare R2)** | $5 | $0.01/GB | Photos, files |
| **Auth (Clerk/Supabase)** | $0 | $0.50/1k MAU | First 10k free |
| **Domain SSL** | $0 | Cloudflare included | Free SSL |

---

## Usage Projections

| Clinics | Users | Telehealth mins/mo | SMS/mo | Emails/mo | Storage GB |
|---------|-------|-------------------|--------|-----------|------------|
| 20 | 2,400 | 2,400 | 12,000 | 4,800 | 5 |
| 100 | 12,000 | 12,000 | 60,000 | 24,000 | 25 |
| 500 | 60,000 | 60,000 | 300,000 | 120,000 | 125 |
| 1,000 | 120,000 | 120,000 | 600,000 | 240,000 | 250 |
| 1,700 | 200,000 | 200,000 | 1,000,000 | 400,000 | 400 |

*Assuming 120 users per clinic (avg)*

---

## Monthly Cost Breakdown

| Scale | Frontend | Backend | Database | Video | SMS | Email | Storage | Auth | **Total** |
|-------|----------|---------|----------|-------|-----|-------|---------|------|-----------|
| **20 clinics (2.4k users)** | $19 | $25 | $20 | $17 | $84 | $0.48 | $5 | $0 | **$170** |
| **100 clinics (12k users)** | $19 | $31 | $20 | $84 | $420 | $2.40 | $5 | $1 | **$582** |
| **500 clinics (60k users)** | $19 | $55 | $30 | $420 | $2,100 | $12 | $6 | $25 | **$2,667** |
| **1,000 clinics (120k users)** | $19 | $85 | $40 | $840 | $4,200 | $24 | $8 | $55 | **$5,271** |
| **1,700 clinics (200k users)** | $19 | $125 | $60 | $1,400 | $7,000 | $40 | $12 | $95 | **$8,751** |

---

## Cost Per User

| Scale | Users | Cost/User/Mo |
|-------|-------|--------------|
| Early (20 clinics) | 2,400 | $7.08 |
| Growth (100 clinics) | 12,000 | $4.85 |
| Scale (500 clinics) | 60,000 | $4.44 |
| Mature (1,000 clinics) | 120,000 | $4.39 |
| Full Scale (1,700 clinics) | 200,000 | $4.38 |

---

## Telehealth Add-On Costs

If offering video consultations:

| Sessions/Month | Users | Minutes | Cost |
|----------------|-------|---------|------|
| 10% of users | 20,000 | 200,000 | $1,400 |
| 20% of users | 40,000 | 400,000 | $2,800 |
| 50% of users | 100,000 | 1,000,000 | $7,000 |

*Assumes 10 minute average session*

---

## Cost Optimization Strategies

### 1. SMS Alternatives
- Use in-app notifications (free)
- Email for non-urgent (~$0.10/1000)
- Push notifications (free)

### 2. Video Alternatives
- Phone-only consultations
- Group sessions (share costs)
- Async video (pre-recorded)

### 3. Database
- Use connection pooling
- Archive old data
- Implement caching (Redis)

---

## Revenue Offsets

| Revenue Stream | Potential/Mo |
|----------------|--------------|
| Telehealth consults | $50,000 - $200,000 |
| Prescription referrals | $20,000 - $100,000 |
| Premium subscriptions | $10,000 - $50,000 |
| Clinic portal fees | $5,000 - $50,000 |

---

## Summary Chart

```
Monthly Cost by Scale (Clinics)
│
│ $10,000 ┤                                      ■■■■■■■■■
│          │                              ■■■■■■■
│ $8,000   │                    ■■■■■
│          │          ■■■■■
│ $6,000   │    ■■■■■
│          │ ■■■
│ $4,000   │
│          │
│ $2,000   │
│          │
│ $0       └──────┬──────┬──────┬──────┬──────┬──────┬───────►
│              20     100    500   1000   1500  1700
│                        Clinics
│
│ Legend: ● Base    ■ With Video   ▲ With Premium Services
```

---

## Recommendations

### Break-Even Analysis
- **At 500 clinics (60k users)**: Costs ~$2,667/mo
- **Revenue needed**: $4,000-5,000/mo (telehealth + referrals)
- **Each telehealth consult**: ~$50-100 revenue
- **Needed consults/day**: ~15-25

### Cost Saving Tips
1. Start with SMS disabled, enable via clinic preference
2. Use phone consultations instead of video initially
3. Implement in-app messaging as primary communication
4. Use Cloudflare Pages (free) + Workers for API

---

## Estimated Monthly Cost at Full Scale (1,700 clinics)

| Category | Cost |
|----------|------|
| Hosting & Infrastructure | $150 |
| Video Consults | $1,400 |
| SMS/Notifications | $7,000 |
| Email | $40 |
| Storage | $12 |
| **Total** | **~$8,750/mo** |

**Cost per user at scale: ~$4.38/month**
