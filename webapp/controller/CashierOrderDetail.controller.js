sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap490g7fioriapp/model/sessionUtils"
], function (Controller, JSONModel, Filter, FilterOperator, MessageToast, MessageBox, sessionUtils) {
    "use strict";

    var SERVICE_NAMESPACE = "com.sap.gateway.srvd.zsd_g7_canteen.v0001";

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
            if (!this._canAccessOrderDetail()) {
                this._clearSelectedOrder();
                MessageBox.warning("Only STAFF or ADMIN can access Order Detail.");
                this.getOwnerComponent().getRouter().navTo("RouteLogin", {}, true);
                return;
            }

            var sOrderId = oEvent.getParameter("arguments") &&
                oEvent.getParameter("arguments").orderId;
            this._sCurrentOrderId = sOrderId;
            this._loadOrderDetail(sOrderId);
        },

        _canAccessOrderDetail: function () {
            var oSession = this.getOwnerComponent().getModel("session");
            return sessionUtils.isLoggedIn(oSession) && sessionUtils.isStaffOrManager(oSession);
        },

        _clearSelectedOrder: function () {
            var oOrdersModel = this.getOwnerComponent().getModel("orders");
            if (oOrdersModel) {
                oOrdersModel.setProperty("/selectedOrder", null);
                oOrdersModel.setProperty("/busy", false);
            }
        },

        _loadOrderDetail: function (sOrderId) {
            var oComponent = this.getOwnerComponent();
            var oOrdersModel = oComponent.getModel("orders");

            if (!this._canAccessOrderDetail()) {
                this._clearSelectedOrder();
                return;
            }

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
            oOrdersModel.setProperty("/selectedOrder", null);

            this._loadOrderFromBackend(sOrderId)
                .then(function (oOrder) {
                    oOrdersModel.setProperty("/selectedOrder", oOrder);
                    oOrdersModel.setProperty("/busy", false);
                    this.getView().setModel(oOrdersModel, "orders");
                }.bind(this))
                .catch(function (oError) {
                    var sMsg = (oError && oError.message) ? oError.message : String(oError);
                    console.error("[CashierOrderDetail] Load detail error:", oError);
                    oOrdersModel.setProperty("/selectedOrder", null);
                    oOrdersModel.setProperty("/busy", false);
                    MessageBox.error(
                        "Could not load order detail '" + sOrderId + "'.\n\nError: " + sMsg,
                        { title: "Detail Load Error" }
                    );
                });
        },

        _loadOrderFromBackend: function (sOrderId) {
            var oModel = this.getOwnerComponent().getModel();
            var oContextBinding = oModel.bindContext("/Orders('" + this._escapeKey(sOrderId) + "')");

            return oContextBinding.requestObject().then(function (oRow) {
                this._oOrderContext = oContextBinding.getBoundContext();
                var oOrder = this._normalizeOrderHeader(oRow);
                return this._loadOrderItems(sOrderId).then(function (aItems) {
                    oOrder.items = aItems;
                    oOrder.hasStockIssue = aItems.some(function (oItem) {
                        return oItem.hasInsufficientStock || oItem.stockCheckFailed;
                    });
                    return oOrder;
                });
            }.bind(this));
        },

        _escapeKey: function (sValue) {
            return String(sValue || "").replace(/'/g, "''");
        },

        _getOrderContext: function (sOrderId) {
            if (this._oOrderContext) {
                return Promise.resolve(this._oOrderContext);
            }

            var oModel = this.getOwnerComponent().getModel();
            var oContextBinding = oModel.bindContext("/Orders('" + this._escapeKey(sOrderId) + "')");
            this._oOrderContext = oContextBinding.getBoundContext();

            return oContextBinding.requestObject().then(function () {
                this._oOrderContext = oContextBinding.getBoundContext();
                return this._oOrderContext;
            }.bind(this));
        },

        _executeActionIgnoringETag: function (oAction) {
            if (typeof oAction.invoke === "function") {
                return oAction.invoke("$direct", true);
            }

            return oAction.execute("$direct", true);
        },

        _loadOrderItems: function (sOrderId) {
            var that = this;
            var oModel = this.getOwnerComponent().getModel();
            return oModel.bindList("/Orders('" + this._escapeKey(sOrderId) + "')/_Items")
                .requestContexts(0, 200)
                .then(function (aContexts) {
                    var aItemPromises = (aContexts || []).map(function (oCtx) {
                        var oItem = oCtx.getObject();
                        var oNormalizedItem = {
                            orderId: oItem.OrderID || "",
                            itemNo: oItem.ItemNo || "",
                            foodId: oItem.FoodID || "",
                            foodName: oItem.FoodName || "",
                            quantity: oItem.Quantity || 0,
                            unitPrice: parseFloat(oItem.UnitPrice) || 0,
                            currency: oItem.Currency || "VND",
                            lineAmount: parseFloat(oItem.LineAmount) || 0,
                            itemStatus: oItem.ItemStatus || "",
                            availableQuantity: null,
                            availableUnit: "",
                            availableDisplay: "Unknown",
                            stockState: "Warning",
                            stockCheckFailed: true,
                            hasInsufficientStock: false,
                            bomItems: [],
                            bomDisplay: "-"
                        };

                        var pBom = that._loadBomForItem(oCtx).then(function (aBomItems) {
                            oNormalizedItem.bomItems = aBomItems;
                            oNormalizedItem.bomDisplay = that._formatBomItems(aBomItems);
                        });

                        var pStock = that._loadAvailableForFood(oNormalizedItem.foodId).then(function (oStock) {
                            oNormalizedItem.availableQuantity = oStock.quantity;
                            oNormalizedItem.availableUnit = oStock.unit;
                            oNormalizedItem.availableDisplay = that._formatAvailableStock(oStock);
                            if (oStock.quantity === null || oStock.quantity === undefined) {
                                oNormalizedItem.stockState = "Warning";
                                oNormalizedItem.stockCheckFailed = true;
                                oNormalizedItem.availableDisplay = "Unknown";
                            } else if (Number(oNormalizedItem.quantity || 0) > Number(oStock.quantity || 0)) {
                                oNormalizedItem.stockState = "Error";
                                oNormalizedItem.stockCheckFailed = false;
                                oNormalizedItem.hasInsufficientStock = true;
                            } else {
                                oNormalizedItem.stockState = "Success";
                                oNormalizedItem.stockCheckFailed = false;
                            }
                        });

                        return Promise.all([pBom, pStock]).then(function () {
                            return oNormalizedItem;
                        }).catch(function () {
                            return oNormalizedItem;
                        });
                    });

                    return Promise.all(aItemPromises);
                })
                .catch(function (oError) {
                    console.warn("[CashierOrderDetail] Could not load items:", oError);
                    return [];
                });
        },

        _loadBomForItem: function (oItemContext) {
            var oModel = this.getOwnerComponent().getModel();
            var sPath = oItemContext.getPath() + "/" + SERVICE_NAMESPACE + ".getBOM(...)";
            var oAction = oModel.bindContext(sPath);

            return oAction.execute().then(function () {
                return oAction.requestObject();
            }).then(function (oResponse) {
                return this._normalizeBomResult(oResponse);
            }.bind(this)).catch(function (oError) {
                console.warn("[CashierOrderDetail] Could not load BOM:", oError);
                return [];
            });
        },

        _loadAvailableForFood: function (sFoodId) {
            if (!sFoodId) {
                return Promise.resolve({ quantity: null, unit: "" });
            }

            var oModel = this.getOwnerComponent().getModel();
            return oModel.bindList("/Food2", undefined, undefined, [
                new Filter("MaterialNumber", FilterOperator.EQ, sFoodId)
            ], {
                $$groupId: "$auto"
            }).requestContexts(0, 1).then(function (aContexts) {
                if (!aContexts || !aContexts.length) {
                    return { quantity: null, unit: "" };
                }

                var oFood = aContexts[0].getObject();
                var vAvailable = oFood.AvailableStock !== undefined ? oFood.AvailableStock :
                    oFood.Labst !== undefined ? oFood.Labst :
                    oFood.LABST !== undefined ? oFood.LABST :
                    oFood.labst;

                return {
                    quantity: vAvailable === undefined || vAvailable === null ? null : Number(vAvailable),
                    unit: oFood.BaseUnit || oFood.Unit || oFood.unit || ""
                };
            }).catch(function (oError) {
                console.warn("[CashierOrderDetail] Could not load available stock:", oError);
                return { quantity: null, unit: "" };
            });
        },

        _formatAvailableStock: function (oStock) {
            if (!oStock || oStock.quantity === null) { return "-"; }

            var sQuantity = Number(oStock.quantity).toLocaleString("vi-VN", {
                maximumFractionDigits: 3
            });
            return [sQuantity, oStock.unit].filter(Boolean).join(" ");
        },

        _normalizeBomResult: function (oResponse) {
            var aRows = [];

            if (Array.isArray(oResponse)) {
                aRows = oResponse;
            } else if (oResponse && Array.isArray(oResponse.value)) {
                aRows = oResponse.value;
            } else if (oResponse) {
                aRows = [oResponse];
            }

            return aRows.map(function (oRow) {
                return {
                    component: oRow.Component || oRow.component || "",
                    componentName: oRow.ComponentName || oRow.componentName || "",
                    quantity: oRow.Quantity || oRow.quantity || "",
                    unit: oRow.Unit || oRow.unit || ""
                };
            }).filter(function (oRow) {
                return oRow.component || oRow.componentName;
            });
        },

        _formatBomItems: function (aBomItems) {
            if (!aBomItems || !aBomItems.length) { return "-"; }

            return aBomItems.map(function (oItem) {
                var sName = oItem.componentName || oItem.component;
                var sQuantity = oItem.quantity ? " - " + oItem.quantity + " " + (oItem.unit || "") : "";
                return sName + sQuantity;
            }).join("\n");
        },

        _normalizeOrderHeader: function (oRow) {
            if (!oRow) { return {}; }

            var oUser = oRow._User || oRow.to_User || {};
            return {
                orderId: oRow.OrderID || "",
                userId: oRow.UserID || "",
                customerName: oUser.FullName || oRow.UserID || "",
                cartId: oRow.CartID || "",
                orderDate: oRow.OrderDate || "",
                orderTime: oRow.OrderTime || "",
                updatedAt: oRow.UpdatedAt || oRow.updated_at || "",
                totalAmount: parseFloat(oRow.TotalAmount) || 0,
                currency: oRow.Currency || "VND",
                orderStatus: String(oRow.OrderStatus || "PENDING").toUpperCase(),
                paymentStatus: String(oRow.PaymentStatus || "UNPAID").toUpperCase(),
                note: oRow.Note || "",
                hasStockIssue: false,
                items: []
            };
        },

        formatDate: function (sDate) {
            sDate = String(sDate || "").trim();
            if (!sDate) { return ""; }

            if (/^\d{8}$/.test(sDate)) {
                return sDate.slice(6, 8) + "/" + sDate.slice(4, 6) + "/" + sDate.slice(0, 4);
            }

            var oDate = new Date(sDate);
            if (Number.isNaN(oDate.getTime())) { return sDate; }

            return oDate.toLocaleDateString("vi-VN", {
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

        formatUpdatedAt: function (sValue) {
            var oParts = this._parseTimestampParts(sValue);
            if (!oParts) { return ""; }

            return this.formatDate(oParts.date) + " " + this.formatTime(oParts.time);
        },

        onConfirmOrder: function () {
            this._runOrderAction("confirmOrder", "Order confirmed");
        },

        onCancelOrder: function () {
            MessageBox.confirm("Are you sure you want to cancel this order?", {
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        this._runOrderAction("cancelOrder", "Order cancelled");
                    }
                }.bind(this)
            });
        },

        _runOrderAction: function (sActionName, sSuccessMsg) {
            var sOrderId = this._sCurrentOrderId;
            if (!sOrderId) { return; }

            if (!this._canAccessOrderDetail()) {
                this.getOwnerComponent().getRouter().navTo("RouteLogin", {}, true);
                return;
            }

            var oSelectedOrder = this.getOwnerComponent().getModel("orders") &&
                this.getOwnerComponent().getModel("orders").getProperty("/selectedOrder");
            if (sActionName === "confirmOrder" && (!oSelectedOrder ||
                    oSelectedOrder.paymentStatus !== "PAID" ||
                    oSelectedOrder.orderStatus !== "PENDING" ||
                    oSelectedOrder.hasStockIssue)) {
                MessageBox.error("Cannot confirm this order until payment and stock checks are valid.");
                return;
            }

            var oOrdersModel = this.getOwnerComponent().getModel("orders");
            oOrdersModel.setProperty("/busy", true);

            var oModel = this.getOwnerComponent().getModel();
            this._getOrderContext(sOrderId).then(function (oOrderContext) {
                var sPath = SERVICE_NAMESPACE + "." + sActionName + "(...)";
                var oAction = oModel.bindContext(sPath, oOrderContext, {
                    $$groupId: "$direct"
                });
                return this._executeActionIgnoringETag(oAction);
            }.bind(this))
                .then(function () {
                    MessageToast.show(sSuccessMsg);
                    this._loadOrderDetail(sOrderId);
                }.bind(this))
                .catch(function (oError) {
                    oOrdersModel.setProperty("/busy", false);
                    MessageBox.error("Action failed: " + (oError.message || String(oError)));
                });
        },

        onBack: function () {
            this.getOwnerComponent().getRouter().navTo("RouteCashierOrders", {}, true);
        }
    });
});
