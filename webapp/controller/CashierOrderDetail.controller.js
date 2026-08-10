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
            var sOrderId = oEvent.getParameter("arguments") &&
                oEvent.getParameter("arguments").orderId;
            this._sCurrentOrderId = sOrderId;
            this._loadOrderDetail(sOrderId);
        },

        _loadOrderDetail: function (sOrderId) {
            var oComponent = this.getOwnerComponent();
            var oOrdersModel = oComponent.getModel("orders");

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
                    console.error("[CashierOrderDetail] Load detail error:", oError);
                    oOrdersModel.setProperty("/selectedOrder", null);
                    oOrdersModel.setProperty("/busy", false);
                    MessageBox.error(
                        "Không tải được chi tiết đơn hàng '" + sOrderId + "'.\n\nLỗi: " + sMsg,
                        { title: "Lỗi tải chi tiết" }
                    );
                });
        },

        _loadOrderFromBackend: function (sOrderId) {
            var oModel = this.getOwnerComponent().getModel();
            var oContext = oModel.bindContext("/Orders('" + sOrderId + "')");

            return oContext.requestObject().then(function (oRow) {
                var oOrder = this._normalizeOrderHeader(oRow);
                return this._loadOrderItems(sOrderId).then(function (aItems) {
                    oOrder.items = aItems;
                    return oOrder;
                });
            }.bind(this));
        },

        _loadOrderItems: function (sOrderId) {
            var that = this;
            var oModel = this.getOwnerComponent().getModel();
            return oModel.bindList("/Orders('" + sOrderId + "')/_Items")
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
                            bomItems: [],
                            bomDisplay: "-"
                        };

                        return that._loadBomForItem(oCtx).then(function (aBomItems) {
                            oNormalizedItem.bomItems = aBomItems;
                            oNormalizedItem.bomDisplay = that._formatBomItems(aBomItems);
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
            var sPath = oItemContext.getPath() + "/com.sap.gateway.srvd.zsd_g7_canteen.v0001.getBOM(...)";
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
            var sActionPath = "com.sap.gateway.srvd.zsd_g7_canteen.v0001." + sActionName + "(...)";
            var sPath = "/Orders('" + sOrderId + "')/" + sActionPath;

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

        onBack: function () {
            this.getOwnerComponent().getRouter().navTo("RouteCashierOrders", {}, true);
        }
    });
});
