// Thin re-export — the drawer was split into `./order-drawer/` (index +
// per-section files) so each module stays under the 800-line cohesion budget.
// Existing imports `from '@/components/admin/OrderDetailDrawer'` keep working.
export { default } from './order-drawer'
export type {
  AdminOrderDetail,
  OrderDetailDrawerProps,
} from './order-drawer/types'
