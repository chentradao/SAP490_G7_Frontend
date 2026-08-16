# Backend ABAP: doanh thu và chi phí nhập hàng

Tài liệu này là bản MVP để nhập thủ công bằng ADT/Eclipse. Không có lợi nhuận, BOM costing hoặc bảng snapshot giá vốn.

## 1. Package và thứ tự tạo object

Trong ADT, tạo subpackage `ZG7_ANALYTICS` bên dưới package chính đang chứa `ZSD_G7_CANTEEN`.

Với folder logic `FULL` của abapGit, các object này sẽ nằm trong thư mục tương đương:

```text
src/zg7_analytics/
```

Tạo và activate theo đúng thứ tự:

1. `ZI_G7_ORDER_FIN_BASE` — Data Definition.
2. `ZI_G7_SALES_DAILY` — Data Definition.
3. `ZI_G7_PURCHASE_COST_BASE` — Data Definition.
4. `ZI_G7_PURCHASE_COST_DAILY` — Data Definition.
5. `ZI_G7_ADMIN_FIN_UNION` — Data Definition.
6. `ZC_G7_ADMIN_FINANCE_DAILY` — Data Definition.
7. Sửa Service Definition `ZSD_G7_CANTEEN`.
8. Activate và publish lại Service Binding `ZSB_G7_CANTEEN`.

Không cần tạo database table hoặc ABAP class mới cho phạm vi này.

---

## 2. `ZI_G7_ORDER_FIN_BASE`

ADT: **New → Other ABAP Repository Object → Core Data Services → Data Definition**.

Tên object: `ZI_G7_ORDER_FIN_BASE`

```abap
@AbapCatalog.viewEnhancementCategory: [#NONE]
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'G7 Order Finance Base'
@Metadata.ignorePropagatedAnnotations: true

define view entity ZI_G7_ORDER_FIN_BASE
  as select from zg7_order as OrderData
{
  key OrderData.order_id as OrderID,

      // ZG7_ORDER-ORDER_DATE dang la CHAR(8) theo format YYYYMMDD.
      cast( OrderData.order_date as abap.dats ) as BusinessDate,

      OrderData.order_status   as OrderStatus,
      OrderData.payment_status as PaymentStatus,

      @Semantics.amount.currencyCode: 'Currency'
      OrderData.total_amount as TotalAmount,

      OrderData.currency as Currency
}
where OrderData.order_date <> ''
```

MVP đang nhóm doanh thu theo `OrderDate`. Nếu sau này đơn có thể được thanh toán vào ngày khác ngày tạo, nên đổi `BusinessDate` sang ngày lấy từ `ZG7_PAYMENT-PAYMENT_TIME`.

---

## 3. `ZI_G7_SALES_DAILY`

Tên object: `ZI_G7_SALES_DAILY`

```abap
@AbapCatalog.viewEnhancementCategory: [#NONE]
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'G7 Daily Successful and Cancelled Orders'
@Metadata.ignorePropagatedAnnotations: true

define view entity ZI_G7_SALES_DAILY
  as select from ZI_G7_ORDER_FIN_BASE
{
  key BusinessDate,
  key Currency,

      cast(
        sum(
          case
            when PaymentStatus = 'PAID'
             and ( OrderStatus = 'CONFIRMED' or OrderStatus = 'COMPLETED' )
            then 1
            else 0
          end
        ) as abap.int8
      ) as SuccessfulOrderCount,

      @Semantics.amount.currencyCode: 'Currency'
      cast(
        sum(
          case
            when PaymentStatus = 'PAID'
             and ( OrderStatus = 'CONFIRMED' or OrderStatus = 'COMPLETED' )
            then TotalAmount
            else cast( 0 as abap.dec( 16, 2 ) )
          end
        ) as abap.dec( 31, 2 )
      ) as Revenue,

      cast(
        sum(
          case
            when OrderStatus = 'CANCELLED'
            then 1
            else 0
          end
        ) as abap.int8
      ) as CancelledOrderCount,

      @Semantics.amount.currencyCode: 'Currency'
      cast(
        sum(
          case
            when OrderStatus = 'CANCELLED'
            then TotalAmount
            else cast( 0 as abap.dec( 16, 2 ) )
          end
        ) as abap.dec( 31, 2 )
      ) as CancelledOrderAmount
}
group by
  BusinessDate,
  Currency
```

Quy tắc:

```text
Đơn thành công = PAID và CONFIRMED/COMPLETED
Doanh thu      = tổng TotalAmount của đơn thành công
Đơn hủy        = OrderStatus = CANCELLED
Giá trị hủy    = tổng TotalAmount của đơn hủy
```

