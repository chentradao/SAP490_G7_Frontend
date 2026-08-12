sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/Sorter",
    "sap/m/MessageToast",
    "sap490g7fioriapp/model/cartUtils",
    "sap490g7fioriapp/model/sessionUtils"
], function (Controller, JSONModel, Filter, FilterOperator, Sorter, MessageToast, cartUtils, sessionUtils) {
    "use strict";

    // createCheckout is a static RAP action bound to the Payments collection.
    var CREATE_CHECKOUT_ACTION = "/Payments/com.sap.gateway.srvd.zsd_g7_canteen.v0001.createCheckout(...)";
    var PAYMENT_STATUS_POLL_INTERVAL_MS = 3000;

    return Controller.extend("sap490g7fioriapp.controller.Checkout", {
        onInit: function () {
            this.getView().setModel(new JSONModel({
                loading: false, hasQr: false, qrCodeUrl: "", qrPayload: "", qrFallbackUsed: false,
                statusText: "", transactionRef: "", checkoutUrl: ""
            }), "qrModel");
            this.getOwnerComponent().getRouter().getRoute("RouteCheckout")
                .attachPatternMatched(this._onRouteMatched, this);
        },

        onExit: function () {
            this._stopPaymentStatusPolling();
        },

        _onRouteMatched: function () {
            this._stopPaymentStatusPolling();
            this._bPaymentSuccessHandled = false;

            var oSession = this.getOwnerComponent().getModel("session");
            var oRouter = this.getOwnerComponent().getRouter();
            var oCheckoutData = this.getOwnerComponent().getModel("checkoutData");
            var oOrder = oCheckoutData && oCheckoutData.getData();

            if (!sessionUtils.isLoggedIn(oSession) || !sessionUtils.isCustomer(oSession)) {
                this._resetQrState();
                oRouter.navTo("RouteLogin", {}, true);
                return;
            }

            if (oOrder && oOrder.existingOrder && oOrder.orderId) {
                this._loadPaymentForOrder(oOrder.orderId);
                return;
            }

            if (!this._isValidCartCheckoutData(oOrder)) {
                this._resetQrState();
                oRouter.navTo("RouteCart", {}, true);
                return;
            }

            if (oOrder.creatingCheckout || oOrder.orderId) {
                return;
            }

            this.onGenerateQr();
        },

        _resetQrState: function () {
            var oQrModel = this.getView().getModel("qrModel");
            if (oQrModel) {
                oQrModel.setData({
                    loading: false, hasQr: false, qrCodeUrl: "", qrPayload: "", qrFallbackUsed: false,
                    statusText: "", transactionRef: "", checkoutUrl: ""
                });
            }
        },

        _isValidCartCheckoutData: function (oOrder) {
            var aItems = oOrder && Array.isArray(oOrder.items) ? oOrder.items : [];
            var fTotal = Number(oOrder && oOrder.totalAmount);
            return aItems.length > 0 &&
                aItems.every(function (oItem) {
                    return Number(oItem.Quantity || oItem.quantity) > 0;
                }) &&
                fTotal > 0;
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

            var oCheckoutData = this.getOwnerComponent().getModel("checkoutData");
            if (oCheckoutData) {
                if (oCheckoutData.getProperty("/creatingCheckout") || oCheckoutData.getProperty("/orderId")) {
                    return;
                }
                oCheckoutData.setProperty("/creatingCheckout", true);
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
                if (oCheckoutData) {
                    oCheckoutData.setProperty("/creatingCheckout", false);
                }
                oQrModel.setProperty("/loading", false);
            });
        },

        _startPaymentStatusPolling: function (sOrderId) {
            if (!sOrderId) {
                return;
            }

            this._stopPaymentStatusPolling();
            this._checkOrderPaymentStatus(sOrderId);
            this._iPaymentStatusTimer = setInterval(function () {
                this._checkOrderPaymentStatus(sOrderId);
            }.bind(this), PAYMENT_STATUS_POLL_INTERVAL_MS);
        },

        _stopPaymentStatusPolling: function () {
            if (this._iPaymentStatusTimer) {
                clearInterval(this._iPaymentStatusTimer);
                this._iPaymentStatusTimer = null;
            }
        },

        _checkOrderPaymentStatus: function (sOrderId) {
            var sEscapedOrderId = String(sOrderId || "").replace(/'/g, "''");
            return this.getOwnerComponent().getModel()
                .bindContext("/Orders('" + sEscapedOrderId + "')", undefined, {
                    $select: "OrderID,PaymentStatus",
                    $$groupId: "$direct"
                })
                .requestObject()
                .then(function (oOrder) {
                    if (String(oOrder && oOrder.PaymentStatus || "").toUpperCase() === "PAID") {
                        this._handlePaymentPaid(sOrderId);
                    }
                }.bind(this))
                .catch(function (oError) {
                    console.warn("Could not refresh order payment status:", oError);
                });
        },

        _handlePaymentPaid: function (sOrderId) {
            if (this._bPaymentSuccessHandled) {
                return;
            }

            this._bPaymentSuccessHandled = true;
            this._stopPaymentStatusPolling();
            this._resetQrState();

            var oCheckoutData = this.getOwnerComponent().getModel("checkoutData");
            if (oCheckoutData) {
                oCheckoutData.setProperty("/paymentStatus", "PAID");
            }

            MessageToast.show("Payment successful.");
            this.getOwnerComponent().getRouter().navTo("RouteFoodList", {}, true);
        },

        _displayPayOsQr: function (oPayment) {
            var oQrModel = this.getView().getModel("qrModel");
            var sQrCode = oPayment.QRCode || oPayment.qr_code || "";
            if (String(oPayment.PaymentStatus || oPayment.payment_status || oPayment.Status || oPayment.status || "").toUpperCase() === "PAID") {
                this._handlePaymentPaid(oPayment.OrderID || oPayment.order_id || "");
                return;
            }
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
                    this._startPaymentStatusPolling(sOrderId);
                    return;
                }
                var oPayment = aContexts[0].getObject();
                if (String(oPayment.PaymentStatus || oPayment.payment_status || "").toUpperCase() === "PAID") {
                    this._handlePaymentPaid(sOrderId);
                    return;
                }
                this._startPaymentStatusPolling(sOrderId);
                return this._loadPaymentGateway(oPayment.PaymentID);
            }.bind(this)).catch(function (oError) {
                console.error("Could not load payment for order:", oError);
                oQrModel.setProperty("/loading", false);
                oQrModel.setProperty("/statusText", "Could not load payment information for this order.");
                this._startPaymentStatusPolling(sOrderId);
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
                        unitPriceText: oItem.UnitPrice,
                        lineAmountText: oItem.LineAmount,
                        currency: oItem.Currency || oOrder.Currency || "VND"
                    };
                }),
                totalAmountText: oOrder.TotalAmount,
                currency: oOrder.Currency || "VND",
                note: oOrder.Note || "",
                paymentStatus: oOrder.PaymentStatus || "",
                noteBusy: false,
                sourceRoute: oCurrentData.sourceRoute || "cart",
                existingOrder: true,
                creatingCheckout: false
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
