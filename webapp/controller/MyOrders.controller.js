sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], function (Controller, JSONModel, Filter, FilterOperator) {
    "use strict";

    function formatDate(sValue) {
        var sDate = String(sValue || "").replace(/[^0-9]/g, "").slice(0, 8);
        return sDate.length === 8 ? sDate.slice(6, 8) + "/" + sDate.slice(4, 6) + "/" + sDate.slice(0, 4) : sValue || "";
    }

    function formatVnd(vAmount) {
        return (parseFloat(vAmount) || 0).toLocaleString("en-US", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        });
    }

    return Controller.extend("sap490g7fioriapp.controller.MyOrders", {
        onInit: function () {
            var oRoute = this.getOwnerComponent().getRouter().getRoute("RouteMyOrders");
            oRoute.attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            this._refreshOrders();
        },

        _refreshOrders: function () {
            var oComponent = this.getOwnerComponent();
            var oOrdersModel = oComponent.getModel("orders") || new JSONModel({
                orders: [], filteredOrders: [], statusOptions: [], selectedOrder: null
            });
            oComponent.setModel(oOrdersModel, "orders");
            this.getView().setModel(oOrdersModel, "orders");

            var oSession = oComponent.getModel("session");
            var sUserId = oSession && oSession.getProperty("/userId");

            this._loadOrdersFromBackend(sUserId).then(function (aOrders) {
                oOrdersModel.setProperty("/orders", aOrders);
                oOrdersModel.setProperty("/statusOptions", this._getStatusOptions(aOrders));
                this._applyFilters();
            }.bind(this)).catch(function (oError) {
                console.error("Could not load orders:", oError);
                oOrdersModel.setProperty("/orders", []);
                oOrdersModel.setProperty("/filteredOrders", []);
            });
        },

        _loadOrdersFromBackend: function (sUserId) {
            var aFilters = sUserId ? [new Filter("UserID", FilterOperator.EQ, sUserId)] : [];
            var oListBinding = this.getOwnerComponent().getModel().bindList("/Orders", null, null, aFilters, {
                $expand: "_Items"
            });

            return oListBinding.requestContexts(0, 5000).then(function (aContexts) {
                return (aContexts || []).map(function (oContext) {
                    return this._normalizeOrder(oContext.getObject());
                }.bind(this));
            }.bind(this));
        },

        _normalizeOrder: function (oRow) {
            var aItems = Array.isArray(oRow._Items) ? oRow._Items : [];
            var sOrderDate = oRow.OrderDate || oRow.CreatedAt || "";
            return {
                orderId: oRow.OrderID,
                userId: oRow.UserID,
                cartId: oRow.CartID,
                orderDate: String(sOrderDate).replace(/[^0-9]/g, "").slice(0, 8),
                orderDateDisplay: formatDate(sOrderDate),
                orderTime: oRow.OrderTime || "",
                totalAmount: parseFloat(oRow.TotalAmount) || 0,
                totalAmountText: formatVnd(oRow.TotalAmount),
                currency: oRow.Currency || "VND",
                orderStatus: oRow.OrderStatus || "Unknown",
                paymentStatus: oRow.PaymentStatus || "Unknown",
                note: oRow.Note || "",
                createdAt: oRow.CreatedAt || "",
                items: aItems.map(function (oItem) {
                    return {
                        foodId: oItem.FoodID,
                        foodName: oItem.FoodName || "",
                        quantity: oItem.Quantity,
                        unitPrice: parseFloat(oItem.UnitPrice) || 0,
                        currency: oItem.Currency || "VND",
                        lineAmount: parseFloat(oItem.LineAmount) || 0,
                        itemStatus: oItem.ItemStatus || ""
                    };
                })
            };
        },

        _getStatusOptions: function (aOrders) {
            var mStatuses = {};
            (aOrders || []).forEach(function (oOrder) { mStatuses[oOrder.orderStatus] = true; });
            return [{ key: "", text: "All statuses" }].concat(Object.keys(mStatuses).sort().map(function (sStatus) {
                return { key: sStatus, text: sStatus };
            }));
        },

        onFilterChange: function () {
            this._applyFilters();
        },

        _applyFilters: function () {
            var oModel = this.getOwnerComponent().getModel("orders");
            if (!oModel) { return; }
            var sFrom = this.byId("fromDate") ? this.byId("fromDate").getValue() : "";
            var sTo = this.byId("toDate") ? this.byId("toDate").getValue() : "";
            var sStatus = this.byId("statusFilter") ? this.byId("statusFilter").getSelectedKey() : "";
            var aOrders = oModel.getProperty("/orders") || [];

            oModel.setProperty("/filteredOrders", aOrders.filter(function (oOrder) {
                return (!sFrom || oOrder.orderDate >= sFrom) &&
                    (!sTo || oOrder.orderDate <= sTo) &&
                    (!sStatus || oOrder.orderStatus === sStatus);
            }));
        },

        onOrderPress: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext("orders");
            var sOrderId = oContext && oContext.getProperty("orderId");
            if (sOrderId) {
                this.getOwnerComponent().getRouter().navTo("RouteMyOrderDetail", { orderId: sOrderId });
            }
        },

        onBack: function () {
            this.getOwnerComponent().getRouter().navTo("RouteFoodList", {}, true);
        }
    });
});