---

## 4. `ZI_G7_PURCHASE_COST_BASE`

Tên object: `ZI_G7_PURCHASE_COST_BASE`

View này lấy từng lần Goods Receipt đã post và nhân số lượng thực nhập với đơn giá PO request.

```abap
@AbapCatalog.viewEnhancementCategory: [#NONE]
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'G7 Posted Raw Material Receipt Cost Base'
@Metadata.ignorePropagatedAnnotations: true

define view entity ZI_G7_PURCHASE_COST_BASE
  as select from zg7_gr_request as GR
    inner join zg7_po_request as PO
      on  GR.purchase_order = PO.purchase_order
      and GR.material       = PO.material
      and GR.plant          = PO.plant
      and GR.storage_loc    = PO.storage_loc
      and GR.unit           = PO.unit
{
  key GR.request_id as GoodsReceiptRequestID,

      GR.posting_date  as BusinessDate,
      GR.purchase_order as PurchaseOrder,
      GR.purchase_order_item as PurchaseOrderItem,
      GR.material      as Material,

      PO.company_code  as CompanyCode,
      GR.plant         as Plant,
      GR.storage_loc   as StorageLocation,
      GR.movement_type as MovementType,

      @Semantics.quantity.unitOfMeasure: 'Unit'
      case
        when GR.movement_type = '102'
        then cast( 0 as abap.dec( 13, 3 ) ) - GR.gr_quantity
        else GR.gr_quantity
      end as ReceivedQuantity,

      GR.unit as Unit,

      @Semantics.amount.currencyCode: 'Currency'
      PO.price as UnitPrice,

      @Semantics.amount.currencyCode: 'Currency'
      cast(
        case
          when GR.movement_type = '102'
          then cast( 0 as abap.dec( 31, 2 ) )
               - ( GR.gr_quantity * PO.price )
          else GR.gr_quantity * PO.price
        end as abap.dec( 31, 2 )
      ) as PurchaseCost,

      PO.currency as Currency
}
where
      GR.status       = 'POSTED'
  and GR.posting_date <> '00000000'
  and ( GR.movement_type = '101' or GR.movement_type = '102' )
  and PO.company_code = 'PT01'
  and PO.plant        = 'P001'
  and PO.storage_loc  = 'RM01'
  and PO.purchase_order <> ''
```

Ý nghĩa movement type:

- `101`: nhập hàng, cộng chi phí.
- `102`: đảo Goods Receipt, trừ lại chi phí.

Backend hiện tạo PO với `PRICE_UNIT = 1`, nên MVP dùng `GR quantity × PO.price`. Nếu sau này PO cho phép price unit khác 1 thì cần lưu `PRICE_UNIT` vào `ZG7_PO_REQUEST` và chia thêm cho field đó.

### Lưu ý quan trọng về join

`ZG7_PO_REQUEST` hiện không lưu `PURCHASE_ORDER_ITEM`, trong khi `ZG7_GR_REQUEST` có field này. Code trên đúng với flow hiện tại vì mỗi request tạo một PO có một item `00010`.

Nếu sau này một PO có nhiều item trùng material/plant/storage location, phải bổ sung `PURCHASE_ORDER_ITEM` vào `ZG7_PO_REQUEST` rồi thêm điều kiện join:

```abap
and GR.purchase_order_item = PO.purchase_order_item
```

---

## 5. `ZI_G7_PURCHASE_COST_DAILY`

Tên object: `ZI_G7_PURCHASE_COST_DAILY`

```abap
@AbapCatalog.viewEnhancementCategory: [#NONE]
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'G7 Daily Raw Material Receipt Cost'
@Metadata.ignorePropagatedAnnotations: true

define view entity ZI_G7_PURCHASE_COST_DAILY
  as select from ZI_G7_PURCHASE_COST_BASE
{
  key BusinessDate,
  key Currency,

      @Semantics.amount.currencyCode: 'Currency'
      cast(
        sum( PurchaseCost ) as abap.dec( 31, 2 )
      ) as PurchaseCost
}
group by
  BusinessDate,
  Currency
```

---

## 6. `ZI_G7_ADMIN_FIN_UNION`

Tên object: `ZI_G7_ADMIN_FIN_UNION`

Không dùng inner join giữa doanh thu và nhập hàng, vì có ngày chỉ bán hàng hoặc chỉ nhập hàng. `UNION ALL` bảo đảm những ngày đó vẫn xuất hiện.

