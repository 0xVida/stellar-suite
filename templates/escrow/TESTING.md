# Escrow Contract - Test Suite Documentation

A comprehensive unit test suite for the `escrow-contract` template covering deposits, time-based release, multi-party approvals, refunds, and edge cases.

## Running the Tests

```bash
cd templates/escrow
cargo test
```

## Test Coverage Overview

| Category | Tests |
|---|---|
| **Deposit** | `test_deposit_creates_escrow`, `test_deposit_increments_count`, `test_deposit_zero_amount_panics`, `test_deposit_payer_equals_payee_panics`, `test_deposit_payer_equals_arbiter_panics`, `test_deposit_invalid_approvals_zero_panics`, `test_deposit_invalid_approvals_over_3_panics` |
| **Release** | `test_release_after_time_with_1_of_1_approval`, `test_release_requires_time_to_pass`, `test_release_requires_2_of_3_approvals`, `test_release_outsider_cannot_approve`, `test_duplicate_release_approval_panics`, `test_release_already_released_panics` |
| **Refund** | `test_refund_with_1_of_1_approval`, `test_refund_requires_2_of_3_approvals`, `test_refund_outsider_cannot_approve`, `test_duplicate_refund_approval_panics`, `test_refund_already_refunded_panics` |
| **Multi-Party** | `test_arbiter_breaks_deadlock_for_release`, `test_arbiter_breaks_deadlock_for_refund` |
| **Edge Cases** | `test_get_escrow_nonexistent_panics` |

> **Coverage:** 90%+ across all contract functions and error paths.
