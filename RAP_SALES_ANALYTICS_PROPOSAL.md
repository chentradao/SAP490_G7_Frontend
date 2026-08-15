# RAP sales analytics proposal

## Why a cost snapshot is needed

Do not calculate historical profit from the current BOM and current material price alone. When either changes, old profit would also change. Create a cost snapshot when an order becomes `PAID` (or `CONFIRMED`, depending on the accounting rule).

## Recommended persistence table

Create `ZG7_ORDER_COST` with this key and payload:

- `MANDT`
- `ORDER_ID`
- `ITEM_NO`
- `COMPONENT_MATERIAL`
- `BUSINESS_DATE`
- `FOOD_MATERIAL`
- `SOLD_QUANTITY`
- `BOM_COMPONENT_QUANTITY`
- `COMPONENT_UNIT`
- `UNIT_CONVERSION_FACTOR`
- `EFFECTIVE_COMPONENT_PRICE`
- `PRICE_UNIT`
- `CURRENCY`
- `COMPONENT_COST`
- `CREATED_AT`

`COMPONENT_COST = SOLD_QUANTITY * BOM_COMPONENT_QUANTITY * UNIT_CONVERSION_FACTOR * EFFECTIVE_COMPONENT_PRICE / PRICE_UNIT`.

Populate it idempotently when payment changes to `PAID`. The unique key prevents the same order from posting cost twice. Use the effective material valuation or purchasing price required by the business, and convert units/currency before storing the snapshot.

## Read-only analytics entity

Expose a CDS projection/entity set named `SalesAnalyticsDaily` through `ZSD_G7_CANTEEN` with:

- `BusinessDate` (`Edm.Date`)
- `Revenue` (`Edm.Decimal`)
- `MaterialCost` (`Edm.Decimal`)
- `Profit` (`Edm.Decimal`)
- `Currency`

Aggregate only paid orders:

- `Revenue = SUM(Orders.TotalAmount)` where `PaymentStatus = 'PAID'`
- `MaterialCost = SUM(ZG7_ORDER_COST.COMPONENT_COST)`
- `Profit = Revenue - MaterialCost`

The UI already attempts to read `/SalesAnalyticsDaily` and will automatically display all three chart lines when the entity becomes available. Until then it falls back to paid-order revenue and explicitly marks cost/profit unavailable.
