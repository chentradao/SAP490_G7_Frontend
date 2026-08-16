sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageBox",
    "sap490g7fioriapp/model/sessionUtils"
], function (Controller, JSONModel, Filter, FilterOperator, MessageBox, sessionUtils) {
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
                this._loadOrderItemImages(oOrder.items);
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
            var sOrderStatus = String(oRow.OrderStatus || "Unknown").trim().toUpperCase();
            var sPaymentStatus = String(oRow.PaymentStatus || "Unknown").trim().toUpperCase();
            return {
                orderId: oRow.OrderID,
                userId: oRow.UserID,
                orderDateDisplay: formatDate(sOrderDate),
                orderTime: oRow.OrderTime || "",
                totalAmountText: oRow.TotalAmount,
                currency: oRow.Currency || "VND",
                orderStatus: sOrderStatus,
                paymentStatus: sPaymentStatus,
                canCheckout: ["CREATED", "PENDING"].indexOf(sOrderStatus) !== -1 && sPaymentStatus !== "PAID",
                note: oRow.Note || "",
                items: aItems.map(function (oItem) {
                    return {
                        foodId: oItem.FoodID,
                        foodName: oItem.FoodName || oItem.FoodID || "",
                        imageUrl: "",
                        quantity: oItem.Quantity,
                        unitPriceText: oItem.UnitPrice,
                        lineAmountText: oItem.LineAmount,
                        currency: oItem.Currency || "VND",
                        itemStatus: oItem.ItemStatus || ""
                    };
                })
            };
        },

        _loadOrderItemImages: function (aItems) {
            var oODataModel = this.getOwnerComponent().getModel();
            var oOrdersModel = this.getOwnerComponent().getModel("orders");

            Promise.all((aItems || []).map(function (oItem, iIndex) {
                return oODataModel.bindList("/Food2", undefined, undefined, [
                    new Filter("MaterialNumber", FilterOperator.EQ, oItem.foodId)
                ], { $$groupId: "$auto" }).requestContexts(0, 1).then(function (aContexts) {
                    var oFood = aContexts && aContexts.length ? aContexts[0].getObject() : null;
                    return { index: iIndex, food: oFood };
                }).catch(function () {
                    return { index: iIndex, food: null };
                });
            })).then(function (aResults) {
                aResults.forEach(function (oResult) {
                    if (oResult.food) {
                        oOrdersModel.setProperty(
                            "/selectedOrder/items/" + oResult.index + "/imageUrl",
                            oResult.food.ImageUrl || ""
                        );
                    }
                });
            });
        },

        onCheckout: function () {
            var oOrder = this.getOwnerComponent().getModel("orders").getProperty("/selectedOrder");
            if (!oOrder || !oOrder.canCheckout) {
                MessageBox.warning("Only unpaid CREATED or PENDING orders can be checked out.");
                return;
            }
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
