sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (Controller, JSONModel, MessageToast, MessageBox) {
    "use strict";

    return Controller.extend("sap490g7fioriapp.controller.CashierOrders", {

        onInit: function () {
            var oRouter = this.getOwnerComponent().getRouter();
            if (oRouter && oRouter.getRoute) {
                var oRoute = oRouter.getRoute("RouteCashierOrders");
                if (oRoute && typeof oRoute.attachPatternMatched === "function") {
                    oRoute.attachPatternMatched(this._onRouteMatched, this);
                }
            }

            this._sSearchQuery = "";
            this._sStatusFilter = "ALL";

            var oOrdersModel = new JSONModel({
                orders: [],
                filteredOrders: [],
                selectedOrder: null,
                busy: false
            });
            this.getOwnerComponent().setModel(oOrdersModel, "orders");
            this.getView().setModel(oOrdersModel, "orders");

            // ================================================================
            // DIAGNOSTIC: Đọc metadata thật từ SAP backend để tìm tên entity
            // ================================================================
            var oModel = this.getOwnerComponent().getModel();
            oModel.getMetaModel().requestObject("/$EntityContainer").then(function (oContainer) {
                var aKeys = Object.keys(oContainer || {});
                console.log("=== ENTITY SETS TRÊN SAP BACKEND ===");
                aKeys.forEach(function (k) { console.log("  •", k); });
                console.log("=====================================");

                // Tự động tìm entity liên quan đến Order
                var sOrderEntity = aKeys.find(function (k) {
                    return k.toLowerCase().indexOf("order") !== -1;
                });
                if (sOrderEntity) {
                    console.log(">>> Entity tìm thấy liên quan Order:", sOrderEntity);
                    this._sOrderEntitySet = sOrderEntity;
                } else {
                    console.warn(">>> Không tìm thấy entity nào có chứa 'order'!");
                    this._sOrderEntitySet = "Orders"; // fallback mặc định
                }

                this._refreshOrders();
            }.bind(this)).catch(function (e) {
                console.error("MetaModel error:", e);
                this._sOrderEntitySet = "Orders";
                this._refreshOrders();
            }.bind(this));
        },

        _onRouteMatched: function () {
            this._sSearchQuery = "";
            this._sStatusFilter = "ALL";
            this._refreshOrders();
        },

        _refreshOrders: function () {
            var oOrdersModel = this.getOwnerComponent().getModel("orders");
            oOrdersModel.setProperty("/busy", true);

            this._loadAllOrdersFromBackend()
                .then(function (aOrders) {
                    oOrdersModel.setProperty("/orders", aOrders);
                    oOrdersModel.setProperty("/busy", false);
                    this._applyFilters();
                }.bind(this))
                .catch(function (oError) {
                    var sMsg = (oError && oError.message) ? oError.message : String(oError);
                    console.error("[CashierOrders] Load error:", oError);
                    oOrdersModel.setProperty("/busy", false);
                    oOrdersModel.setProperty("/filteredOrders", []);
                    MessageBox.error(
                        "Không tải được đơn hàng.\n\nLỗi: " + sMsg +
                        "\n\nEntity đang dùng: /" + (this._sOrderEntitySet || "Orders"),
                        { title: "Lỗi tải dữ liệu" }
                    );
                }.bind(this));
        },

        _loadAllOrdersFromBackend: function () {
            var oModel = this.getOwnerComponent().getModel();

            // Dùng tên entity tự động tìm từ metadata, hoặc "Orders" làm fallback
            var sEntitySet = this._sOrderEntitySet || "Orders";
            console.log("[CashierOrders] Đang gọi /" + sEntitySet + " ...");

            // ================================================================
            // Gọi đơn giản nhất: KHÔNG có $expand, KHÔNG có sort
            // để tránh lỗi do backend không hỗ trợ
            // ================================================================
            var oListBinding = oModel.bindList("/" + sEntitySet);

            return oListBinding.requestContexts(0, 5000).then(function (aContexts) {
                console.log("[CashierOrders] Số bản ghi trả về:", aContexts.length);

                if (aContexts.length > 0) {
                    // Log bản ghi đầu tiên để biết cấu trúc thật của entity
                    var oFirst = aContexts[0].getObject();
                    console.log("[CashierOrders] Cấu trúc bản ghi đầu tiên:", JSON.stringify(oFirst));
                }

                return (aContexts || []).map(function (oCtx) {
                    return this._normalizeOrder(oCtx.getObject());
                }.bind(this));
            }.bind(this));
        },

        _normalizeOrder: function (oRow) {
            if (!oRow) { return {}; }
            // Navigation _User (expand) có thể không có → fallback
            var oUser = oRow._User || oRow.to_User || {};
            return {
                orderId:       oRow.OrderID       || oRow.order_id    || "",
                userId:        oRow.UserID         || oRow.user_id     || "",
                customerName:  oUser.FullName      || oRow.FullName    || oRow.UserID || "",
                cartId:        oRow.CartID         || oRow.cart_id     || "",
                orderDate:     oRow.OrderDate      || oRow.order_date  || "",
                orderTime:     oRow.OrderTime      || oRow.order_time  || "",
                totalAmount:   parseFloat(oRow.TotalAmount  || oRow.total_amount  || 0) || 0,
                currency:      oRow.Currency       || "VND",
                orderStatus:   oRow.OrderStatus    || oRow.order_status || "NEW",
                paymentStatus: oRow.PaymentStatus  || oRow.payment_status || "UNPAID",
                note:          oRow.Note           || oRow.note        || ""
            };
        },

        onSearch: function (oEvent) {
            this._sSearchQuery = (oEvent.getParameter("newValue") || "").trim().toLowerCase();
            this._applyFilters();
        },

        onStatusFilterChange: function (oEvent) {
            this._sStatusFilter = oEvent.getParameter("selectedItem").getKey();
            this._applyFilters();
        },

        // Handler cho SegmentedButton trong Table headerToolbar
        onQuickStatusChange: function (oEvent) {
            var oItem = oEvent.getParameter("item");
            this._sStatusFilter = oItem ? oItem.getKey() : "ALL";
            this._applyFilters();
        },

        _applyFilters: function () {
            var oOrdersModel = this.getOwnerComponent().getModel("orders");
            var aOrders = oOrdersModel.getProperty("/orders") || [];
            var sQuery  = this._sSearchQuery;
            var sStatus = this._sStatusFilter;

            var aFiltered = aOrders.filter(function (oOrder) {
                if (sStatus !== "ALL" && oOrder.orderStatus !== sStatus) { return false; }
                if (sQuery) {
                    var sId   = (oOrder.orderId      || "").toLowerCase();
                    var sCust = (oOrder.customerName || "").toLowerCase();
                    var sUser = (oOrder.userId       || "").toLowerCase();
                    if (sId.indexOf(sQuery) === -1 && sCust.indexOf(sQuery) === -1 && sUser.indexOf(sQuery) === -1) {
                        return false;
                    }
                }
                return true;
            });

            oOrdersModel.setProperty("/filteredOrders", aFiltered);
        },

        onOrderPress: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext("orders");
            var sOrderId = oContext && oContext.getProperty("orderId");
            if (sOrderId) {
                // Truyền trực tiếp, không encodeURIComponent — router tự xử lý
                this.getOwnerComponent().getRouter().navTo("RouteCashierOrderDetail", {
                    orderId: sOrderId
                });
            }
        },

        onQuickConfirm: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext("orders");
            var sOrderId = oContext && oContext.getProperty("orderId");
            if (!sOrderId) { return; }
            var sEntitySet = this._sOrderEntitySet || "Orders";
            var oModel = this.getOwnerComponent().getModel();
            var sPath = "/" + sEntitySet + "('" + sOrderId + "')/com.sap.gateway.srvd.zsd_g7_canteen.v0001.confirmOrder(...)";
            oModel.bindContext(sPath).execute()
                .then(function () {
                    MessageToast.show("Đã xác nhận đơn " + sOrderId);
                    this._refreshOrders();
                }.bind(this))
                .catch(function (oError) {
                    MessageBox.error("Lỗi xác nhận: " + (oError.message || oError));
                });
        },

        onRefresh: function () {
            this._refreshOrders();
        },

        onBack: function () {
            this.getOwnerComponent().getRouter().navTo("RouteFoodList", {}, true);
        }
    });
});