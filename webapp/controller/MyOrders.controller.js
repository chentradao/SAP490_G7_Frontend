sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel"
], function (Controller, JSONModel) {
    "use strict";

    return Controller.extend("sap490g7fioriapp.controller.MyOrders", {

        onInit: function () {
            var oRouter = this.getOwnerComponent().getRouter();
            if (oRouter && oRouter.getRoute) {
                var oRoute = oRouter.getRoute("RouteMyOrders");
                if (oRoute && typeof oRoute.attachPatternMatched === "function") {
                    oRoute.attachPatternMatched(this._onRouteMatched, this);
                }
            }

            this._refreshOrders();
        },

        _onRouteMatched: function () {
            this._refreshOrders();
        },

        _refreshOrders: function () {
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

            var oSession = oComponent.getModel("session");
            var sUserId = oSession && oSession.getProperty("/userId") ? oSession.getProperty("/userId") : "demo";

            this._loadOrdersFromBackend(sUserId).then(function (aOrders) {
                oOrdersModel.setProperty("/orders", aOrders);
                oOrdersModel.setProperty("/filteredOrders", aOrders);
                this.getView().setModel(oOrdersModel, "orders");
            }.bind(this)).catch(function (oError) {
                console.error("Không load được danh sách đơn hàng:", oError);
                oOrdersModel.setProperty("/orders", []);
                oOrdersModel.setProperty("/filteredOrders", []);
            });
        },

        _loadOrdersFromBackend: function (sUserId) {
            var oModel = this.getOwnerComponent().getModel();
            var oListBinding = oModel.bindList("/Orders", null, null,
                new sap.ui.model.Filter("UserID", sap.ui.model.FilterOperator.EQ, sUserId),
                { $expand: "_Items" }
            );

            return oListBinding.requestContexts(0, 5000).then(function (aContexts) {
                return (aContexts || []).map(function (oCtx) {
                    return this._normalizeOrder(oCtx.getObject());
                }.bind(this));
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
                        foodName: oItem.FoodName,
                        quantity: oItem.Quantity,
                        unitPrice: parseFloat(oItem.UnitPrice) || 0,
                        currency: oItem.Currency || "VND",
                        lineAmount: parseFloat(oItem.LineAmount) || 0,
                        itemStatus: oItem.ItemStatus || ""
                    };
                })
            };
        },

        onOrderPress: function (oEvent) {
            var oSource = oEvent.getSource();
            var oContext = oSource && typeof oSource.getBindingContext === "function" ? oSource.getBindingContext("orders") : null;
            var sOrderId = oContext && oContext.getProperty("orderId");

            if (sOrderId) {
                this.getOwnerComponent().getRouter().navTo("RouteMyOrderDetail", {
                    orderId: sOrderId
                });
            }
        },

        onBack: function () {
            this.getOwnerComponent().getRouter().navTo("RouteFoodList", {}, true);
        }
    });
});