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

            if (!oOrder || !oOrder.items || !oOrder.items.length) {
                oQrModel.setProperty("/loading", false);
                oQrModel.setProperty("/hasQr", false);
                oQrModel.setProperty("/statusText", "Không có dữ liệu giỏ hàng để tạo QR.");
                return;
            }

            oQrModel.setProperty("/loading", true);
            oQrModel.setProperty("/hasQr", false);
            oQrModel.setProperty("/statusText", "Đang tạo mã QR thanh toán...");

            var oModel = oComponent.getModel();
            if (!oModel || typeof oModel.callFunction !== "function") {
                oQrModel.setProperty("/loading", false);
                oQrModel.setProperty("/hasQr", false);
                oQrModel.setProperty("/statusText", "Môi trường dữ liệu chưa sẵn sàng để tạo QR.");
                return;
            }

            oModel.callFunction("/CreateVnpayPayment", {
                method: "POST",
                urlParameters: {
                    OrderAmount: oOrder.totalAmount,
                    Currency: oOrder.currency
                },
                success: function (oData) {
                    oQrModel.setProperty("/loading", false);
                    oQrModel.setProperty("/hasQr", true);
                    oQrModel.setProperty("/qrCodeUrl", oData && oData.QrCodeUrl ? oData.QrCodeUrl : "");
                    oQrModel.setProperty("/transactionRef", oData && oData.TransactionRef ? oData.TransactionRef : "");
                    oQrModel.setProperty("/statusText", "Quét mã để thanh toán qua VNPay");
                }.bind(this),
                error: function (oError) {
                    var sMessage = oError && oError.message ? oError.message : "Tạo mã QR thất bại, vui lòng thử lại.";
                    oQrModel.setProperty("/loading", false);
                    oQrModel.setProperty("/hasQr", false);
                    oQrModel.setProperty("/statusText", "Tạo mã QR thất bại. " + sMessage);
                }.bind(this)
            });
        }
    });
});