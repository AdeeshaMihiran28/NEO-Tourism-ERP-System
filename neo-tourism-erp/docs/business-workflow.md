# Business workflow

## Main journey

1. A lead enters manually or through the signed website webhook.
2. An authorized Sales user claims/receives it, records notes and follow-ups, and advances the pipeline.
3. `Sale Made` creates one draft Payment Card. Duplicate attempts are rejected.
4. Sales completes and submits the card; it becomes read-only and Operations/Admin is notified.
5. Operations accepts the sale and creates one Booking folder with a concurrency-safe folder number.
6. Operations assigns ownership and manages passengers, supplier services, references, documents, notes, tasks, and travel dates.
7. Accounts records and verifies incoming/outgoing payments, approves traceable adjustments, resolves discrepancies, and explicitly completes reconciliation.
8. The lifecycle evaluator derives travel state. A folder closes only when travel is complete, Operations is complete, and Accounts is reconciled.
9. Closing is audited, relevant users are notified, and a first-time customer becomes a repeat customer. Authorized users can reopen with a mandatory reason.

## Repeatable test mapping

The journey is tested across `sales-handover.e2e-spec.ts`, `bookings.e2e-spec.ts`, `accounts-reconciliation.e2e-spec.ts`, and `booking-lifecycle.e2e-spec.ts`. The suites verify stored state, audit records, notifications, ownership, duplicate prevention, decimal calculations, closure prerequisites, protected closed-folder edits, and reopen behavior.

Related resilience suites cover concurrent booking creation, concurrent dashboard authorization, repeated scheduler execution, missed callback escalation, inactive-user login, unauthorized record access, HR/IT boundaries, dashboard boundaries, and webhook idempotency.

## Attention rule

An active lead requires attention when meaningful activity is stale beyond the configured three-day rule and there is no valid future callback, or when a scheduled follow-up is missed. A future scheduled callback suppresses inactivity attention. Repeated evaluation is idempotent and does not repeatedly create the same attention notification.
