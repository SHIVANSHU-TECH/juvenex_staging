/**
 * AUTO-GENERATED storefront merchandising catalog.
 * Sources: KoverX product organization + juvenex.xlsx SKU→checkout id mapping.
 * Do not edit by hand — regenerate via scripts/gen-storefront-catalog.cjs
 *
 * Checkout still uses WhiteLabelMD productId (Excel ?id=). Prices shown here
 * are Excel display prices; create-intent re-prices from Get_Product_Details.
 */

export type StorefrontCategoryKey =
  | 'weight-loss'
  | 'hrt'
  | 'longevity'
  | 'sexual-wellness'
  | 'hair-skin'
  | 'other'

export interface StorefrontCategory {
  key: StorefrontCategoryKey
  label: string
  navLabel: string
}

export interface StorefrontPlan {
  label: string
  sku: string
  months: number
  productId: string
  checkoutUrl: string
  price: number
  dosage: string
}

export interface StorefrontMedication {
  name: string
  sku?: string
  months?: number
  productId?: string
  checkoutUrl?: string
  price?: number
  dosage?: string
  plans?: StorefrontPlan[]
}

export interface StorefrontProduct {
  slug: string
  name: string
  category: StorefrontCategoryKey
  tagline: string
  pricingType: 'single' | 'medications'
  plans?: StorefrontPlan[]
  medications?: StorefrontMedication[]
  startingPrice: number
}

export const STOREFRONT_CATEGORIES: StorefrontCategory[] = [
  {
    "key": "weight-loss",
    "label": "Weight Loss",
    "navLabel": "Weight Loss"
  },
  {
    "key": "hrt",
    "label": "Hormone Optimization",
    "navLabel": "HRT"
  },
  {
    "key": "longevity",
    "label": "Longevity",
    "navLabel": "Longevity"
  },
  {
    "key": "sexual-wellness",
    "label": "Sexual Wellness",
    "navLabel": "Sexual Wellness"
  },
  {
    "key": "hair-skin",
    "label": "Hair & Skin",
    "navLabel": "Hair & Skin"
  },
  {
    "key": "other",
    "label": "Lifestyle",
    "navLabel": "Lifestyle"
  }
]

