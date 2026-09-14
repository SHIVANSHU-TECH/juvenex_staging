import { z } from 'zod'

const shortText = z.string().trim().min(1).max(255)
const addressText = z.string().trim().min(1).max(500)

export const productIdSchema = z.string().trim().min(1).max(64)
export const orderIdSchema = z.string().trim().min(1).max(100)
export const customerIdSchema = z.union([
  z.string().trim().min(1).max(100),
  z.coerce.number().int().positive(),
])
export const subscriptionIdSchema = z.string().trim().min(1).max(255)
const dateSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid date')

export const memberViewSchema = z.object({
  email: z.string().trim().email().max(320),
  product_id: productIdSchema,
})

export const couponSchema = z.object({
  promo_code: z.string().trim().min(1).max(100),
  product_id: productIdSchema,
})

const shippingSchema = z.object({
  email: z.string().trim().email().max(320),
  first_name: shortText,
  last_name: shortText,
  phone: z.string().trim().min(7).max(40),
  address: addressText,
  address2: z.string().trim().max(500).optional(),
  city_name: shortText,
  state_name: z.string().trim().min(2).max(100),
  zip_code: z.string().trim().min(3).max(20),
  start_url: z.string().url().max(2048),
  billingSameAsShipping: z.enum(['YES', 'NO']).optional(),
  billing_address: addressText.optional(),
  billing_city_name: shortText.optional(),
  billing_state_name: z.string().trim().min(2).max(100).optional(),
  billing_zip_code: z.string().trim().min(3).max(20).optional(),
  promo_codes: z.string().trim().max(100).nullable().optional(),
})

function validateBillingAddress(
  value: z.infer<typeof shippingSchema>,
  ctx: z.RefinementCtx
) {
  if (value.billingSameAsShipping !== 'NO') return
  const fields = [
    'billing_address',
    'billing_city_name',
    'billing_state_name',
    'billing_zip_code',
  ] as const
  for (const field of fields) {
    if (!value[field]) {
      ctx.addIssue({
        code: 'custom',
        path: [field],
        message: `${field} is required when billingSameAsShipping is NO`,
      })
    }
  }
}

export const cardOrderSchema = shippingSchema
  .extend({
    product_id: z.coerce.number().int().positive(),
    card_no: z.string().trim().regex(/^\d{12,19}$/, 'Invalid card number'),
    ex_month: z.string().trim().regex(/^(0[1-9]|1[0-2])$/, 'Invalid expiry month'),
    ex_year: z.string().trim().regex(/^\d{2,4}$/, 'Invalid expiry year'),
    cvv_no: z.string().trim().regex(/^\d{3,4}$/, 'Invalid CVV'),
    card_holder_name: shortText,
  })
  .superRefine(validateBillingAddress)

/**
 * IdunRX-style `createOrder_test` cart payload (FormData upstream).
 * One request places the whole bag via product_id[] / product_price[].
 */
export const createOrderTestSchema = shippingSchema
  .extend({
    card_no: z.string().trim().regex(/^\d{12,19}$/, 'Invalid card number'),
    ex_month: z.string().trim().regex(/^(0[1-9]|1[0-2])$/, 'Invalid expiry month'),
    ex_year: z.string().trim().regex(/^\d{2,4}$/, 'Invalid expiry year'),
    cvv_no: z.string().trim().regex(/^\d{3,4}$/, 'Invalid CVV'),
    card_holder_name: shortText,
    card_type: z
      .enum(['visa', 'mastercard', 'discover', 'american express'])
      .optional(),
    products: z
      .array(
        z.object({
          product_id: z.coerce.number().int().positive(),
          product_price: z.coerce.number().nonnegative().finite(),
          original_price: z.coerce.number().nonnegative().finite().optional(),
        })
      )
      .min(1)
      .max(20),
  })
  .superRefine(validateBillingAddress)

export const offlineOrderSchema = shippingSchema
  .extend({
    product_id: z.coerce.number().int().positive(),
    payment_token: z.string().trim().min(1).max(10_000),
  })
  .superRefine(validateBillingAddress)

/**
 * Body of `POST /api/juvenex/orders/create-intent`.
 *
 * Deliberately carries NO prices. The server looks every price up from the
 * vendor and computes the charge itself, so a tampered client can change what
 * it asks to buy but never what it pays.
 *
 * `coupons` pairs a code with the product it applies to because upstream
 * `Check_Coupons` validates a code against one product_id — a bare list of
 * codes could not be checked without guessing the pairing.
 */
