sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/Sorter"
], function (Controller, JSONModel, Filter, FilterOperator, Sorter) {
    "use strict";

    // createCheckout is a static RAP action bound to the Payments collection.
    var CREATE_CHECKOUT_ACTION = "/Payments/com.sap.gateway.srvd.zsd_g7_canteen.v0001.createCheckout(...)";
    var PRICE_SCALE = 1;

    function getPaymentResult(oResult) {
        if (Array.isArray(oResult)) { return oResult[0] || {}; }
        if (oResult && Array.isArray(oResult.value)) { return oResult.value[0] || {}; }
        return oResult || {};
    }

    function formatAmount(vAmount) {
        return ((parseFloat(vAmount) || 0) * PRICE_SCALE).toLocaleString("en-US", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        });
    }

    return Controller.extend("sap490g7fioriapp.controller.Checkout", {
        onInit: function () {
            this.getView().setModel(new JSONModel({
                loading: false, hasQr: false, qrCodeUrl: "", qrPayload: "", qrFallbackUsed: false,
                statusText: "", transactionRef: "", checkoutUrl: ""
            }), "qrModel");
            this.getOwnerComponent().getRouter().getRoute("RouteCheckout")
                .attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            var oCheckoutData = this.getOwnerComponent().getModel("checkoutData");
            var oOrder = oCheckoutData && oCheckoutData.getData();
            if (oOrder && oOrder.existingOrder && oOrder.orderId) {
                this._loadPaymentForOrder(oOrder.orderId);
                return;
            }
            this.onGenerateQr();
        },

        onBack: function () {
            this.getOwnerComponent().getRouter().navTo("RouteCart", {}, true);
        },

        onGenerateQr: function () {
            var oQrModel = this.getView().getModel("qrModel");
            var oSession = this.getOwnerComponent().getModel("session");
            var sUserId = oSession && oSession.getProperty("/userId");

            if (!sUserId) {
                oQrModel.setProperty("/statusText", "Không xác định được người dùng đang đăng nhập.");
                return;
            }

            oQrModel.setData({ loading: true, hasQr: false, qrCodeUrl: "", qrPayload: "", qrFallbackUsed: false,
                statusText: "Đang tạo đơn hàng và thanh toán PayOS...", transactionRef: "", checkoutUrl: "" });

            var oAction = this.getOwnerComponent().getModel().bindContext(CREATE_CHECKOUT_ACTION, undefined, {
                $$groupId: "$direct"
            });
            oAction.setParameter("UserID", sUserId);

            oAction.execute().then(function () {
                return oAction.requestObject();
            }).then(function (oResult) {
                var oPayment = getPaymentResult(oResult);
                var sOrderId = oPayment.OrderID || oPayment.order_id || "";
                var sPaymentId = oPayment.PaymentID || oPayment.payment_id || "";
                var pOrder = this._loadCheckoutOrder(sUserId, sOrderId);
                if (sPaymentId) {
                    return Promise.all([pOrder, this._loadPaymentGateway(sPaymentId)]);
                } else if (sOrderId) {
                    return Promise.all([pOrder, this._loadPaymentForOrder(sOrderId)]);
                } else {
                    throw new Error("createCheckout did not return PaymentID or OrderID.");
                }
            }.bind(this)).catch(function (oError) {
                console.error("Could not create PayOS checkout:", oError);
                oQrModel.setProperty("/statusText", "Không thể tạo đơn hàng/thanh toán PayOS. Vui lòng thử lại.");
            }).finally(function () {
                oQrModel.setProperty("/loading", false);
            });
        },

        _displayPayOsQr: function (oPayment) {
            var oQrModel = this.getView().getModel("qrModel");
            var sQrCode = oPayment.QRCode || oPayment.qr_code || "";
            if (!sQrCode) {
                oQrModel.setProperty("/statusText", "PayOS chưa trả về dữ liệu QRCode.");
                return;
            }
            oQrModel.setProperty("/qrPayload", sQrCode);
            oQrModel.setProperty("/qrCodeUrl", this._getQrUrl(sQrCode, false));
            oQrModel.setProperty("/transactionRef",
                oPayment.TransactionRef || oPayment.transaction_ref || oPayment.PaymentID || oPayment.payment_id || "");
            oQrModel.setProperty("/checkoutUrl", oPayment.CheckoutURL || oPayment.checkout_url || "");
            oQrModel.setProperty("/statusText", "Quét mã QR PayOS để thanh toán.");
            oQrModel.setProperty("/hasQr", true);
        },

        _loadPaymentForOrder: function (sOrderId) {
            var oQrModel = this.getView().getModel("qrModel");
            oQrModel.setData({ loading: true, hasQr: false, qrCodeUrl: "", qrPayload: "", qrFallbackUsed: false,
                statusText: "Đang tải thông tin thanh toán...", transactionRef: "", checkoutUrl: "" });

            return this.getOwnerComponent().getModel().bindList("/Payments", undefined, [
                new Sorter("CreatedAt", true)
            ], [new Filter("OrderID", FilterOperator.EQ, sOrderId)], {
                $$groupId: "$auto"
            }).requestContexts(0, 1).then(function (aContexts) {
                if (!aContexts || !aContexts.length) {
                    oQrModel.setProperty("/statusText", "Đơn hàng chưa có thông tin thanh toán PayOS.");
                    return;
                }
                return this._loadPaymentGateway(aContexts[0].getObject().PaymentID);
            }.bind(this)).catch(function (oError) {
                console.error("Could not load payment for order:", oError);
                oQrModel.setProperty("/statusText", "Không thể tải thông tin thanh toán của đơn hàng.");
            });
        },

        _loadPaymentGateway: function (sPaymentId) {
            var oQrModel = this.getView().getModel("qrModel");
            return this.getOwnerComponent().getModel().bindList("/PaymentGateway", undefined, [
                new Sorter("CreatedAt", true)
            ], [new Filter("PaymentID", FilterOperator.EQ, sPaymentId)], {
                $$groupId: "$auto"
            }).requestContexts(0, 1).then(function (aContexts) {
                if (!aContexts || !aContexts.length) {
                    oQrModel.setProperty("/statusText", "Chưa có QR PayOS cho payment này.");
                    return;
                }
                this._displayPayOsQr(aContexts[0].getObject());
            }.bind(this)).catch(function (oError) {
                console.error("Could not load payment gateway:", oError);
                oQrModel.setProperty("/statusText", "Không thể tải QR PayOS từ Payment Gateway.");
            }).finally(function () {
                oQrModel.setProperty("/loading", false);
            });
        },

        _getQrUrl: function (sPayload, bFallback) {
            return bFallback ?
                "https://quickchart.io/qr?size=220&text=" + encodeURIComponent(sPayload) :
                "https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=" + encodeURIComponent(sPayload);
        },

        onQrImageError: function () {
            var oQrModel = this.getView().getModel("qrModel");
            var sPayload = oQrModel.getProperty("/qrPayload");
            if (sPayload && !oQrModel.getProperty("/qrFallbackUsed")) {
                oQrModel.setProperty("/qrFallbackUsed", true);
                oQrModel.setProperty("/qrCodeUrl", this._getQrUrl(sPayload, true));
                return;
            }
            oQrModel.setProperty("/hasQr", false);
            oQrModel.setProperty("/statusText", "Không tải được ảnh QR. Vui lòng mở trang thanh toán PayOS.");
        },

        _loadCheckoutOrder: function (sUserId, sOrderId) {
            var oModel = this.getOwnerComponent().getModel();
            var pOrder;
            if (sOrderId) {
                pOrder = oModel.bindContext("/Orders('" + sOrderId + "')", undefined, { $expand: "_Items" }).requestObject();
            } else {
                pOrder = oModel.bindList("/Orders", undefined, [new Sorter("CreatedAt", true)], [
                    new Filter("UserID", FilterOperator.EQ, sUserId)
                ], { $expand: "_Items" }).requestContexts(0, 1).then(function (aContexts) {
                    return aContexts.length ? aContexts[0].getObject() : null;
                });
            }
            return pOrder.then(function (oOrder) {
                if (!oOrder) { return; }
                this._setCheckoutOrder(oOrder);
            }.bind(this)).catch(function (oError) {
                console.error("Could not load newly created order:", oError);
            });
        },

        _setCheckoutOrder: function (oOrder) {
            var aItems = Array.isArray(oOrder._Items) ? oOrder._Items : [];
            this.getOwnerComponent().setModel(new JSONModel({
                orderId: oOrder.OrderID,
                items: aItems.map(function (oItem) {
                    return {
                        foodId: oItem.FoodID,
                        foodName: oItem.FoodName || oItem.FoodID || "",
                        quantity: oItem.Quantity,
                        unitPriceText: formatAmount(oItem.UnitPrice),
                        lineAmountText: formatAmount(oItem.LineAmount),
                        currency: oItem.Currency || oOrder.Currency || "VND"
                    };
                }),
                totalAmountText: formatAmount(oOrder.TotalAmount),
                currency: oOrder.Currency || "VND",
                note: oOrder.Note || ""
            }), "checkoutData");
        },

        onOpenCheckoutUrl: function () {
            var sCheckoutUrl = this.getView().getModel("qrModel").getProperty("/checkoutUrl");
            if (sCheckoutUrl) { window.open(sCheckoutUrl, "_blank", "noopener,noreferrer"); }
        }
    });
});