export const STOREFRONT_PRODUCTS: StorefrontProduct[] = [
  {
    "slug": "sermorelin",
    "name": "Sermorelin",
    "category": "hrt",
    "tagline": "Growth hormone stimulation peptide",
    "pricingType": "single",
    "plans": [
      {
        "label": "1 month",
        "sku": "SERM-30-1B",
        "months": 1,
        "productId": "135",
        "checkoutUrl": "https://checkout.juvenex.app/?id=135",
        "price": 195,
        "dosage": ""
      },
      {
        "label": "3 months",
        "sku": "SERM-30-3B",
        "months": 3,
        "productId": "136",
        "checkoutUrl": "https://checkout.juvenex.app/?id=136",
        "price": 575,
        "dosage": ""
      },
      {
        "label": "6 months",
        "sku": "SERM-6M",
        "months": 6,
        "productId": "137",
        "checkoutUrl": "https://checkout.juvenex.app/?id=137",
        "price": 1170,
        "dosage": ""
      },
      {
        "label": "12 months",
        "sku": "SERM-12M",
        "months": 12,
        "productId": "138",
        "checkoutUrl": "https://checkout.juvenex.app/?id=138",
        "price": 2340,
        "dosage": ""
      }
    ],
    "startingPrice": 195
  },
  {
    "slug": "semaglutide",
    "name": "Semaglutide",
    "category": "weight-loss",
    "tagline": "GLP-1 weekly injectable",
    "pricingType": "single",
    "plans": [
      {
        "label": "1 month",
        "sku": "SEMA-0.5MG-30-D",
        "months": 1,
        "productId": "2",
        "checkoutUrl": "https://checkout.juvenex.app/?id=2",
        "price": 190,
        "dosage": "0.5 mg/week"
      },
      {
        "label": "3 months",
        "sku": "SG-MAINT-S3-A",
        "months": 3,
        "productId": "47",
        "checkoutUrl": "https://checkout.juvenex.app/?id=47",
        "price": 399,
        "dosage": "0.25 mg/week"
      },
      {
        "label": "6 months",
        "sku": "SEMA-0.5MG-30-D-6M",
        "months": 6,
        "productId": "35",
        "checkoutUrl": "https://checkout.juvenex.app/?id=35",
        "price": 714,
        "dosage": "0.5 mg/week"
      },
      {
        "label": "12 months",
        "sku": "SEMA-0.5MG-30-D-12M",
        "months": 12,
        "productId": "41",
        "checkoutUrl": "https://checkout.juvenex.app/?id=41",
        "price": 1188,
        "dosage": "0.5 mg/week"
      }
    ],
    "startingPrice": 190
  },
  {
    "slug": "tirzepatide",
    "name": "Tirzepatide",
    "category": "weight-loss",
    "tagline": "Dual GIP/GLP-1 weekly injectable",
    "pricingType": "single",
    "plans": [
      {
        "label": "1 month",
        "sku": "TIRZ-CR1",
        "months": 1,
        "productId": "50",
        "checkoutUrl": "https://checkout.juvenex.app/?id=50",
        "price": 239,
        "dosage": "2.5 mg/week"
      },
      {
        "label": "3 months",
        "sku": "TZ-MAINT-S2-A",
        "months": 3,
        "productId": "51",
        "checkoutUrl": "https://checkout.juvenex.app/?id=51",
        "price": 589,
        "dosage": "2.5 mg/week"
      },
      {
        "label": "6 months",
        "sku": "TIRZ-2.5MG-30-6B",
        "months": 6,
        "productId": "52",
        "checkoutUrl": "https://checkout.juvenex.app/?id=52",
        "price": 1074,
        "dosage": "2.5 mg/week"
      },
      {
        "label": "12 months",
        "sku": "TIRZ-2.5MG-30-12B",
        "months": 12,
        "productId": "53",
        "checkoutUrl": "https://checkout.juvenex.app/?id=53",
        "price": 1788,
        "dosage": "2.5 mg/week"
      }
    ],
    "startingPrice": 239
  },
  {
    "slug": "metformin",
    "name": "Metformin",
    "category": "weight-loss",
    "tagline": "Metabolic support",
    "pricingType": "single",
    "plans": [
      {
        "label": "1 month",
        "sku": "METFORM-1M",
        "months": 1,
        "productId": "146",
        "checkoutUrl": "https://checkout.juvenex.app/?id=146",
        "price": 25,
        "dosage": ""
      },
      {
        "label": "3 months",
        "sku": "CRM-ANTIAGE-METFORM-3M",
        "months": 3,
        "productId": "139",
        "checkoutUrl": "https://checkout.juvenex.app/?id=139",
        "price": 75,
        "dosage": ""
      },
      {
        "label": "6 months",
        "sku": "METFORM-6M",
        "months": 6,
        "productId": "147",
        "checkoutUrl": "https://checkout.juvenex.app/?id=147",
        "price": 150,
        "dosage": ""
      }
    ],
    "startingPrice": 25
  },
  {
    "slug": "nad-injectable",
    "name": "NAD+ Injectable",
    "category": "longevity",
    "tagline": "Cellular energy support",
    "pricingType": "single",
    "plans": [
      {
        "label": "1 month",
        "sku": "CRM-NAD-INJ-1M",
        "months": 1,
        "productId": "142",
        "checkoutUrl": "https://checkout.juvenex.app/?id=142",
        "price": 299,
        "dosage": ""
      },
      {
        "label": "3 months",
        "sku": "NADINJ-3M",
        "months": 3,
        "productId": "164",
        "checkoutUrl": "https://checkout.juvenex.app/?id=164",
        "price": 897,
        "dosage": ""
      },
      {
        "label": "6 months",
        "sku": "NADINJ-6M",
        "months": 6,
        "productId": "165",
        "checkoutUrl": "https://checkout.juvenex.app/?id=165",
        "price": 1794,
        "dosage": ""
      },
      {
        "label": "12 months",
        "sku": "NADINJ-12M",
        "months": 12,
        "productId": "166",
        "checkoutUrl": "https://checkout.juvenex.app/?id=166",
        "price": 3588,
        "dosage": ""
      }
    ],
    "startingPrice": 299
  },
  {
    "slug": "glutathione",
    "name": "Glutathione",
    "category": "longevity",
    "tagline": "Antioxidant support",
    "pricingType": "single",
    "plans": [
      {
        "label": "1 month",
        "sku": "CRM-GLUTATH-1M",
        "months": 1,
        "productId": "148",
        "checkoutUrl": "https://checkout.juvenex.app/?id=148",
        "price": 57.32,
        "dosage": ""
      },
      {
        "label": "3 months",
        "sku": "GLUTA-3M",
        "months": 3,
        "productId": "149",
        "checkoutUrl": "https://checkout.juvenex.app/?id=149",
        "price": 171.96,
        "dosage": ""
      },
      {
        "label": "6 months",
        "sku": "GLUTA-6M",
        "months": 6,
        "productId": "150",
        "checkoutUrl": "https://checkout.juvenex.app/?id=150",
        "price": 343.92,
        "dosage": ""
      },
      {
        "label": "12 months",
        "sku": "GLUTA-12M",
        "months": 12,
        "productId": "151",
        "checkoutUrl": "https://checkout.juvenex.app/?id=151",
        "price": 687.84,
        "dosage": ""
      }
    ],
    "startingPrice": 57.32
  },
  {
    "slug": "pt-141",
    "name": "PT-141",
    "category": "sexual-wellness",
    "tagline": "Bremelanotide",
    "pricingType": "single",
    "plans": [
      {
        "label": "1 month",
        "sku": "PT141-1M",
        "months": 1,
        "productId": "167",
        "checkoutUrl": "https://checkout.juvenex.app/?id=167",
        "price": 189,
        "dosage": ""
      },
      {
        "label": "3 months",
        "sku": "PT141-3M",
        "months": 3,
        "productId": "168",
        "checkoutUrl": "https://checkout.juvenex.app/?id=168",
        "price": 567,
        "dosage": ""
      },
      {
        "label": "6 months",
        "sku": "PT141-6M",
        "months": 6,
        "productId": "169",
        "checkoutUrl": "https://checkout.juvenex.app/?id=169",
        "price": 1134,
        "dosage": ""
      },
      {
        "label": "12 months",
        "sku": "PT141-12M",
        "months": 12,
        "productId": "170",
        "checkoutUrl": "https://checkout.juvenex.app/?id=170",
        "price": 2268,
        "dosage": ""
      }
    ],
    "startingPrice": 189
  },
  {
    "slug": "skincare",
    "name": "Skincare",
    "category": "hair-skin",
    "tagline": "Compounded topical treatments",
    "pricingType": "medications",
    "medications": [
      {
        "name": "Anti-Aging (Sensitive)",
        "sku": "TRE-NIA-HYA-30B",
        "months": 3,
        "productId": "181",
        "checkoutUrl": "https://checkout.juvenex.app/?id=181",
        "price": 89,
        "dosage": "",
        "plans": [
          {
            "label": "3 months",
            "sku": "TRE-NIA-HYA-30B",
            "months": 3,
            "productId": "181",
            "checkoutUrl": "https://checkout.juvenex.app/?id=181",
            "price": 89,
            "dosage": ""
          }
        ]
      },
      {
        "name": "Anti-Aging (Normal)",
        "sku": "TRE-NIA-HYA-60B",
        "months": 3,
        "productId": "182",
        "checkoutUrl": "https://checkout.juvenex.app/?id=182",
        "price": 89,
        "dosage": "",
        "plans": [
          {
            "label": "3 months",
            "sku": "TRE-NIA-HYA-60B",
            "months": 3,
            "productId": "182",
            "checkoutUrl": "https://checkout.juvenex.app/?id=182",
            "price": 89,
            "dosage": ""
          }
        ]
      },
      {
        "name": "Anti-Aging (High Potency)",
        "sku": "TRE-NIA-HYA-89B",
        "months": 3,
        "productId": "183",
        "checkoutUrl": "https://checkout.juvenex.app/?id=183",
        "price": 89,
        "dosage": "",
        "plans": [
          {
            "label": "3 months",
            "sku": "TRE-NIA-HYA-89B",
            "months": 3,
            "productId": "183",
            "checkoutUrl": "https://checkout.juvenex.app/?id=183",
            "price": 89,
            "dosage": ""
          }
        ]
      },
      {
        "name": "Brightening (HQ 6%)",
        "sku": "HYD-VIT-NIA",
        "months": 3,
        "productId": "184",
        "checkoutUrl": "https://checkout.juvenex.app/?id=184",
        "price": 89,
        "dosage": "",
        "plans": [
          {
            "label": "3 months",
            "sku": "HYD-VIT-NIA",
            "months": 3,
            "productId": "184",
            "checkoutUrl": "https://checkout.juvenex.app/?id=184",
            "price": 89,
            "dosage": ""
          }
        ]
      },
      {
        "name": "Brightening (HQ 8%)",
        "sku": "HYD-TRE-VIT-NIA",
        "months": 3,
        "productId": "185",
        "checkoutUrl": "https://checkout.juvenex.app/?id=185",
        "price": 89,
        "dosage": "",
        "plans": [
          {
            "label": "3 months",
            "sku": "HYD-TRE-VIT-NIA",
            "months": 3,
            "productId": "185",
            "checkoutUrl": "https://checkout.juvenex.app/?id=185",
            "price": 89,
            "dosage": ""
          }
        ]
      },
      {
        "name": "Brightening (HQ 12%)",
        "sku": "HYD-TRE-NIA-HYD",
        "months": 3,
        "productId": "186",
        "checkoutUrl": "https://checkout.juvenex.app/?id=186",
        "price": 89,
        "dosage": "",
        "plans": [
          {
            "label": "3 months",
            "sku": "HYD-TRE-NIA-HYD",
            "months": 3,
            "productId": "186",
            "checkoutUrl": "https://checkout.juvenex.app/?id=186",
            "price": 89,
            "dosage": ""
          }
        ]
      }
    ],
    "startingPrice": 89
  },
  {
    "slug": "hpv",
    "name": "HPV / Genital Herpes",
    "category": "other",
    "tagline": "Valacyclovir packs",
    "pricingType": "medications",
    "medications": [
      {
        "name": "Valacyclovir 500mg × 36",
        "sku": "Valacyclovir500mg",
        "months": 1,
        "productId": "188",
        "checkoutUrl": "https://checkout.juvenex.app/?id=188",
        "price": 60,
        "dosage": "",
        "plans": [
          {
            "label": "1 month",
            "sku": "Valacyclovir500mg",
            "months": 1,
            "productId": "188",
            "checkoutUrl": "https://checkout.juvenex.app/?id=188",
            "price": 60,
            "dosage": ""
          }
        ]
      },
      {
        "name": "Valacyclovir 500mg × 90",
        "sku": "Valacyclovir500mgx90",
        "months": 3,
        "productId": "189",
        "checkoutUrl": "https://checkout.juvenex.app/?id=189",
        "price": 75,
        "dosage": "",
        "plans": [
          {
            "label": "3 months",
            "sku": "Valacyclovir500mgx90",
            "months": 3,
            "productId": "189",
            "checkoutUrl": "https://checkout.juvenex.app/?id=189",
            "price": 75,
            "dosage": ""
          }
        ]
      },
      {
        "name": "Valacyclovir 1g × 90",
        "sku": "Valacyclovir1gx90",
        "months": 3,
        "productId": "187",
        "checkoutUrl": "https://checkout.juvenex.app/?id=187",
        "price": 90,
        "dosage": "",
        "plans": [
          {
            "label": "3 months",
            "sku": "Valacyclovir1gx90",
            "months": 3,
            "productId": "187",
            "checkoutUrl": "https://checkout.juvenex.app/?id=187",
            "price": 90,
            "dosage": ""
          }
        ]
      }
    ],
    "startingPrice": 60
  },
  {
    "slug": "cold-sores",
    "name": "Cold Sores",
    "category": "other",
    "tagline": "Valacyclovir 1g",
    "pricingType": "single",
    "plans": [
      {
        "label": "Supply pack",
        "sku": "VALA-1G-24",
        "months": 1,
        "productId": "278",
        "checkoutUrl": "https://checkout.juvenex.app/?id=278",
        "price": 60,
        "dosage": ""
      }
    ],
    "startingPrice": 60
  },
  {
    "slug": "erectile-dysfunction",
    "name": "Erectile Dysfunction",
    "category": "sexual-wellness",
    "tagline": "Sildenafil & Tadalafil",
    "pricingType": "medications",
    "medications": [
      {
        "name": "Sildenafil 100mg — 6 pills/mo",
        "sku": "SILD-100MG-6-6-1B",
        "months": 1,
        "plans": [
          {
            "label": "1 month",
            "sku": "SILD-100MG-6-6-1B",
            "months": 1,
            "productId": "203",
            "checkoutUrl": "https://checkout.juvenex.app/?id=203",
            "price": 60,
            "dosage": ""
          },
          {
            "label": "3 months",
            "sku": "SILD-100MG-18-6-3B",
            "months": 3,
            "productId": "196",
            "checkoutUrl": "https://checkout.juvenex.app/?id=196",
            "price": 153,
            "dosage": ""
          },
          {
            "label": "6 months",
            "sku": "SILD-100MG-36-6-6B",
            "months": 6,
            "productId": "200",
            "checkoutUrl": "https://checkout.juvenex.app/?id=200",
            "price": 288,
            "dosage": ""
          },
          {
            "label": "12 months",
            "sku": "SILD-100MG-72-6-12B",
            "months": 12,
            "productId": "206",
            "checkoutUrl": "https://checkout.juvenex.app/?id=206",
            "price": 432,
            "dosage": ""
          }
        ]
      },
      {
        "name": "Sildenafil 100mg — 8 pills/mo",
        "sku": "SILD-100MG-8-8-1B",
        "months": 1,
        "plans": [
          {
            "label": "1 month",
            "sku": "SILD-100MG-8-8-1B",
            "months": 1,
            "productId": "207",
            "checkoutUrl": "https://checkout.juvenex.app/?id=207",
            "price": 80,
            "dosage": ""
          },
          {
            "label": "3 months",
            "sku": "SILD-100MG-24-8-3B",
            "months": 3,
            "productId": "197",
            "checkoutUrl": "https://checkout.juvenex.app/?id=197",
            "price": 204,
            "dosage": ""
          },
          {
            "label": "6 months",
            "sku": "SILD-100MG-48-8-6B",
            "months": 6,
            "productId": "202",
            "checkoutUrl": "https://checkout.juvenex.app/?id=202",
            "price": 384,
            "dosage": ""
          },
          {
            "label": "12 months",
            "sku": "SILD-100MG-96-8-12B",
            "months": 12,
            "productId": "209",
            "checkoutUrl": "https://checkout.juvenex.app/?id=209",
            "price": 576,
            "dosage": ""
          }
        ]
      },
      {
        "name": "Sildenafil 100mg — 10 pills/mo",
        "sku": "SILD-100MG-10-10-1B",
        "months": 1,
        "plans": [
          {
            "label": "1 month",
            "sku": "SILD-100MG-10-10-1B",
            "months": 1,
            "productId": "190",
            "checkoutUrl": "https://checkout.juvenex.app/?id=190",
            "price": 100,
            "dosage": ""
          },
          {
            "label": "3 months",
            "sku": "SILD-100MG-30-10-3B",
            "months": 3,
            "productId": "198",
            "checkoutUrl": "https://checkout.juvenex.app/?id=198",
            "price": 255,
            "dosage": ""
          },
          {
            "label": "6 months",
            "sku": "SILD-100MG-60-10-6B",
            "months": 6,
            "productId": "204",
            "checkoutUrl": "https://checkout.juvenex.app/?id=204",
            "price": 480,
            "dosage": ""
          },
          {
            "label": "12 months",
            "sku": "SILD-100MG-120-10-12B",
            "months": 12,
            "productId": "192",
            "checkoutUrl": "https://checkout.juvenex.app/?id=192",
            "price": 720,
            "dosage": ""
          }
        ]
      },
      {
        "name": "Sildenafil 100mg — 12 pills/mo",
        "sku": "SILD-100MG-12-12-1B",
        "months": 1,
        "plans": [
          {
            "label": "1 month",
            "sku": "SILD-100MG-12-12-1B",
            "months": 1,
            "productId": "191",
            "checkoutUrl": "https://checkout.juvenex.app/?id=191",
            "price": 120,
            "dosage": ""
          },
          {
            "label": "3 months",
            "sku": "SILD-100MG-36-12-3B",
            "months": 3,
            "productId": "199",
            "checkoutUrl": "https://checkout.juvenex.app/?id=199",
            "price": 306,
            "dosage": ""
          },
          {
            "label": "6 months",
            "sku": "SILD-100MG-72-12-6B",
            "months": 6,
            "productId": "205",
            "checkoutUrl": "https://checkout.juvenex.app/?id=205",
            "price": 576,
            "dosage": ""
          },
          {
            "label": "12 months",
            "sku": "SILD-100MG-144-12-12B",
            "months": 12,
            "productId": "194",
            "checkoutUrl": "https://checkout.juvenex.app/?id=194",
            "price": 864,
            "dosage": ""
          }
        ]
      },
      {
        "name": "Sildenafil 100mg — 14 pills/mo",
        "sku": "SILD-100MG-14-14-1B",
        "months": 1,
        "plans": [
          {
            "label": "1 month",
            "sku": "SILD-100MG-14-14-1B",
            "months": 1,
            "productId": "193",
            "checkoutUrl": "https://checkout.juvenex.app/?id=193",
            "price": 140,
            "dosage": ""
          },
          {
            "label": "3 months",
            "sku": "SILD-100MG-42-14-3B",
            "months": 3,
            "productId": "201",
            "checkoutUrl": "https://checkout.juvenex.app/?id=201",
            "price": 357,
            "dosage": ""
          },
          {
            "label": "6 months",
            "sku": "SILD-100MG-84-14-6B",
            "months": 6,
            "productId": "208",
            "checkoutUrl": "https://checkout.juvenex.app/?id=208",
            "price": 672,
            "dosage": ""
          },
          {
            "label": "12 months",
            "sku": "SILD-100MG-168-14-12B",
            "months": 12,
            "productId": "195",
            "checkoutUrl": "https://checkout.juvenex.app/?id=195",
            "price": 1008,
            "dosage": ""
          }
        ]
      },
      {
        "name": "Sildenafil 50mg — 6 pills/mo",
        "sku": "SILD-50MG-6-6-1B",
        "months": 1,
        "plans": [
          {
            "label": "1 month",
            "sku": "SILD-50MG-6-6-1B",
            "months": 1,
            "productId": "223",
            "checkoutUrl": "https://checkout.juvenex.app/?id=223",
            "price": 60,
            "dosage": ""
          },
          {
            "label": "3 months",
            "sku": "SILD-50MG-18-6-3B",
            "months": 3,
            "productId": "216",
            "checkoutUrl": "https://checkout.juvenex.app/?id=216",
            "price": 153,
            "dosage": ""
          },
          {
            "label": "6 months",
            "sku": "SILD-50MG-36-6-6B",
            "months": 6,
            "productId": "220",
            "checkoutUrl": "https://checkout.juvenex.app/?id=220",
            "price": 288,
            "dosage": ""
          },
          {
            "label": "12 months",
            "sku": "SILD-50MG-72-6-12B",
            "months": 12,
            "productId": "226",
            "checkoutUrl": "https://checkout.juvenex.app/?id=226",
            "price": 432,
            "dosage": ""
          }
        ]
      },
      {
        "name": "Sildenafil 50mg — 8 pills/mo",
        "sku": "SILD-50MG-8-8-1B",
        "months": 1,
        "plans": [
          {
            "label": "1 month",
            "sku": "SILD-50MG-8-8-1B",
            "months": 1,
            "productId": "227",
            "checkoutUrl": "https://checkout.juvenex.app/?id=227",
            "price": 80,
            "dosage": ""
          },
          {
            "label": "3 months",
            "sku": "SILD-50MG-24-8-3B",
            "months": 3,
            "productId": "217",
            "checkoutUrl": "https://checkout.juvenex.app/?id=217",
            "price": 204,
            "dosage": ""
          },
          {
            "label": "6 months",
            "sku": "SILD-50MG-48-8-6B",
            "months": 6,
            "productId": "222",
            "checkoutUrl": "https://checkout.juvenex.app/?id=222",
            "price": 384,
            "dosage": ""
          },
          {
            "label": "12 months",
            "sku": "SILD-50MG-96-8-12B",
            "months": 12,
            "productId": "229",
            "checkoutUrl": "https://checkout.juvenex.app/?id=229",
            "price": 576,
            "dosage": ""
          }
        ]
      },
      {
        "name": "Sildenafil 50mg — 10 pills/mo",
        "sku": "SILD-50MG-10-10-1B",
        "months": 1,
        "plans": [
          {
            "label": "1 month",
            "sku": "SILD-50MG-10-10-1B",
            "months": 1,
            "productId": "210",
            "checkoutUrl": "https://checkout.juvenex.app/?id=210",
            "price": 100,
            "dosage": ""
          },
          {
            "label": "3 months",
            "sku": "SILD-50MG-30-10-3B",
            "months": 3,
            "productId": "218",
            "checkoutUrl": "https://checkout.juvenex.app/?id=218",
            "price": 255,
            "dosage": ""
          },
          {
            "label": "6 months",
            "sku": "SILD-50MG-60-10-6B",
            "months": 6,
            "productId": "224",
            "checkoutUrl": "https://checkout.juvenex.app/?id=224",
            "price": 480,
            "dosage": ""
          },
          {
            "label": "12 months",
            "sku": "SILD-50MG-120-10-12B",
            "months": 12,
            "productId": "212",
            "checkoutUrl": "https://checkout.juvenex.app/?id=212",
            "price": 720,
            "dosage": ""
          }
        ]
      },
      {
        "name": "Sildenafil 50mg — 12 pills/mo",
        "sku": "SILD-50MG-12-12-1B",
        "months": 1,
        "plans": [
          {
            "label": "1 month",
            "sku": "SILD-50MG-12-12-1B",
            "months": 1,
            "productId": "211",
            "checkoutUrl": "https://checkout.juvenex.app/?id=211",
            "price": 120,
            "dosage": ""
          },
          {
            "label": "3 months",
            "sku": "SILD-50MG-36-12-3B",
            "months": 3,
            "productId": "219",
            "checkoutUrl": "https://checkout.juvenex.app/?id=219",
            "price": 306,
            "dosage": ""
          },
          {
            "label": "6 months",
            "sku": "SILD-50MG-72-12-6B",
            "months": 6,
            "productId": "225",
            "checkoutUrl": "https://checkout.juvenex.app/?id=225",
            "price": 576,
            "dosage": ""
          },
          {
            "label": "12 months",
            "sku": "SILD-50MG-144-12-12B",
            "months": 12,
            "productId": "214",
            "checkoutUrl": "https://checkout.juvenex.app/?id=214",
            "price": 864,
            "dosage": ""
          }
        ]
      },
      {
        "name": "Sildenafil 50mg — 14 pills/mo",
        "sku": "SILD-50MG-14-14-1B",
        "months": 1,
        "plans": [
          {
            "label": "1 month",
            "sku": "SILD-50MG-14-14-1B",
            "months": 1,
            "productId": "213",
            "checkoutUrl": "https://checkout.juvenex.app/?id=213",
            "price": 140,
            "dosage": ""
          },
          {
            "label": "3 months",
            "sku": "SILD-50MG-42-14-3B",
            "months": 3,
            "productId": "221",
            "checkoutUrl": "https://checkout.juvenex.app/?id=221",
            "price": 357,
            "dosage": ""
          },
          {
            "label": "6 months",
            "sku": "SILD-50MG-84-14-6B",
            "months": 6,
            "productId": "228",
            "checkoutUrl": "https://checkout.juvenex.app/?id=228",
            "price": 672,
            "dosage": ""
          },
          {
            "label": "12 months",
            "sku": "SILD-50MG-168-14-12B",
            "months": 12,
            "productId": "215",
            "checkoutUrl": "https://checkout.juvenex.app/?id=215",
            "price": 1008,
            "dosage": ""
          }
        ]
      },
      {
        "name": "Tadalafil 10mg — 6 pills/mo",
        "sku": "TADA-10MG-6-6-1B",
        "months": 1,
        "plans": [
          {
            "label": "1 month",
            "sku": "TADA-10MG-6-6-1B",
            "months": 1,
            "productId": "243",
            "checkoutUrl": "https://checkout.juvenex.app/?id=243",
            "price": 60,
            "dosage": ""
          },
          {
            "label": "3 months",
            "sku": "TADA-10MG-18-6-3B",
            "months": 3,
            "productId": "236",
            "checkoutUrl": "https://checkout.juvenex.app/?id=236",
            "price": 153,
            "dosage": ""
          },
          {
            "label": "6 months",
            "sku": "TADA-10MG-36-6-6B",
            "months": 6,
            "productId": "240",
            "checkoutUrl": "https://checkout.juvenex.app/?id=240",
            "price": 288,
            "dosage": ""
          },
          {
            "label": "12 months",
            "sku": "TADA-10MG-72-6-12B",
            "months": 12,
            "productId": "246",
            "checkoutUrl": "https://checkout.juvenex.app/?id=246",
            "price": 432,
            "dosage": ""
          }
        ]
      },
      {
        "name": "Tadalafil 10mg — 8 pills/mo",
        "sku": "TADA-10MG-8-8-1B",
        "months": 1,
        "plans": [
          {
            "label": "1 month",
            "sku": "TADA-10MG-8-8-1B",
            "months": 1,
            "productId": "247",
            "checkoutUrl": "https://checkout.juvenex.app/?id=247",
            "price": 80,
            "dosage": ""
          },
          {
            "label": "3 months",
            "sku": "TADA-10MG-24-8-3B",
            "months": 3,
            "productId": "237",
            "checkoutUrl": "https://checkout.juvenex.app/?id=237",
            "price": 204,
            "dosage": ""
          },
          {
            "label": "6 months",
            "sku": "TADA-10MG-48-8-6B",
            "months": 6,
            "productId": "242",
            "checkoutUrl": "https://checkout.juvenex.app/?id=242",
            "price": 384,
            "dosage": ""
          },
          {
            "label": "12 months",
            "sku": "TADA-10MG-96-8-12B",
            "months": 12,
            "productId": "249",
            "checkoutUrl": "https://checkout.juvenex.app/?id=249",
            "price": 576,
            "dosage": ""
          }
        ]
      },
      {
        "name": "Tadalafil 10mg — 10 pills/mo",
        "sku": "TADA-10MG-10-10-1B",
        "months": 1,
        "plans": [
          {
            "label": "1 month",
            "sku": "TADA-10MG-10-10-1B",
            "months": 1,
            "productId": "230",
            "checkoutUrl": "https://checkout.juvenex.app/?id=230",
            "price": 100,
            "dosage": ""
          },
          {
            "label": "3 months",
            "sku": "TADA-10MG-30-10-3B",
            "months": 3,
            "productId": "238",
            "checkoutUrl": "https://checkout.juvenex.app/?id=238",
            "price": 255,
            "dosage": ""
          },
          {
            "label": "6 months",
            "sku": "TADA-10MG-60-10-6B",
            "months": 6,
            "productId": "244",
            "checkoutUrl": "https://checkout.juvenex.app/?id=244",
            "price": 480,
            "dosage": ""
          },
          {
            "label": "12 months",
            "sku": "TADA-10MG-120-10-12B",
            "months": 12,
            "productId": "232",
            "checkoutUrl": "https://checkout.juvenex.app/?id=232",
            "price": 720,
            "dosage": ""
          }
        ]
      },
      {
        "name": "Tadalafil 10mg — 12 pills/mo",
        "sku": "TADA-10MG-12-12-1B",
        "months": 1,
        "plans": [
          {
            "label": "1 month",
            "sku": "TADA-10MG-12-12-1B",
            "months": 1,
            "productId": "231",
            "checkoutUrl": "https://checkout.juvenex.app/?id=231",
            "price": 120,
            "dosage": ""
          },
          {
            "label": "3 months",
            "sku": "TADA-10MG-36-12-3B",
            "months": 3,
            "productId": "239",
            "checkoutUrl": "https://checkout.juvenex.app/?id=239",
            "price": 306,
            "dosage": ""
          },
          {
            "label": "6 months",
            "sku": "TADA-10MG-72-12-6B",
            "months": 6,
            "productId": "245",
            "checkoutUrl": "https://checkout.juvenex.app/?id=245",
            "price": 576,
            "dosage": ""
          },
          {
            "label": "12 months",
            "sku": "TADA-10MG-144-12-12B",
            "months": 12,
            "productId": "234",
            "checkoutUrl": "https://checkout.juvenex.app/?id=234",
            "price": 864,
            "dosage": ""
          }
        ]
      },
      {
        "name": "Tadalafil 10mg — 14 pills/mo",
        "sku": "TADA-10MG-14-14-1B",
        "months": 1,
        "plans": [
          {
            "label": "1 month",
            "sku": "TADA-10MG-14-14-1B",
            "months": 1,
            "productId": "233",
            "checkoutUrl": "https://checkout.juvenex.app/?id=233",
            "price": 140,
            "dosage": ""
          },
          {
            "label": "3 months",
            "sku": "TADA-10MG-42-14-3B",
            "months": 3,
            "productId": "241",
            "checkoutUrl": "https://checkout.juvenex.app/?id=241",
            "price": 357,
            "dosage": ""
          },
          {
            "label": "6 months",
            "sku": "TADA-10MG-84-14-6B",
            "months": 6,
            "productId": "248",
            "checkoutUrl": "https://checkout.juvenex.app/?id=248",
            "price": 672,
            "dosage": ""
          },
          {
            "label": "12 months",
            "sku": "TADA-10MG-168-14-12B",
            "months": 12,
            "productId": "235",
            "checkoutUrl": "https://checkout.juvenex.app/?id=235",
            "price": 1008,
            "dosage": ""
          }
        ]
      },
      {
        "name": "Tadalafil 20mg — 6 pills/mo",
        "sku": "TADA-20MG-6-6-1B",
        "months": 1,
        "plans": [
          {
            "label": "1 month",
            "sku": "TADA-20MG-6-6-1B",
            "months": 1,
            "productId": "267",
            "checkoutUrl": "https://checkout.juvenex.app/?id=267",
            "price": 60,
            "dosage": ""
          },
          {
            "label": "3 months",
            "sku": "TADA-20MG-18-6-3B",
            "months": 3,
            "productId": "260",
            "checkoutUrl": "https://checkout.juvenex.app/?id=260",
            "price": 153,
            "dosage": ""
          },
          {
            "label": "6 months",
            "sku": "TADA-20MG-36-6-6B",
            "months": 6,
            "productId": "264",
            "checkoutUrl": "https://checkout.juvenex.app/?id=264",
            "price": 288,
            "dosage": ""
          },
          {
            "label": "12 months",
            "sku": "TADA-20MG-72-6-12B",
            "months": 12,
            "productId": "270",
            "checkoutUrl": "https://checkout.juvenex.app/?id=270",
            "price": 432,
            "dosage": ""
          }
        ]
      },
      {
        "name": "Tadalafil 20mg — 8 pills/mo",
        "sku": "TADA-20MG-8-8-1B",
        "months": 1,
        "plans": [
          {
            "label": "1 month",
            "sku": "TADA-20MG-8-8-1B",
            "months": 1,
            "productId": "271",
            "checkoutUrl": "https://checkout.juvenex.app/?id=271",
            "price": 80,
            "dosage": ""
          },
          {
            "label": "3 months",
            "sku": "TADA-20MG-24-8-3B",
            "months": 3,
            "productId": "261",
            "checkoutUrl": "https://checkout.juvenex.app/?id=261",
            "price": 204,
            "dosage": ""
          },
          {
            "label": "6 months",
            "sku": "TADA-20MG-48-8-6B",
            "months": 6,
            "productId": "266",
            "checkoutUrl": "https://checkout.juvenex.app/?id=266",
            "price": 384,
            "dosage": ""
          },
          {
            "label": "12 months",
            "sku": "TADA-20MG-96-8-12B",
            "months": 12,
            "productId": "273",
            "checkoutUrl": "https://checkout.juvenex.app/?id=273",
            "price": 576,
            "dosage": ""
          }
        ]
      },
      {
        "name": "Tadalafil 20mg — 10 pills/mo",
        "sku": "TADA-20MG-10-10-1B",
        "months": 1,
        "plans": [
          {
            "label": "1 month",
            "sku": "TADA-20MG-10-10-1B",
            "months": 1,
            "productId": "254",
            "checkoutUrl": "https://checkout.juvenex.app/?id=254",
            "price": 100,
            "dosage": ""
          },
          {
            "label": "3 months",
            "sku": "TADA-20MG-30-10-3B",
            "months": 3,
            "productId": "262",
            "checkoutUrl": "https://checkout.juvenex.app/?id=262",
            "price": 255,
            "dosage": ""
          },
          {
            "label": "6 months",
            "sku": "TADA-20MG-60-10-6B",
            "months": 6,
            "productId": "268",
            "checkoutUrl": "https://checkout.juvenex.app/?id=268",
            "price": 480,
            "dosage": ""
          },
          {
            "label": "12 months",
            "sku": "TADA-20MG-120-10-12B",
            "months": 12,
            "productId": "256",
            "checkoutUrl": "https://checkout.juvenex.app/?id=256",
            "price": 720,
            "dosage": ""
          }
        ]
      },
      {
        "name": "Tadalafil 20mg — 12 pills/mo",
        "sku": "TADA-20MG-12-12-1B",
        "months": 1,
        "plans": [
          {
            "label": "1 month",
            "sku": "TADA-20MG-12-12-1B",
            "months": 1,
            "productId": "255",
            "checkoutUrl": "https://checkout.juvenex.app/?id=255",
            "price": 120,
            "dosage": ""
          },
          {
            "label": "3 months",
            "sku": "TADA-20MG-36-12-3B",
            "months": 3,
            "productId": "263",
            "checkoutUrl": "https://checkout.juvenex.app/?id=263",
            "price": 306,
            "dosage": ""
          },
          {
            "label": "6 months",
            "sku": "TADA-20MG-72-12-6B",
            "months": 6,
            "productId": "269",
            "checkoutUrl": "https://checkout.juvenex.app/?id=269",
            "price": 576,
            "dosage": ""
          },
          {
            "label": "12 months",
            "sku": "TADA-20MG-144-12-12B",
            "months": 12,
            "productId": "258",
            "checkoutUrl": "https://checkout.juvenex.app/?id=258",
            "price": 864,
            "dosage": ""
          }
        ]
      },
      {
        "name": "Tadalafil 20mg — 14 pills/mo",
        "sku": "TADA-20MG-14-14-1B",
        "months": 1,
        "plans": [
          {
            "label": "1 month",
            "sku": "TADA-20MG-14-14-1B",
            "months": 1,
            "productId": "257",
            "checkoutUrl": "https://checkout.juvenex.app/?id=257",
            "price": 140,
            "dosage": ""
          },
          {
            "label": "3 months",
            "sku": "TADA-20MG-42-14-3B",
            "months": 3,
            "productId": "265",
            "checkoutUrl": "https://checkout.juvenex.app/?id=265",
            "price": 357,
            "dosage": ""
          },
          {
            "label": "6 months",
            "sku": "TADA-20MG-84-14-6B",
            "months": 6,
            "productId": "272",
            "checkoutUrl": "https://checkout.juvenex.app/?id=272",
            "price": 672,
            "dosage": ""
          },
          {
            "label": "12 months",
            "sku": "TADA-20MG-168-14-12B",
            "months": 12,
            "productId": "259",
            "checkoutUrl": "https://checkout.juvenex.app/?id=259",
            "price": 1008,
            "dosage": ""
          }
        ]
      },
      {
        "name": "Tadalafil Daily 2.5mg",
        "sku": "TADA-2.5MG-30-30-1B",
        "months": 1,
        "plans": [
          {
            "label": "1 month",
            "sku": "TADA-2.5MG-30-30-1B",
            "months": 1,
            "productId": "251",
            "checkoutUrl": "https://checkout.juvenex.app/?id=251",
            "price": 90,
            "dosage": ""
          },
          {
            "label": "3 months",
            "sku": "TADA-2.5MG-90-30-3B",
            "months": 3,
            "productId": "253",
            "checkoutUrl": "https://checkout.juvenex.app/?id=253",
            "price": 261.9,
            "dosage": ""
          },
          {
            "label": "6 months",
            "sku": "TADA-2.5MG-180-30-6B",
            "months": 6,
            "productId": "250",
            "checkoutUrl": "https://checkout.juvenex.app/?id=250",
            "price": 432,
            "dosage": ""
          },
          {
            "label": "12 months",
            "sku": "TADA-2.5MG-360-30-12B",
            "months": 12,
            "productId": "252",
            "checkoutUrl": "https://checkout.juvenex.app/?id=252",
            "price": 648,
            "dosage": ""
          }
        ]
      },
      {
        "name": "Tadalafil Daily 5mg",
        "sku": "TADA-5MG-30-30-1B",
        "months": 1,
        "plans": [
          {
            "label": "1 month",
            "sku": "TADA-5MG-30-30-1B",
            "months": 1,
            "productId": "275",
            "checkoutUrl": "https://checkout.juvenex.app/?id=275",
            "price": 90,
            "dosage": ""
          },
          {
            "label": "3 months",
            "sku": "TADA-5MG-90-30-3B",
            "months": 3,
            "productId": "277",
            "checkoutUrl": "https://checkout.juvenex.app/?id=277",
            "price": 261.9,
            "dosage": ""
          },
          {
            "label": "6 months",
            "sku": "TADA-5MG-180-30-6B",
            "months": 6,
            "productId": "274",
            "checkoutUrl": "https://checkout.juvenex.app/?id=274",
            "price": 432,
            "dosage": ""
          },
          {
            "label": "12 months",
            "sku": "TADA-5MG-360-30-12B",
            "months": 12,
            "productId": "276",
            "checkoutUrl": "https://checkout.juvenex.app/?id=276",
            "price": 648,
            "dosage": ""
          }
        ]
      }
    ],
    "startingPrice": 60
  }
]

