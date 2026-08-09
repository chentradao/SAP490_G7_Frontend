sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel"
], function (Controller, JSONModel) {
    "use strict";

    var UNIT_PRICE_DISPLAY_SCALE = 0.001;
    var CALCULATED_AMOUNT_DISPLAY_SCALE = 0.00001;

    function formatDate(sValue) {
        var sDate = String(sValue || "").replace(/[^0-9]/g, "").slice(0, 8);
        return sDate.length === 8 ? sDate.slice(6, 8) + "/" + sDate.slice(4, 6) + "/" + sDate.slice(0, 4) : sValue || "";
    }

    function formatAmount(vAmount) {
        return (parseFloat(vAmount) || 0).toLocaleString("en-US", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        });
    }

    function formatCalculatedAmount(vAmount) {
        return ((parseFloat(vAmount) || 0) * CALCULATED_AMOUNT_DISPLAY_SCALE).toLocaleString("en-US", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        });
    }

    return Controller.extend("sap490g7fioriapp.controller.MyOrderDetail", {
        onInit: function () {
            this.getOwnerComponent().getRouter().getRoute("RouteMyOrderDetail")
                .attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function (oEvent) {
            this._loadOrderDetail(oEvent.getParameter("arguments").orderId);
        },

        _loadOrderDetail: function (sOrderId) {
            var oComponent = this.getOwnerComponent();
            var oOrdersModel = oComponent.getModel("orders") || new JSONModel({
                orders: [], filteredOrders: [], selectedOrder: null
            });
            oComponent.setModel(oOrdersModel, "orders");
            this.getView().setModel(oOrdersModel, "orders");

            this._loadOrderFromBackend(sOrderId).then(function (oOrder) {
                oOrdersModel.setProperty("/selectedOrder", oOrder);
            }).catch(function (oError) {
                console.error("Could not load order detail:", oError);
                oOrdersModel.setProperty("/selectedOrder", null);
            });
        },

        _loadOrderFromBackend: function (sOrderId) {
            var oContext = this.getOwnerComponent().getModel().bindContext("/Orders('" + sOrderId + "')", null, {
                $expand: "_Items"
            });
            return oContext.requestObject().then(this._normalizeOrder.bind(this));
        },

        _normalizeOrder: function (oRow) {
            var aItems = Array.isArray(oRow._Items) ? oRow._Items : [];
            var sOrderDate = oRow.OrderDate || oRow.CreatedAt || "";
            return {
                orderId: oRow.OrderID,
                orderDateDisplay: formatDate(sOrderDate),
                orderTime: oRow.OrderTime || "",
                totalAmountText: formatCalculatedAmount(oRow.TotalAmount),
                currency: oRow.Currency || "VND",
                orderStatus: oRow.OrderStatus || "Unknown",
                paymentStatus: oRow.PaymentStatus || "Unknown",
                note: oRow.Note || "",
                items: aItems.map(function (oItem) {
                    return {
                        foodId: oItem.FoodID,
                        foodName: oItem.FoodName || oItem.FoodID || "",
                        quantity: oItem.Quantity,
                        unitPriceText: formatAmount((parseFloat(oItem.UnitPrice) || 0) * UNIT_PRICE_DISPLAY_SCALE),
                        lineAmountText: formatCalculatedAmount(oItem.LineAmount),
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
