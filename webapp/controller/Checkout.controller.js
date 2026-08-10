sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/Sorter",
    "sap/m/MessageToast",
    "sap490g7fioriapp/model/cartUtils"
], function (Controller, JSONModel, Filter, FilterOperator, Sorter, MessageToast, cartUtils) {
    "use strict";

    // createCheckout is a static RAP action bound to the Payments collection.
    var CREATE_CHECKOUT_ACTION = "/Payments/com.sap.gateway.srvd.zsd_g7_canteen.v0001.createCheckout(...)";
    var UNIT_PRICE_DISPLAY_SCALE = 0.0001;
    var CALCULATED_AMOUNT_DISPLAY_SCALE = 0.00000001;

    function formatAmount(vAmount, fScale) {
        return ((parseFloat(vAmount) || 0) * fScale).toLocaleString("en-US", {
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
            var oCheckoutData = this.getOwnerComponent().getModel("checkoutData");
            var sSourceRoute = oCheckoutData && oCheckoutData.getProperty("/sourceRoute");
            var sOrderId = oCheckoutData && oCheckoutData.getProperty("/orderId");
            var oRouter = this.getOwnerComponent().getRouter();

            if (sSourceRoute === "orderDetail" && sOrderId) {
                oRouter.navTo("RouteMyOrderDetail", { orderId: sOrderId }, true);
            } else if (sOrderId) {
                oRouter.navTo("RouteMyOrders", {}, true);
            } else {
                oRouter.navTo("RouteCart", {}, true);
            }
        },

        onGenerateQr: function () {
            var oQrModel = this.getView().getModel("qrModel");
            var oSession = this.getOwnerComponent().getModel("session");
            var sUserId = oSession && oSession.getProperty("/userId");

            if (!sUserId) {
                oQrModel.setProperty("/statusText", "Could not identify the signed-in user.");
                return;
            }

            oQrModel.setData({ loading: true, hasQr: false, qrCodeUrl: "", qrPayload: "", qrFallbackUsed: false,
                statusText: "Creating order and PayOS payment...", transactionRef: "", checkoutUrl: "" });

            var oAction = this.getOwnerComponent().getModel().bindContext(CREATE_CHECKOUT_ACTION, undefined, {
                $$groupId: "$direct"
            });
            oAction.setParameter("UserID", sUserId);

            var sPreviousOrderId = "";

            this._getLatestOrderForUser(sUserId).then(function (oPreviousOrder) {
                sPreviousOrderId = oPreviousOrder && oPreviousOrder.OrderID || "";
                return oAction.execute();
            }).then(function () {
                // The RAP action has no result payload. After it completes, read
                // the newest order created for this user instead of requestObject().
                return this._loadCheckoutOrder(sUserId);
            }.bind(this)).then(function (oOrder) {
                var sOrderId = oOrder && oOrder.OrderID;
                var pPayment;
                var sCartId;
                var pClearCart;

                if (!sOrderId || sOrderId === sPreviousOrderId) {
                    throw new Error("createCheckout completed but no new order was found.");
                }

                pPayment = this._loadPaymentForOrder(sOrderId);

                // createCheckout has already consumed the cart at this point, so it
                // is now safe to remove every item from the current active cart.
                sCartId = oSession && oSession.getProperty("/cartId");
                pClearCart = cartUtils.clearCartItems(
                    this.getOwnerComponent().getModel(), oSession, sCartId
                ).catch(function (oError) {
                    // Do not report the successfully created order as failed only
                    // because the follow-up cart cleanup could not be completed.
                    console.error("Order was created but cart cleanup failed:", oError);
                });

                return Promise.all([pPayment, pClearCart]);
            }.bind(this)).catch(function (oError) {
                console.error("Could not create PayOS checkout:", oError);
                oQrModel.setProperty("/statusText", "Could not create the order or PayOS payment. Please try again.");
            }).finally(function () {
                oQrModel.setProperty("/loading", false);
            });
        },

        _displayPayOsQr: function (oPayment) {
            var oQrModel = this.getView().getModel("qrModel");
            var sQrCode = oPayment.QRCode || oPayment.qr_code || "";
            if (!sQrCode) {
                oQrModel.setProperty("/statusText", "PayOS has not returned QR code data yet.");
                return;
            }
            oQrModel.setProperty("/qrPayload", sQrCode);
            oQrModel.setProperty("/qrCodeUrl", this._getQrUrl(sQrCode, false));
            oQrModel.setProperty("/transactionRef",
                oPayment.TransactionRef || oPayment.transaction_ref || oPayment.PaymentID || oPayment.payment_id || "");
            oQrModel.setProperty("/checkoutUrl", oPayment.CheckoutURL || oPayment.checkout_url || "");
            oQrModel.setProperty("/statusText", "Scan the PayOS QR code to pay.");
            oQrModel.setProperty("/hasQr", true);
        },

        _loadPaymentForOrder: function (sOrderId) {
            var oQrModel = this.getView().getModel("qrModel");
            oQrModel.setData({ loading: true, hasQr: false, qrCodeUrl: "", qrPayload: "", qrFallbackUsed: false,
                statusText: "Loading payment information...", transactionRef: "", checkoutUrl: "" });

            return this.getOwnerComponent().getModel().bindList("/Payments", undefined, [
                new Sorter("CreatedAt", true)
            ], [new Filter("OrderID", FilterOperator.EQ, sOrderId)], {
                $$groupId: "$auto"
            }).requestContexts(0, 1).then(function (aContexts) {
                if (!aContexts || !aContexts.length) {
                    oQrModel.setProperty("/loading", false);
                    oQrModel.setProperty("/statusText", "This order does not have PayOS payment information yet.");
                    return;
                }
                return this._loadPaymentGateway(aContexts[0].getObject().PaymentID);
            }.bind(this)).catch(function (oError) {
                console.error("Could not load payment for order:", oError);
                oQrModel.setProperty("/loading", false);
                oQrModel.setProperty("/statusText", "Could not load payment information for this order.");
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
                    oQrModel.setProperty("/statusText", "No PayOS QR code is available for this payment yet.");
                    return;
                }
                this._displayPayOsQr(aContexts[0].getObject());
            }.bind(this)).catch(function (oError) {
                console.error("Could not load payment gateway:", oError);
                oQrModel.setProperty("/statusText", "Could not load the PayOS QR code from Payment Gateway.");
            }).finally(function () {
                oQrModel.setProperty("/loading", false);
            });
        },

        _getQrUrl: function (sPayload, bFallback) {
            return bFallback ?
                "https://quickchart.io/qr?size=220&text=" + encodeURIComponent(sPayload) + "&_=" + Date.now() :
                "https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=" + encodeURIComponent(sPayload) + "&_=" + Date.now();
        },

        onRegenerateQr: function () {
            var oCheckoutData = this.getOwnerComponent().getModel("checkoutData");
            var sOrderId = oCheckoutData && oCheckoutData.getProperty("/orderId");
            if (sOrderId) {
                this._loadPaymentForOrder(sOrderId);
            }
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
            oQrModel.setProperty("/statusText", "Could not load the QR image. Please open the PayOS payment page.");
        },

        _loadCheckoutOrder: function (sUserId, sOrderId) {
            var oModel = this.getOwnerComponent().getModel();
            var pOrder;
            if (sOrderId) {
                pOrder = oModel.bindContext("/Orders('" + sOrderId + "')", undefined, { $expand: "_Items" }).requestObject();
            } else {
                pOrder = this._getLatestOrderForUser(sUserId);
            }
            return pOrder.then(function (oOrder) {
                if (!oOrder) { return null; }
                this._setCheckoutOrder(oOrder);
                return oOrder;
            }.bind(this));
        },

        _getLatestOrderForUser: function (sUserId) {
            return this.getOwnerComponent().getModel().bindList("/Orders", undefined, [
                new Sorter("CreatedAt", true),
                new Sorter("OrderID", true)
            ], [
                new Filter("UserID", FilterOperator.EQ, sUserId)
            ], {
                $expand: "_Items",
                $$groupId: "$direct"
            }).requestContexts(0, 1).then(function (aContexts) {
                return aContexts.length ? aContexts[0].getObject() : null;
            });
        },

        _setCheckoutOrder: function (oOrder) {
            var aItems = Array.isArray(oOrder._Items) ? oOrder._Items : [];
            var oCurrentModel = this.getOwnerComponent().getModel("checkoutData");
            var oCurrentData = oCurrentModel ? oCurrentModel.getData() : {};
            this.getOwnerComponent().setModel(new JSONModel({
                orderId: oOrder.OrderID,
                items: aItems.map(function (oItem) {
                    return {
                        foodId: oItem.FoodID,
                        foodName: oItem.FoodName || oItem.FoodID || "",
                        quantity: oItem.Quantity,
                        unitPriceText: formatAmount(oItem.UnitPrice, UNIT_PRICE_DISPLAY_SCALE),
                        lineAmountText: formatAmount(oItem.LineAmount, CALCULATED_AMOUNT_DISPLAY_SCALE),
                        currency: oItem.Currency || oOrder.Currency || "VND"
                    };
                }),
                totalAmountText: formatAmount(oOrder.TotalAmount, CALCULATED_AMOUNT_DISPLAY_SCALE),
                currency: oOrder.Currency || "VND",
                note: oOrder.Note || "",
                noteBusy: false,
                sourceRoute: oCurrentData.sourceRoute || "cart",
                existingOrder: !!oCurrentData.existingOrder
            }), "checkoutData");
        },

        onSaveNote: function () {
            var oCheckoutData = this.getOwnerComponent().getModel("checkoutData");
            var sOrderId = oCheckoutData && oCheckoutData.getProperty("/orderId");
            var sNote = String(oCheckoutData && oCheckoutData.getProperty("/note") || "").trim();

            if (!sOrderId) {
                MessageToast.show("No order was found for saving the note.");
                return;
            }

            var sEscapedOrderId = String(sOrderId).replace(/'/g, "''");
            var oModel = this.getOwnerComponent().getModel();
            var oBinding = oModel.bindContext("/Orders('" + sEscapedOrderId + "')");

            oCheckoutData.setProperty("/noteBusy", true);
            oBinding.requestObject().then(function () {
                oBinding.getBoundContext().setProperty("Note", sNote);
                return oModel.submitBatch("$auto");
            }).then(function () {
                MessageToast.show("Order note saved.");
            }).catch(function (oError) {
                console.error("Could not save order note:", oError);
                MessageToast.show("Could not save the note. Please try again.");
            }).finally(function () {
                oCheckoutData.setProperty("/noteBusy", false);
            });
        },

        onOpenCheckoutUrl: function () {
            var sCheckoutUrl = this.getView().getModel("qrModel").getProperty("/checkoutUrl");
            if (sCheckoutUrl) { window.open(sCheckoutUrl, "_blank", "noopener,noreferrer"); }
        }
    });
});
