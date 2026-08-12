sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap490g7fioriapp/model/sessionUtils"
], function (Controller, JSONModel, MessageBox, sessionUtils) {
    "use strict";

    function formatDate(sValue) {
        var sDate = String(sValue || "").replace(/[^0-9]/g, "").slice(0, 8);
        return sDate.length === 8 ? sDate.slice(6, 8) + "/" + sDate.slice(4, 6) + "/" + sDate.slice(0, 4) : sValue || "";
    }

    return Controller.extend("sap490g7fioriapp.controller.MyOrderDetail", {
        onInit: function () {
            this.getOwnerComponent().getRouter().getRoute("RouteMyOrderDetail")
                .attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function (oEvent) {
            var oSession = this.getOwnerComponent().getModel("session");
            if (!sessionUtils.isLoggedIn(oSession) || !sessionUtils.isCustomer(oSession)) {
                this.getOwnerComponent().getRouter().navTo("RouteLogin", {}, true);
                return;
            }

            this._loadOrderDetail(oEvent.getParameter("arguments").orderId);
        },

        _loadOrderDetail: function (sOrderId) {
            var oComponent = this.getOwnerComponent();
            var oOrdersModel = oComponent.getModel("orders") || new JSONModel({
                orders: [], filteredOrders: [], selectedOrder: null
            });
            oComponent.setModel(oOrdersModel, "orders");
            this.getView().setModel(oOrdersModel, "orders");
            oOrdersModel.setProperty("/selectedOrder", null);

            this._loadOrderFromBackend(sOrderId).then(function (oOrder) {
                var oSession = oComponent.getModel("session");
                var sCurrentUserId = String(oSession && oSession.getProperty("/userId") || "");
                if (!oOrder || String(oOrder.userId || "") !== sCurrentUserId) {
                    oOrdersModel.setProperty("/selectedOrder", null);
                    MessageBox.error("You are not authorized to view this order.");
                    this.getOwnerComponent().getRouter().navTo("RouteMyOrders", {}, true);
                    return;
                }
                oOrdersModel.setProperty("/selectedOrder", oOrder);
            }.bind(this)).catch(function (oError) {
                console.error("Could not load order detail:", oError);
                oOrdersModel.setProperty("/selectedOrder", null);
            });
        },

        _loadOrderFromBackend: function (sOrderId) {
            var sEscapedOrderId = String(sOrderId || "").replace(/'/g, "''");
            var oContext = this.getOwnerComponent().getModel().bindContext("/Orders('" + sEscapedOrderId + "')", null, {
                $expand: "_Items"
            });
            return oContext.requestObject().then(this._normalizeOrder.bind(this));
        },

        _normalizeOrder: function (oRow) {
            if (!oRow) { return null; }

            var aItems = Array.isArray(oRow._Items) ? oRow._Items : [];
            var sOrderDate = oRow.OrderDate || oRow.CreatedAt || "";
            return {
                orderId: oRow.OrderID,
                userId: oRow.UserID,
                orderDateDisplay: formatDate(sOrderDate),
                orderTime: oRow.OrderTime || "",
                totalAmountText: oRow.TotalAmount,
                currency: oRow.Currency || "VND",
                orderStatus: oRow.OrderStatus || "Unknown",
                paymentStatus: oRow.PaymentStatus || "Unknown",
                note: oRow.Note || "",
                items: aItems.map(function (oItem) {
                    return {
                        foodId: oItem.FoodID,
                        foodName: oItem.FoodName || oItem.FoodID || "",
                        quantity: oItem.Quantity,
                        unitPriceText: oItem.UnitPrice,
                        lineAmountText: oItem.LineAmount,
                        currency: oItem.Currency || "VND",
                        itemStatus: oItem.ItemStatus || ""
                    };
                })
            };
        },

        onCheckout: function () {
            var oOrder = this.getOwnerComponent().getModel("orders").getProperty("/selectedOrder");
            if (!oOrder) { return; }
            this.getOwnerComponent().setModel(new JSONModel({
                orderId: oOrder.orderId,
                items: oOrder.items,
                totalAmountText: oOrder.totalAmountText,
                currency: oOrder.currency,
                note: oOrder.note || "",
                existingOrder: true,
                sourceRoute: "orderDetail"
            }), "checkoutData");
            this.getOwnerComponent().getRouter().navTo("RouteCheckout");
        },

        onBack: function () {
            this.getOwnerComponent().getRouter().navTo("RouteMyOrders", {}, true);
        }
    });
});