```abap
@AbapCatalog.viewEnhancementCategory: [#NONE]
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'G7 Admin Finance Daily Union'
@Metadata.ignorePropagatedAnnotations: true

define view entity ZI_G7_ADMIN_FIN_UNION
  as select from ZI_G7_SALES_DAILY
{
  key BusinessDate,
  key Currency,

      cast( SuccessfulOrderCount as abap.int8 ) as SuccessfulOrderCount,

      cast( Revenue as abap.dec( 31, 2 ) ) as Revenue,

      cast( CancelledOrderCount as abap.int8 ) as CancelledOrderCount,

      cast( CancelledOrderAmount as abap.dec( 31, 2 ) ) as CancelledOrderAmount,

      cast( 0 as abap.dec( 31, 2 ) ) as PurchaseCost
}

union all

select from ZI_G7_PURCHASE_COST_DAILY
{
  key BusinessDate,
  key Currency,

  cast( 0 as abap.int8 ) as SuccessfulOrderCount,

  cast( 0 as abap.dec( 31, 2 ) ) as Revenue,

  cast( 0 as abap.int8 ) as CancelledOrderCount,

  cast( 0 as abap.dec( 31, 2 ) ) as CancelledOrderAmount,

  cast( PurchaseCost as abap.dec( 31, 2 ) ) as PurchaseCost
}
```

Không đặt element annotation trong các branch của `UNION ALL` vì release
ABAP hiện tại có thể báo annotation không được hỗ trợ tại union branch.
`ZI_G7_ADMIN_FIN_UNION` chỉ dùng để hợp nhất dữ liệu. Toàn bộ annotation
amount/currency được đặt ở view cuối `ZC_G7_ADMIN_FINANCE_DAILY`.

Không cast `BusinessDate` hoặc `Currency` trong view union. `BusinessDate`
của hai source đều đã có technical type `DATS`: phía sales được chuẩn hóa
trong `ZI_G7_ORDER_FIN_BASE`, phía purchase kế thừa từ `POSTING_DATE/BUDAT`.
Hai source `Currency` cũng đã kế thừa currency type từ `WAERS`.

Release ABAP của project yêu cầu key definition giống nhau giữa các union
branch, vì vậy cả nhánh sales và nhánh purchase đều khai báo `key
BusinessDate` và `key Currency`.

---

## 7. `ZC_G7_ADMIN_FINANCE_DAILY`

Tên object: `ZC_G7_ADMIN_FINANCE_DAILY`

Đây là entity cuối cùng frontend sẽ gọi.

```abap
@AbapCatalog.viewEnhancementCategory: [#NONE]
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'G7 Admin Revenue and Purchase Cost Daily'
@Metadata.ignorePropagatedAnnotations: true

define view entity ZC_G7_ADMIN_FINANCE_DAILY
  as select from ZI_G7_ADMIN_FIN_UNION
{
  key BusinessDate,
  key Currency,

      cast(
        sum( SuccessfulOrderCount ) as abap.int8
      ) as SuccessfulOrderCount,

      @Semantics.amount.currencyCode: 'Currency'
      cast(
        sum( Revenue ) as abap.dec( 31, 2 )
      ) as Revenue,

      cast(
        sum( CancelledOrderCount ) as abap.int8
      ) as CancelledOrderCount,

      @Semantics.amount.currencyCode: 'Currency'
      cast(
        sum( CancelledOrderAmount ) as abap.dec( 31, 2 )
      ) as CancelledOrderAmount,

      @Semantics.amount.currencyCode: 'Currency'
      cast(
        sum( PurchaseCost ) as abap.dec( 31, 2 )
      ) as PurchaseCost
}
group by
  BusinessDate,
  Currency
```

OData entity sẽ trả về dạng:

```json
{
  "BusinessDate": "2026-08-16",
  "Currency": "VND",
  "SuccessfulOrderCount": 25,
  "Revenue": 3500000,
  "CancelledOrderCount": 3,
  "CancelledOrderAmount": 250000,
  "PurchaseCost": 1200000
}
```

---

## 8. Sửa `ZSD_G7_CANTEEN`

Thêm dòng expose trước dấu `}` cuối cùng:

```abap
expose ZC_G7_ADMIN_FINANCE_DAILY as AdminFinanceDaily;
```

Phần cuối service definition sẽ giống:

```abap
  expose ZI_G7_MRP_PLANNED_ORDER as MRPPlannedOrders;
  expose ZI_G7_MRP_PURCHASE_REQ as MRPPurchaseRequisitions;

  expose ZC_G7_ADMIN_FINANCE_DAILY as AdminFinanceDaily;
}
```

Sau đó:

