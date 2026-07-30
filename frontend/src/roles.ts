/**
 * Role labels. Its own module because the header needs them too, and importing from
 * a view would pull a whole screen's worth of code into the site chrome.
 *
 * `Record<Role, string>` is exhaustive on purpose: `Role` is generated from
 * `common/openapi.yaml`, so a new role there fails to type-check until labelled.
 */

import type { Role } from './openapi';

export const ROLE_LABELS: Record<Role, string> = {
  CarDealer: 'Car dealer',
  LeasingCompany: 'Leasing company',
  Customer: 'Customer',
};