export const STOREFRONT_SKIPPED = [
  {
    "product": "premature-ejaculation",
    "reason": "koverx_only_no_confident_excel_checkout_map",
    "skus": []
  },
  {
    "product": "mens-hair-loss",
    "reason": "koverx_only_no_confident_excel_checkout_map",
    "skus": []
  },
  {
    "product": "womens-hair-loss",
    "reason": "koverx_only_no_confident_excel_checkout_map",
    "skus": []
  },
  {
    "product": "eyelash-treatment",
    "reason": "koverx_only_no_confident_excel_checkout_map",
    "skus": []
  },
  {
    "product": "birth-control",
    "reason": "koverx_only_no_confident_excel_checkout_map",
    "skus": []
  },
  {
    "product": "acid-reflux",
    "reason": "koverx_only_no_confident_excel_checkout_map",
    "skus": []
  },
  {
    "product": "smoking-cessation",
    "reason": "koverx_only_no_confident_excel_checkout_map",
    "skus": []
  },
  {
    "product": "sg-maint-s3-a-excel-duplicate",
    "reason": "ambiguous_excel_rows_prefer_productId_47_over_13",
    "skus": [
      "SG-MAINT-S3-A"
    ]
  },
  {
    "product": "metformin",
    "skus": [
      "METFORM-12M"
    ]
  }
] as const

export function getStorefrontProduct(slug: string): StorefrontProduct | undefined {
  return STOREFRONT_PRODUCTS.find((p) => p.slug === slug)
}

export function getStorefrontProductsByCategory(
  key: StorefrontCategoryKey | null
): StorefrontProduct[] {
  if (!key) return STOREFRONT_PRODUCTS
  return STOREFRONT_PRODUCTS.filter((p) => p.category === key)
}

export function findStorefrontPlanByProductId(
  productId: string
): { product: StorefrontProduct; plan: StorefrontPlan } | undefined {
  for (const product of STOREFRONT_PRODUCTS) {
    for (const plan of product.plans ?? []) {
      if (plan.productId === productId) return { product, plan }
    }
    for (const med of product.medications ?? []) {
      for (const plan of med.plans ?? []) {
        if (plan.productId === productId) return { product, plan }
      }
      if (med.productId === productId && med.plans?.[0]) {
        return { product, plan: med.plans[0] }
      }
    }
  }
  return undefined
}