export const createIntentSchema = z
  .object({
    lines: z
      .array(
        z
          .object({
            product_id: z.coerce.number().int().positive(),
            // Upstream has no quantity field: one line is always one unit.
            // Accepted (and ignored) so the client may send it harmlessly.
            quantity: z.literal(1).optional(),
          })
          .strict()
      )
      .min(1)
      .max(20),
    coupons: z
      .array(
        z
          .object({
            product_id: z.coerce.number().int().positive(),
            code: z.string().trim().min(1).max(100),
          })
          .strict()
      )
      .max(20)
      .optional(),
    shipping_state: z.string().trim().min(2).max(100).optional(),
  })
  .strict()

/**
 * One line of a finalize request: exactly an offline order minus the
 * `payment_token`, which the server supplies from the authorized
 * PaymentIntent rather than trusting the client to name it.
 */
export const finalizeOrderLineSchema = shippingSchema
  .extend({ product_id: z.coerce.number().int().positive() })
  .superRefine(validateBillingAddress)

/**
 * Body of `POST /api/juvenex/orders/finalize`. `.strict()` on the envelope is
 * what makes a stray `card_no` a 400 instead of a silently stripped field.
 */
export const finalizeOrderSchema = z
  .object({
    intent_id: z
      .string()
      .trim()
      .max(255)
      .regex(/^pi_[A-Za-z0-9_]+$/, 'Not a PaymentIntent id'),
    lines: z.array(finalizeOrderLineSchema).min(1).max(20),
  })
  .strict()

export const customPriceOfflineOrderSchema = shippingSchema
  .extend({
    product_id: z.array(z.coerce.number().int().positive()).min(1).max(100),
    product_price: z
      .array(z.coerce.number().nonnegative().finite())
      .min(1)
      .max(100)
      .optional(),
    parent_order: z.union([z.string().trim().min(1).max(100), z.number().int().positive()]),
    payment_token: z.string().trim().min(1).max(10_000),
  })
  .superRefine((value, ctx) => {
    validateBillingAddress(value, ctx)
    if (value.product_price && value.product_price.length !== value.product_id.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['product_price'],
        message: 'product_price must have the same number of entries as product_id',
      })
    }
  })

export const getOrderSchema = z.object({ order_id: orderIdSchema })

export const listOrdersSchema = z.object({
  email: z.string().trim().email().max(320),
  start_date: dateSchema.optional(),
  end_date: dateSchema.optional(),
  is_test: z.union([z.literal(0), z.literal(1)]).optional(),
})

export const listOrdersUpdatedSinceSchema = z.object({
  email: z.string().trim().email().max(320),
  updated_since: dateSchema,
})

export const updateShippingAddressSchema = z.object({
  order_id: orderIdSchema,
  shipping_address: addressText,
  shipping_city: shortText,
  shipping_state: z.string().trim().length(2).transform((value) => value.toUpperCase()),
  shipping_zip: z.string().trim().min(3).max(20),
})

export const getCustomerSchema = z.object({
  email: z.string().trim().email().max(320),
})

export const customerViewSchema = z.object({ customer_id: customerIdSchema })
export const getEnrollmentSchema = getOrderSchema

export const cancelEnrollmentSchema = z.object({
  subscription_id: subscriptionIdSchema,
})

export const cancelOwnedEnrollmentSchema = cancelEnrollmentSchema.extend({
  order_id: orderIdSchema,
})

export const getOrderHistorySchema = z.object({
  order_id: orderIdSchema,
  email: z.string().trim().email().max(320),
})

export const getOrderByPaymentTokenSchema = z.object({
  payment_token: z.string().trim().min(1).max(10_000),
  email: z.string().trim().email().max(320).optional(),
  start_date: dateSchema.optional(),
  end_date: dateSchema.optional(),
}).superRefine((value, ctx) => {
  if (!value.start_date || !value.end_date) return
  const start = new Date(value.start_date)
  const end = new Date(value.end_date)
  if (start > end) {
    ctx.addIssue({ code: 'custom', path: ['end_date'], message: 'end_date must be after start_date' })
    return
  }
  if (end.getTime() - start.getTime() > 90 * 24 * 60 * 60 * 1000) {
    ctx.addIssue({ code: 'custom', path: ['end_date'], message: 'Date range cannot exceed 90 days' })
  }
})

const optionalAddress = z.string().trim().min(1).max(500).optional()
const optionalPlace = z.string().trim().min(1).max(255).optional()

