# Juvenex API integration

The upstream Juvenex credential is used only by the server-side client in
`src/lib/juvenex/client.ts`. Configure it at runtime:

```env
JUVENEX_API_BASE_URL=https://panel.whitelabelmd.com/juvenex/api/v1
JUVENEX_API_KEY=replace-with-a-rotated-key
```

Do not use a `NEXT_PUBLIC_` prefix for the key. The configured credential stays
server-side and is never returned by an application endpoint.

## Application endpoints

| Method | Endpoint | Authentication |
|---|---|---|
| GET | `/api/juvenex/products` | Public, rate limited |
| GET | `/api/juvenex/products/:id` | Public, rate limited |
| POST | `/api/juvenex/member` | Public, rate limited |
| POST | `/api/juvenex/coupons` | Public, rate limited |
| POST | `/api/juvenex/orders` | Signed-in user |
| POST | `/api/juvenex/orders/offline` | Signed-in user |
| POST | `/api/juvenex/orders/custom-price-offline` | Super admin |

### Member portal endpoints

All member-portal endpoints use `POST`, require a signed-in user, and live
under `/api/juvenex/portal/`:

- `get-order`, `list-orders`, `list-orders-updated-since`
- `update-shipping-address`, `update-order`
- `get-customer`, `customer-view`
- `get-enrollment`, `cancel-enrollment`
- `get-order-history`, `get-order-by-payment-token`
- `patient-message`, `send-patient-message`

The app supplies the authenticated profile email to the upstream service;
callers cannot select another member's email. Order reads and mutations verify
that the upstream order email belongs to the signed-in profile. Enrollment
cancellation additionally verifies that the subscription belongs to the
specified owned order.

`send-patient-message` accepts JSON for text-only messages, or multipart form
data for text/files. Uploads are limited to images/PDFs no larger than 10MB.

POST bodies match the partner documentation. Order email must match the
signed-in profile. The custom-price route is restricted because accepting an
arbitrary client-supplied price from a normal customer would permit price
tampering.

All request bodies are validated before forwarding. Upstream business
responses (`status` 0, 1, or 5) are passed through unchanged; transport,
timeout, configuration, and malformed-response failures use an HTTP error.
Card and CVV values are forwarded directly and are never logged or persisted
by this integration.
