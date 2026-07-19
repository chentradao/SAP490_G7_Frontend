sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel"
], function (Controller, JSONModel) {
    "use strict";

    return Controller.extend("sap490g7fioriapp.controller.Checkout", {

        onInit: function () {
            var oQrModel = new JSONModel({
                loading: false,
                hasQr: false,
                qrCodeUrl: "",
                statusText: "",
                transactionRef: ""
            });
            this.getView().setModel(oQrModel, "qrModel");

            var oRouter = this.getOwnerComponent().getRouter();
            var oRoute = oRouter && oRouter.getRoute ? oRouter.getRoute("RouteCheckout") : null;

            if (oRoute && typeof oRoute.attachPatternMatched === "function") {
                oRoute.attachPatternMatched(this._onRouteMatched, this);
            } else {
                this._onRouteMatched();
            }
        },

        _onRouteMatched: function () {
            this.onGenerateQr();
        },

        onBack: function () {
            this.getOwnerComponent().getRouter().navTo("RouteCart", {}, true);
        },

        onGenerateQr: function () {
            var oQrModel = this.getView().getModel("qrModel");
            var oComponent = this.getOwnerComponent();
            var oCheckoutModel = oComponent.getModel("checkoutData");
            var oOrder = oCheckoutModel ? oCheckoutModel.getData() : null;

            var amount = 0;
            if (oOrder && Array.isArray(oOrder.items)) {
                amount = oOrder.items.reduce(function (sum, item) {
                    var fUnitPrice = parseFloat(item.UnitPrice) || 0;
                    var iQty = parseInt(item.Quantity, 10) || 0;
                    return sum + (fUnitPrice * iQty);
                }, 0);
            }
            if (amount === 0 && oOrder && oOrder.totalAmount) {
                amount = parseFloat(oOrder.totalAmount) || 0;
            }
            if (amount === 0) {
                amount = 50000;
            }

            var transactionCode = oOrder && oOrder.orderId ? oOrder.orderId : "ORDER001";
            var timestamp = Date.now();

            var qrCodeUrl =
                "https://img.vietqr.io/image/MB-0964735122-compact.png" +
                "?amount=" + amount +
                "&addInfo=" + encodeURIComponent(transactionCode) +
                "&accountName=" + encodeURIComponent("DO MINH CHIEN") +
                "&t=" + timestamp;

            oQrModel.setProperty("/loading", false);
            oQrModel.setProperty("/hasQr", true);
            oQrModel.setProperty("/qrCodeUrl", qrCodeUrl);
            oQrModel.setProperty("/transactionRef", transactionCode);
            oQrModel.setProperty("/statusText", "Quét mã để thanh toán qua VietQR");
        }
    });
});