export const updateOrderSchema = z
  .object({
    order_id: orderIdSchema,
    billing_address1: optionalAddress,
    billing_address: optionalAddress,
    billing_city: optionalPlace,
    billing_city_name: optionalPlace,
    billing_state: optionalPlace,
    billing_state_name: optionalPlace,
    billing_country: z.string().trim().length(2).optional(),
    billing_zip: optionalPlace,
    billing_zip_code: optionalPlace,
    shipping_address1: optionalAddress,
    shipping_address: optionalAddress,
    address: optionalAddress,
    shipping_city: optionalPlace,
    city_name: optionalPlace,
    shipping_state: optionalPlace,
    state_name: optionalPlace,
    shipping_country: z.string().trim().length(2).optional(),
    country: z.string().trim().length(2).optional(),
    shipping_zip: optionalPlace,
    zip_code: optionalPlace,
    cc_number: z.string().trim().regex(/^\d{12,19}$/, 'Invalid card number').optional(),
    cc_payment_type: z.string().trim().min(1).max(30).optional(),
    cc_expiration_date: z.coerce.string().regex(/^(0[1-9]|1[0-2])\d{2}$/, 'Use MMYY').optional(),
  })
  .superRefine((value, ctx) => {
    if (Object.keys(value).some((key) => key !== 'order_id')) return
    ctx.addIssue({ code: 'custom', message: 'At least one order field must be updated' })
  })

export const patientMessageSchema = getOrderSchema

export const sendPatientMessageSchema = z
  .object({
    order_id: orderIdSchema,
    text: z.string().trim().max(10_000).optional(),
  })
  .refine((value) => Boolean(value.text), {
    message: 'Text is required when no file is attached',
    path: ['text'],
  })

export const pendingFormsInputSchema = z.object({
  email: z.string().trim().email().max(320),
  order_id: orderIdSchema.optional(),
})

/**
 * One row of the vendor's pending-forms list.
 *
 * Parsed per-row (see `parsePendingForms`) rather than as part of a whole-response
 * array, so a single malformed row can't blank the entire intake UI. `form_url`
 * is only trusted when `action` actually calls for it — see `intakeFormUrl`.
 */
export const pendingFormSchema = z.object({
  order_id: z.string(),
  time: z.string(),
  email: z.string(),
  product_name: z.string(),
  product_price: z.string(),
  order_status: z.string(),
  action: z.enum(['intake', 'check_in', 'completed', 'pending']),
  action_label: z.string(),
  is_sub: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  stage: z.string().nullable(),
  needs: z.string().nullable(),
  form_id: z.string().nullable(),
  form_url: z.string().url().nullable(),
  form_id_new: z.string().nullable(),
  form_url_new: z.string().url().nullable(),
  continuation_link: z.string().nullable(),
  therapy_group: z.string().nullable(),
})

export const pendingFormsResponseSchema = z.object({
  status: z.literal(1),
  site_id: z.number().optional(),
  email: z.string(),
  total: z.number(),
  forms: z.array(pendingFormSchema),
})

export type MemberViewInput = z.infer<typeof memberViewSchema>
export type CouponInput = z.infer<typeof couponSchema>
export type CardOrderInput = z.infer<typeof cardOrderSchema>
export type CreateOrderTestInput = z.infer<typeof createOrderTestSchema>
export type OfflineOrderInput = z.infer<typeof offlineOrderSchema>
export type CustomPriceOfflineOrderInput = z.infer<typeof customPriceOfflineOrderSchema>
export type CreateIntentInput = z.infer<typeof createIntentSchema>
export type FinalizeOrderInput = z.infer<typeof finalizeOrderSchema>
export type FinalizeOrderLineInput = z.infer<typeof finalizeOrderLineSchema>
export type GetOrderInput = z.infer<typeof getOrderSchema>
export type ListOrdersInput = z.infer<typeof listOrdersSchema>
export type ListOrdersUpdatedSinceInput = z.infer<typeof listOrdersUpdatedSinceSchema>
export type UpdateShippingAddressInput = z.infer<typeof updateShippingAddressSchema>
export type GetCustomerInput = z.infer<typeof getCustomerSchema>
export type CustomerViewInput = z.infer<typeof customerViewSchema>
export type GetEnrollmentInput = z.infer<typeof getEnrollmentSchema>
export type CancelEnrollmentInput = z.infer<typeof cancelEnrollmentSchema>
export type CancelOwnedEnrollmentSchemaInput = z.infer<typeof cancelOwnedEnrollmentSchema>
export type GetOrderHistoryInput = z.infer<typeof getOrderHistorySchema>
export type GetOrderByPaymentTokenInput = z.infer<typeof getOrderByPaymentTokenSchema>
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>
export type PatientMessageInput = z.infer<typeof patientMessageSchema>
export type SendPatientMessageInput = z.infer<typeof sendPatientMessageSchema>
export type PendingFormsInput = z.infer<typeof pendingFormsInputSchema>
export type PendingForm = z.infer<typeof pendingFormSchema>
export type PendingFormsResponse = z.infer<typeof pendingFormsResponseSchema>
