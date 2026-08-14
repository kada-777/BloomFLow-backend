# Latest Receiving Distribution Plan Scope

## Goal

Ensure Head Office Distribution Planning generates a plan only for flowers accepted in the latest completed receiving date, combining all completed receiving records from that date.

## Scope

- Automatically identify the latest `receivedDate` among `COMPLETED` receivings when generating a plan without an explicit receiving ID.
- Load every `COMPLETED` receiving on that date.
- Aggregate each receiving item's `acceptedQuantity` by `flowerId`.
- Exclude flowers whose aggregated accepted quantity is zero from distribution plan items.
- Use the aggregated quantities for forced branch allocation.
- Keep the frontend `POST /forecasts` payload unchanged.
- Return a clear conflict/error when no completed receiving exists instead of generating an unscoped plan.

Receiving records from earlier dates are not included. The receiving date is the calendar date stored by the backend, not the browser's current local date.

## Design

The forecast service will resolve a receiving allocation source before building recommendations. When no `receivingId` is supplied, it will query the latest completed receiving date and then load all completed receiving records with that date. Their items will be reduced into one allocation object containing the aggregated accepted quantity per flower.

The recommendation list will be filtered to flower IDs present in the aggregated receiving map with a positive accepted quantity. The existing forced allocation algorithm will consume the aggregated items, distributing each flower's accepted quantity across branches using recommendation or forecast weights. The resulting distribution plan will therefore contain no flower type absent from the latest receiving date.

An explicit `receivingId`, if used by an existing caller, remains supported and continues to load one completed receiving record. The automatic path is used by the current frontend, which sends no receiving ID. If the automatic path finds no completed receiving, generation fails before forecast or plan persistence with a clear `409` error.

## Error Handling

- No completed receiving: return `409` with a message that a completed receiving is required before generating a distribution plan.
- Incomplete explicit receiving: retain the existing validation that only `COMPLETED` receiving can be allocated.
- Multiple same-date records: aggregate quantities rather than overwriting duplicate flower IDs.
- Zero accepted quantity: exclude that flower from the aggregate and resulting plan.

## Testing

- Unit-test automatic loading of all completed receivings on the latest date.
- Verify same-date quantities aggregate per flower and earlier dates are ignored.
- Verify zero accepted quantity is excluded.
- Verify generated plan creation receives only eligible recommendations.
- Verify no completed receiving returns the expected conflict.
- Run the backend test suite and frontend production build.
