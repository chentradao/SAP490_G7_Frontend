sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (Controller, JSONModel, MessageToast, MessageBox) {
    "use strict";

    return Controller.extend("sap490g7fioriapp.controller.CashierOrderDetail", {

        onInit: function () {
            var oRouter = this.getOwnerComponent().getRouter();
            if (oRouter && oRouter.getRoute) {
                var oRoute = oRouter.getRoute("RouteCashierOrderDetail");
                if (oRoute && typeof oRoute.attachPatternMatched === "function") {
                    oRoute.attachPatternMatched(this._onRouteMatched, this);
                }
            }
        },

        _onRouteMatched: function (oEvent) {
            // Lấy orderId từ tham số route
            var sOrderId = oEvent.getParameter("arguments") &&
                           oEvent.getParameter("arguments").orderId;
            this._sCurrentOrderId = sOrderId;
            this._loadOrderDetail(sOrderId);
        },

        _loadOrderDetail: function (sOrderId) {
            var oComponent = this.getOwnerComponent();
            var oOrdersModel = oComponent.getModel("orders");

            // Tạo model nếu chưa có (trường hợp vào thẳng URL chi tiết)
            if (!oOrdersModel) {
                oOrdersModel = new JSONModel({
                    orders: [],
                    filteredOrders: [],
                    selectedOrder: null,
                    busy: false
                });
                oComponent.setModel(oOrdersModel, "orders");
            }

            oOrdersModel.setProperty("/busy", true);

            this._loadOrderFromBackend(sOrderId)
                .then(function (oOrder) {
                    oOrdersModel.setProperty("/selectedOrder", oOrder);
                    oOrdersModel.setProperty("/busy", false);
                    this.getView().setModel(oOrdersModel, "orders");
                }.bind(this))
                .catch(function (oError) {
                    var sMsg = (oError && oError.message) ? oError.message : String(oError);
                    console.error("[CashierOrderDetail] Lỗi load chi tiết:", oError);
                    oOrdersModel.setProperty("/selectedOrder", null);
                    oOrdersModel.setProperty("/busy", false);
                    // Hiển thị lỗi rõ ràng ra màn hình (không chỉ console)
                    MessageBox.error(
                        "Không tải được chi tiết đơn hàng '" + sOrderId + "'.\n\nLỗi: " + sMsg,
                        { title: "Lỗi tải chi tiết" }
                    );
                });
        },

        // =====================================================================
        // Bước 1: Lấy header đơn hàng (KHÔNG dùng $expand để tránh lỗi backend)
        // Bước 2: Lấy danh sách items riêng qua navigation /_Items
        // =====================================================================
        _loadOrderFromBackend: function (sOrderId) {
            var oModel = this.getOwnerComponent().getModel();

            // Bước 1: Lấy header — không có $expand
            var oContext = oModel.bindContext("/Orders('" + sOrderId + "')");

            return oContext.requestObject().then(function (oRow) {
                var oOrder = this._normalizeOrderHeader(oRow);

                // Bước 2: Lấy items riêng — nếu lỗi, vẫn hiển thị header
                return this._loadOrderItems(sOrderId).then(function (aItems) {
                    oOrder.items = aItems;
                    return oOrder;
                });
            }.bind(this));
        },

        // Lấy danh sách items qua navigation /_Items (không expand _Food)
        _loadOrderItems: function (sOrderId) {
            var oModel = this.getOwnerComponent().getModel();
            return oModel.bindList("/Orders('" + sOrderId + "')/_Items")
                .requestContexts(0, 200)
                .then(function (aContexts) {
                    console.log("[CashierOrderDetail] Items trả về:", aContexts.length);
                    return (aContexts || []).map(function (oCtx) {
                        var oItem = oCtx.getObject();
                        return {
                            orderId:          oItem.OrderID      || "",
                            itemNo:           oItem.ItemNo       || "",
                            foodId:           oItem.FoodID       || "",
                            foodName:         oItem.FoodName     || "",
                            quantity:         oItem.Quantity      || 0,
                            originalQuantity: oItem.Quantity      || 0,
                            unitPrice:        parseFloat(oItem.UnitPrice)   || 0,
                            currency:         oItem.Currency     || "VND",
                            lineAmount:       parseFloat(oItem.LineAmount)  || 0,
                            itemStatus:       oItem.ItemStatus   || ""
                        };
                    });
                })
                .catch(function (e) {
                    // Items không bắt buộc — vẫn hiển thị header đơn hàng
                    console.warn("[CashierOrderDetail] Không load được items:", e);
                    return [];
                });
        },

        _normalizeOrderHeader: function (oRow) {
            if (!oRow) { return {}; }
            // _User có thể không có trong real backend → fallback về userId
            var oUser = oRow._User || oRow.to_User || {};
            return {
                orderId:       oRow.OrderID      || "",
                userId:        oRow.UserID       || "",
                customerName:  oUser.FullName    || oRow.UserID || "",
                cartId:        oRow.CartID       || "",
                orderDate:     oRow.OrderDate    || "",
                orderTime:     oRow.OrderTime    || "",
                totalAmount:   parseFloat(oRow.TotalAmount)   || 0,
                currency:      oRow.Currency     || "VND",
                orderStatus:   oRow.OrderStatus  || "NEW",
                paymentStatus: oRow.PaymentStatus || "UNPAID",
                note:          oRow.Note         || "",
                items:         []  // sẽ được điền sau ở _loadOrderItems
            };
        },

        onConfirmOrder: function () {
            this._runAction("confirmOrder", "Đã xác nhận đơn hàng");
        },

        onCancelOrder: function () {
            MessageBox.confirm("Bạn có chắc muốn hủy đơn hàng này?", {
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        this._runAction("cancelOrder", "Đã hủy đơn hàng");
                    }
                }.bind(this)
            });
        },

        onMarkAsPaid: function () {
            this._runAction("markAsPaid", "Đã đánh dấu thanh toán");
        },

        _runAction: function (sActionName, sSuccessMsg) {
            var sOrderId = this._sCurrentOrderId;
            if (!sOrderId) { return; }

            var oOrdersModel = this.getOwnerComponent().getModel("orders");
            oOrdersModel.setProperty("/busy", true);

            var oModel = this.getOwnerComponent().getModel();
            // Gọi bound action theo namespace đầy đủ của SAP service
            var sPath = "/Orders('" + sOrderId + "')/" + sActionName + "(...)";
            oModel.bindContext(sPath).execute()
                .then(function () {
                    MessageToast.show(sSuccessMsg);
                    this._loadOrderDetail(sOrderId);
                }.bind(this))
                .catch(function (oError) {
                    oOrdersModel.setProperty("/busy", false);
                    MessageBox.error("Thao tác thất bại: " + (oError.message || String(oError)));
                });
        },

        onSaveQuantities: function () {
            var oOrdersModel = this.getOwnerComponent().getModel("orders");
            var oOrder = oOrdersModel.getProperty("/selectedOrder");
            var aItems = (oOrder && oOrder.items) || [];
            var oModel = this.getOwnerComponent().getModel();

            // Lọc ra những item có thay đổi số lượng so với ban đầu
            var aChanged = aItems.filter(function (oItem) {
                return oItem.quantity !== oItem.originalQuantity;
            });

            if (aChanged.length === 0) {
                MessageToast.show("Không có thay đổi nào để lưu");
                return;
            }

            oOrdersModel.setProperty("/busy", true);

            var sOrderPath = "/Orders('" + this._sCurrentOrderId + "')/_Items";
            var oItemsBinding = oModel.bindList(sOrderPath, null, null, null,
                { $$updateGroupId: "$auto" });

            oItemsBinding.requestContexts(0, 500)
                .then(function (aContexts) {
                    var aSetPromises = (aContexts || []).map(function (oCtx) {
                        var oObj = oCtx.getObject();
                        var oChangedItem = aChanged.find(function (it) {
                            return String(it.itemNo) === String(oObj.ItemNo);
                        });
                        return oChangedItem
                            ? oCtx.setProperty("Quantity", oChangedItem.quantity)
                            : Promise.resolve();
                    });
                    return Promise.all(aSetPromises);
                })
                .then(function () {
                    MessageToast.show("Đã lưu thay đổi số lượng");
                    this._loadOrderDetail(this._sCurrentOrderId);
                }.bind(this))
                .catch(function (oError) {
                    oOrdersModel.setProperty("/busy", false);
                    MessageBox.error("Lưu thất bại: " + (oError.message || String(oError)));
                });
        },

        onBack: function () {
            this.getOwnerComponent().getRouter().navTo("RouteCashierOrders", {}, true);
        }
    });
});