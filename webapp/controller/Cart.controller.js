sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel"
], function (Controller, JSONModel) {
    "use strict";

    return Controller.extend("sap490g7fioriapp.controller.Cart", {

        onInit: function () {
            // Model riêng cho view (tổng tiền, trạng thái nút checkout)
            var oViewModel = new JSONModel({
                totalPrice: 0,
                totalPriceFormatted: "0.00",
                currency: "",
                checkoutEnabled: false
            });
            this.getView().setModel(oViewModel, "cartView");

            // TODO: nếu CartID lấy theo route, gọi lại _loadCartItems như comment gốc
        },

        onBack: function () {
            this.getOwnerComponent().getRouter().navTo("RouteFoodList", {}, true);
        },

        formatUnitPrice: function (fUnitPrice, sCurrency) {
            var fValue = parseFloat(fUnitPrice);
            if (isNaN(fValue)) {
                return "";
            }
            return fValue.toFixed(2) + (sCurrency ? " " + sCurrency : "");
        },

        formatLineAmount: function (fUnitPrice, iQuantity, sCurrency) {
            var fValue = (parseFloat(fUnitPrice) || 0) * (parseInt(iQuantity, 10) || 0);
            return fValue.toFixed(2) + (sCurrency ? " " + sCurrency : "");
        },

        // Gọi mỗi khi List load xong / filter lại -> tính tổng tiền
        onCartListUpdateFinished: function (oEvent) {
            var oList = this.byId("cartList");
            var oBinding = oList.getBinding("items");
            var aContexts = oBinding ? oBinding.getCurrentContexts() : [];

            var fTotal = 0;
            var sCurrency = "";

            aContexts.forEach(function (oCtx) {
                if (!oCtx) { return; }
                var oData = oCtx.getObject();
                var fUnitPrice = parseFloat(oData.UnitPrice) || 0;
                var iQty = parseInt(oData.Quantity, 10) || 0;
                fTotal += fUnitPrice * iQty;
                if (!sCurrency && oData.Currency) {
                    sCurrency = oData.Currency;
                }
            });

            var oViewModel = this.getView().getModel("cartView");
            oViewModel.setProperty("/totalPrice", fTotal);
            oViewModel.setProperty("/totalPriceFormatted", fTotal.toFixed(2) + (sCurrency ? " " + sCurrency : ""));
            oViewModel.setProperty("/currency", sCurrency);
            oViewModel.setProperty("/checkoutEnabled", aContexts.length > 0);
        },

        onCheckout: function () {
            var oList = this.byId("cartList");
            var oBinding = oList.getBinding("items");
            var aContexts = oBinding ? oBinding.getCurrentContexts() : [];
            var oViewModel = this.getView().getModel("cartView");

            // Gom dữ liệu giỏ hàng để truyền sang trang Checkout
            var aItems = aContexts.map(function (oCtx) {
                var d = oCtx.getObject();
                return {
                    FoodID: d.FoodID,
                    FoodName: d._Food ? d._Food.FoodName : "",
                    Quantity: d.Quantity,
                    UnitPrice: d.UnitPrice,
                    Currency: d.Currency,
                    LineAmount: (parseFloat(d.UnitPrice) || 0) * (parseInt(d.Quantity, 10) || 0)
                };
            });

            var oOrderPayload = {
                items: aItems,
                totalAmount: oViewModel.getProperty("/totalPrice"),
                currency: oViewModel.getProperty("/currency"),
                note: ""
            };

            // Lưu tạm vào Component model để Checkout đọc lại (đơn giản, không cần backend order trước)
            this.getOwnerComponent().setModel(
                new sap.ui.model.json.JSONModel(oOrderPayload), "checkoutData"
            );

            this.getOwnerComponent().getRouter().navTo("RouteCheckout");
        }
    });
});