1. Activate Service Definition.
2. Mở `ZSB_G7_CANTEEN`.
3. Publish lại service binding nếu ADT yêu cầu.
4. Mở Preview hoặc `$metadata` và kiểm tra entity set `AdminFinanceDaily`.

URL frontend dự kiến:

```text
/AdminFinanceDaily
```

Các field select:

```text
BusinessDate,Currency,SuccessfulOrderCount,Revenue,
CancelledOrderCount,CancelledOrderAmount,PurchaseCost
```

---

## 9. Sửa bắt buộc cho thanh toán thủ công

Frontend và CDS doanh thu đang đọc `ZG7_ORDER-PAYMENT_STATUS`. Trong `ZBP_C_G7_PAYMENT`, action `confirmPayment` hiện chỉ update `ZG7_PAYMENT` thành `PAID`.

### 9.1 Chặn confirm nhiều lần

Trong method `confirmPayment`, ngay sau khi đọc `LT_PAYMENTS`, thêm:

```abap
DELETE LT_PAYMENTS WHERE PaymentStatus = 'PAID'.

IF LT_PAYMENTS IS INITIAL.
  RETURN.
ENDIF.
```

Việc này cũng ngăn stock bị trừ lại khi action được gọi lần hai.

### 9.2 Đồng bộ payment status sang order

Trong loop hiện đang update `ZG7_PAYMENT`, thay phần đó bằng:

```abap
DATA LV_UPDATED_AT TYPE ZG7_ORDER-UPDATED_AT.
LV_UPDATED_AT = |{ SY-DATUM }{ SY-UZEIT }|.

LOOP AT LT_PAYMENTS INTO LS_PAY.

  UPDATE ZG7_PAYMENT
    SET PAYMENT_STATUS = 'PAID',
        PAYMENT_TIME   = @LV_PAYMENT_TIME,
        UPDATED_AT     = @LV_UPDATED_AT
    WHERE PAYMENT_ID = @LS_PAY-PaymentID.

  IF SY-SUBRC <> 0.
    APPEND VALUE #( %TKY = LS_PAY-%TKY ) TO FAILED-ZC_G7_PAYMENT.
    CONTINUE.
  ENDIF.

  UPDATE ZG7_ORDER
    SET PAYMENT_STATUS = 'PAID',
        UPDATED_AT     = @LV_UPDATED_AT
    WHERE ORDER_ID = @LS_PAY-OrderID.

  IF SY-SUBRC <> 0.
    APPEND VALUE #( %TKY = LS_PAY-%TKY ) TO FAILED-ZC_G7_PAYMENT.
  ENDIF.

ENDLOOP.
```

PayOS webhook đã cập nhật cả `ZG7_PAYMENT` và `ZG7_ORDER`, nên không cần thay công thức analytics ở webhook.

---

## 10. Kiểm tra Data Preview

Kiểm tra theo thứ tự:

1. `ZI_G7_ORDER_FIN_BASE`: mỗi order đúng một dòng và ngày đúng.
2. `ZI_G7_SALES_DAILY`: doanh thu chỉ gồm `PAID + CONFIRMED/COMPLETED`.
3. `ZI_G7_PURCHASE_COST_BASE`: mỗi GR 101 dương, GR 102 âm.
4. `ZI_G7_PURCHASE_COST_DAILY`: tổng đúng theo posting date.
5. `ZC_G7_ADMIN_FINANCE_DAILY`: ngày chỉ có sales hoặc chỉ có GR vẫn xuất hiện.

Các test tối thiểu:

- `PAID + PENDING` không được tính doanh thu.
- `PAID + CONFIRMED` được tính doanh thu.
- `CANCELLED` tăng số đơn hủy và giá trị hủy.
- PO chưa GR không làm tăng `PurchaseCost`.
- GR `POSTED`, movement `101`, `PT01/P001/RM01` làm tăng `PurchaseCost`.
- GR `102` làm giảm `PurchaseCost`.
- Dữ liệu currency khác nhau không được cộng chung.

## 11. Nếu gặp lỗi activation theo release

Project hiện dùng CDS view entity và RAP strict mode nên cú pháp trên phù hợp với dòng ABAP Platform hiện tại. Nếu hệ thống không cho `cast(sum(...) as abap.int8)`, bỏ lớp `cast` ngoài và giữ nguyên `sum(case ...)`; sau đó đổi các số 0 tương ứng trong `ZI_G7_ADMIN_FIN_UNION` sang đúng kiểu mà ADT suy ra.

Không đổi `DEC(31,2)` xuống `CURR` nếu chưa khai báo currency reference. Các amount trong CDS đã được liên kết với `Currency` bằng `@Semantics.amount.currencyCode`.
