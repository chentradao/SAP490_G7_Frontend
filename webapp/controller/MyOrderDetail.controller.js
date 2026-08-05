sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel"
], function (Controller, JSONModel) {
    "use strict";

    return Controller.extend("sap490g7fioriapp.controller.MyOrderDetail", {

        onInit: function () {
            var oRouter = this.getOwnerComponent().getRouter();
            if (oRouter && oRouter.getRoute) {
                var oRoute = oRouter.getRoute("RouteMyOrderDetail");
                if (oRoute && typeof oRoute.attachPatternMatched === "function") {
                    oRoute.attachPatternMatched(this._onRouteMatched, this);
                }
            }
        },

        _onRouteMatched: function (oEvent) {
            var sOrderId = oEvent.getParameter("arguments") && oEvent.getParameter("arguments").orderId;
            this._loadOrderDetail(sOrderId);
        },

        _loadOrderDetail: function (sOrderId) {
            var oComponent = this.getOwnerComponent();
            var oOrdersModel = oComponent.getModel("orders");

            if (!oOrdersModel) {
                oOrdersModel = new JSONModel({
                    orders: [],
                    filteredOrders: [],
                    selectedOrder: null
                });
                oComponent.setModel(oOrdersModel, "orders");
            }

            this._loadOrderFromBackend(sOrderId).then(function (oOrder) {
                oOrdersModel.setProperty("/selectedOrder", oOrder);
                this.getView().setModel(oOrdersModel, "orders");
            }.bind(this)).catch(function (oError) {
                console.error("Không load được chi tiết đơn hàng:", oError);
                oOrdersModel.setProperty("/selectedOrder", null);
            });
        },

        _loadOrderFromBackend: function (sOrderId) {
            var oModel = this.getOwnerComponent().getModel();
            // Đọc trực tiếp 1 entity theo key, expand luôn _Items và _Items/_Food
            var oContext = oModel.bindContext("/Orders('" + sOrderId + "')", null, {
                $expand: "_Items($expand=_Food)"
            });

            return oContext.requestObject().then(function (oRow) {
                return this._normalizeOrder(oRow);
            }.bind(this));
        },

        _normalizeOrder: function (oRow) {
            var aItems = Array.isArray(oRow._Items) ? oRow._Items : [];
            return {
                orderId: oRow.OrderID,
                userId: oRow.UserID,
                cartId: oRow.CartID,
                orderDate: oRow.OrderDate,
                orderTime: oRow.OrderTime,
                totalAmount: parseFloat(oRow.TotalAmount) || 0,
                currency: oRow.Currency || "VND",
                orderStatus: oRow.OrderStatus || "Unknown",
                paymentStatus: oRow.PaymentStatus || "Unknown",
                note: oRow.Note || "",
                createdAt: oRow.CreatedAt || "",
                items: aItems.map(function (oItem) {
                    return {
                        foodId: oItem.FoodID,
                        foodName: oItem.FoodName || (oItem._Food && oItem._Food.FoodName) || "",
                        quantity: oItem.Quantity,
                        unitPrice: parseFloat(oItem.UnitPrice) || 0,
                        currency: oItem.Currency || "VND",
                        lineAmount: parseFloat(oItem.LineAmount) || 0,
                        itemStatus: oItem.ItemStatus || ""
                    };
                })
            };
        },

        onBack: function () {
            this.getOwnerComponent().getRouter().navTo("RouteMyOrders", {}, true);
        }
    });
});