// Labels for the leasing roles. Its own module because the parties view and anything
// that renders the current session both want them.
//
// `Record<Role, string>` is exhaustive on purpose: `Role` is generated from
// `common/openapi.yaml`, so a new role there fails to type-check until it is labelled.

import type { Role } from './openapi';

export const ROLE_LABELS: Record<Role, string> = {
    CarDealer: 'Car dealer',
    LeasingCompany: 'Leasing company',
    Customer: 'Customer',
};
