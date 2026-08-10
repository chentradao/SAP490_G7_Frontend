sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox"
], function (Controller, JSONModel, MessageBox) {
    "use strict";

    var AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

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

            this._loadOrderEntitySet();
            this._startAutoRefresh();
        },

        onExit: function () {
            if (this._iAutoRefreshTimer) {
                clearInterval(this._iAutoRefreshTimer);
                this._iAutoRefreshTimer = null;
            }
        },

        _onRouteMatched: function () {
            this._sSearchQuery = "";
            this._sStatusFilter = "ALL";
            this._refreshOrders();
        },

        _loadOrderEntitySet: function () {
            var oModel = this.getOwnerComponent().getModel();
            oModel.getMetaModel().requestObject("/$EntityContainer").then(function (oContainer) {
                var aKeys = Object.keys(oContainer || {});
                var sOrderEntity = aKeys.find(function (sKey) {
                    return sKey === "Orders" || sKey === "ZC_G7_ORDER";
                }) || aKeys.find(function (sKey) {
                    var sLowerKey = sKey.toLowerCase();
                    return sLowerKey.indexOf("order") !== -1 && sLowerKey.indexOf("item") === -1;
                });

                this._sOrderEntitySet = sOrderEntity || "Orders";
                this._refreshOrders();
            }.bind(this)).catch(function (oError) {
                console.error("[CashierOrders] MetaModel error:", oError);
                this._sOrderEntitySet = "Orders";
                this._refreshOrders();
            }.bind(this));
        },

        _startAutoRefresh: function () {
            if (this._iAutoRefreshTimer) {
                clearInterval(this._iAutoRefreshTimer);
            }

            this._iAutoRefreshTimer = setInterval(function () {
                this._refreshOrders(true);
            }.bind(this), AUTO_REFRESH_INTERVAL_MS);
        },

        _refreshOrders: function (bSilent) {
            var oOrdersModel = this.getOwnerComponent().getModel("orders");
            if (!oOrdersModel) { return; }

            if (!bSilent) {
                oOrdersModel.setProperty("/busy", true);
            }

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

                    if (!bSilent) {
                        oOrdersModel.setProperty("/filteredOrders", []);
                        MessageBox.error(
                            "Could not load orders.\n\nError: " + sMsg +
                            "\n\nEntity in use: /" + (this._sOrderEntitySet || "Orders"),
                            { title: "Data Load Error" }
                        );
                    }
                }.bind(this));
        },

        _loadAllOrdersFromBackend: function () {
            var oModel = this.getOwnerComponent().getModel();
            var sEntitySet = this._sOrderEntitySet || "Orders";
            var oListBinding = oModel.bindList("/" + sEntitySet);

            return oListBinding.requestContexts(0, 5000).then(function (aContexts) {
                return (aContexts || []).map(function (oCtx) {
                    return this._normalizeOrder(oCtx.getObject());
                }.bind(this));
            }.bind(this));
        },

        _normalizeOrder: function (oRow) {
            if (!oRow) { return {}; }

            var oUser = oRow._User || oRow.to_User || {};
            return {
                orderId: oRow.OrderID || oRow.order_id || "",
                userId: oRow.UserID || oRow.user_id || "",
                customerName: oUser.FullName || oRow.FullName || oRow.UserID || "",
                cartId: oRow.CartID || oRow.cart_id || "",
                orderDate: oRow.OrderDate || oRow.order_date || "",
                orderTime: oRow.OrderTime || oRow.order_time || "",
                updatedAt: oRow.UpdatedAt || oRow.updated_at || "",
                totalAmount: parseFloat(oRow.TotalAmount || oRow.total_amount || 0) || 0,
                currency: oRow.Currency || "VND",
                orderStatus: String(oRow.OrderStatus || oRow.order_status || "PENDING").toUpperCase(),
                paymentStatus: String(oRow.PaymentStatus || oRow.payment_status || "UNPAID").toUpperCase(),
                note: oRow.Note || oRow.note || ""
            };
        },

        onSearch: function (oEvent) {
            this._sSearchQuery = (oEvent.getParameter("newValue") || "").trim().toLowerCase();
            this._applyFilters();
        },

        onQuickStatusChange: function (oEvent) {
            var oItem = oEvent.getParameter("item");
            this._sStatusFilter = oItem ? oItem.getKey() : "ALL";
            this._applyFilters();
        },

        _applyFilters: function () {
            var oOrdersModel = this.getOwnerComponent().getModel("orders");
            var aOrders = oOrdersModel.getProperty("/orders") || [];
            var sQuery = this._sSearchQuery;
            var sStatus = this._sStatusFilter;

            var aFiltered = aOrders.filter(function (oOrder) {
                if (oOrder.paymentStatus !== "PAID") {
                    return false;
                }

                if (sStatus !== "ALL" && oOrder.orderStatus !== sStatus) {
                    return false;
                }

                if (sQuery) {
                    var sId = (oOrder.orderId || "").toLowerCase();
                    var sCust = (oOrder.customerName || "").toLowerCase();
                    var sUser = (oOrder.userId || "").toLowerCase();
                    return sId.indexOf(sQuery) !== -1 ||
                        sCust.indexOf(sQuery) !== -1 ||
                        sUser.indexOf(sQuery) !== -1;
                }

                return true;
            });

            aFiltered.sort(function (oFirst, oSecond) {
                return this._getOrderTimestamp(oSecond) - this._getOrderTimestamp(oFirst);
            }.bind(this));

            oOrdersModel.setProperty("/filteredOrders", aFiltered);
        },

        _getOrderTimestamp: function (oOrder) {
            if (!oOrder) { return 0; }

            var iUpdatedAt = this._getTimestampValue(oOrder.updatedAt);
            if (iUpdatedAt) { return iUpdatedAt; }

            var sDate = String(oOrder.orderDate || "").trim();
            var sTime = this._normalizeTimeForSort(oOrder.orderTime);

            if (/^\d{8}$/.test(sDate)) {
                sDate = sDate.slice(0, 4) + "-" + sDate.slice(4, 6) + "-" + sDate.slice(6, 8);
            }

            var iTimestamp = Date.parse((sDate || "1970-01-01") + "T" + sTime);
            return Number.isNaN(iTimestamp) ? 0 : iTimestamp;
        },

        _getTimestampValue: function (sValue) {
            var oParts = this._parseTimestampParts(sValue);
            if (!oParts) { return 0; }

            var iTimestamp = Date.parse(oParts.date + "T" + oParts.time);
            return Number.isNaN(iTimestamp) ? 0 : iTimestamp;
        },

        _parseTimestampParts: function (sValue) {
            sValue = String(sValue || "").trim();
            if (!sValue) { return null; }

            if (/^\d{14}$/.test(sValue)) {
                return {
                    date: sValue.slice(0, 4) + "-" + sValue.slice(4, 6) + "-" + sValue.slice(6, 8),
                    time: sValue.slice(8, 10) + ":" + sValue.slice(10, 12) + ":" + sValue.slice(12, 14)
                };
            }

            if (/^\d{12}$/.test(sValue)) {
                return {
                    date: sValue.slice(0, 4) + "-" + sValue.slice(4, 6) + "-" + sValue.slice(6, 8),
                    time: sValue.slice(8, 10) + ":" + sValue.slice(10, 12) + ":00"
                };
            }

            if (/^\d{8}$/.test(sValue)) {
                return {
                    date: sValue.slice(0, 4) + "-" + sValue.slice(4, 6) + "-" + sValue.slice(6, 8),
                    time: "00:00:00"
                };
            }

            var oDate = new Date(sValue);
            if (Number.isNaN(oDate.getTime())) { return null; }

            return {
                date: [
                    oDate.getFullYear(),
                    String(oDate.getMonth() + 1).padStart(2, "0"),
                    String(oDate.getDate()).padStart(2, "0")
                ].join("-"),
                time: [
                    String(oDate.getHours()).padStart(2, "0"),
                    String(oDate.getMinutes()).padStart(2, "0"),
                    String(oDate.getSeconds()).padStart(2, "0")
                ].join(":")
            };
        },

        _normalizeTimeForSort: function (sTime) {
            sTime = String(sTime || "").trim();
            if (!sTime) { return "00:00:00"; }

            if (/^\d{6}$/.test(sTime)) {
                return sTime.slice(0, 2) + ":" + sTime.slice(2, 4) + ":" + sTime.slice(4, 6);
            }

            if (/^\d{4}$/.test(sTime)) {
                return sTime.slice(0, 2) + ":" + sTime.slice(2, 4) + ":00";
            }

            if (/^PT/.test(sTime)) {
                var aMatch = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(sTime);
                if (aMatch) {
                    return [
                        String(aMatch[1] || "0").padStart(2, "0"),
                        String(aMatch[2] || "0").padStart(2, "0"),
                        String(aMatch[3] || "0").padStart(2, "0")
                    ].join(":");
                }
            }

            var aParts = sTime.split(":");
            if (aParts.length >= 2) {
                return [
                    aParts[0].padStart(2, "0"),
                    aParts[1].padStart(2, "0"),
                    String(aParts[2] || "0").padStart(2, "0")
                ].join(":");
            }

            return "00:00:00";
        },

        formatDate: function (sDate) {
            sDate = String(sDate || "").trim();
            if (!sDate) { return ""; }

            if (/^\d{8}$/.test(sDate)) {
                return sDate.slice(6, 8) + "/" + sDate.slice(4, 6) + "/" + sDate.slice(0, 4);
            }

            var oDate = new Date(sDate);
            if (Number.isNaN(oDate.getTime())) { return sDate; }

            return oDate.toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric"
            });
        },

        formatTime: function (sTime) {
            sTime = String(sTime || "").trim();
            if (!sTime) { return ""; }

            if (/^PT/.test(sTime)) {
                var aMatch = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(sTime);
                if (aMatch) {
                    return [
                        String(aMatch[1] || "0").padStart(2, "0"),
                        String(aMatch[2] || "0").padStart(2, "0")
                    ].join(":");
                }
            }

            if (/^\d{6}$/.test(sTime)) {
                return sTime.slice(0, 2) + ":" + sTime.slice(2, 4) + ":" + sTime.slice(4, 6);
            }

            if (/^\d{4}$/.test(sTime)) {
                return sTime.slice(0, 2) + ":" + sTime.slice(2, 4);
            }

            var aParts = sTime.split(":");
            if (aParts.length >= 2) {
                return aParts[0].padStart(2, "0") + ":" + aParts[1].padStart(2, "0");
            }

            return sTime;
        },

        formatUpdatedAt: function (sValue) {
            var oParts = this._parseTimestampParts(sValue);
            if (!oParts) { return ""; }

            return this.formatDate(oParts.date) + " " + this.formatTime(oParts.time);
        },

        onOrderPress: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext("orders");
            var sOrderId = oContext && oContext.getProperty("orderId");
            if (sOrderId) {
                this.getOwnerComponent().getRouter().navTo("RouteCashierOrderDetail", {
                    orderId: sOrderId
                });
            }
        },

        onRefresh: function () {
            this._refreshOrders();
        },

        onLogout: function () {
            var oSessionModel = this.getOwnerComponent().getModel("session");
            if (oSessionModel) {
                oSessionModel.setData({
                    userId: null,
                    cartId: null,
                    cartItemCount: 0,
                    username: "",
                    fullName: "",
                    roleId: "",
                    role: "",
                    isLoggedIn: false
                });
            }

            this.getOwnerComponent().getRouter().navTo("RouteLogin", {}, true);
        },

        onBack: function () {
            this.getOwnerComponent().getRouter().navTo("RouteFoodList", {}, true);
        }
    });
});
