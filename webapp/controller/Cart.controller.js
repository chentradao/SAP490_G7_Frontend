sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap490g7fioriapp/model/cartUtils"
], function (Controller, JSONModel, MessageToast, cartUtils) {
    "use strict";

    return Controller.extend("sap490g7fioriapp.controller.Cart", {

        onInit: function () {
            var oViewModel = new JSONModel({
                totalPrice: 0,
                totalPriceFormatted: "0.00",
                currency: "",
                checkoutEnabled: false
            });
            this.getView().setModel(oViewModel, "cartView");
        },

        onBack: function () {
            this.getOwnerComponent().getRouter().navTo("RouteFoodList", {}, true);
        },

        // DA SUA: dung oContext.delete() (API dung cho ODataModel v4),
        // thay vi oModel.remove() (API cua v2, khong ton tai trong v4).
        onRemoveCartItem: function (oEvent) {
            var oSource = oEvent.getSource();
            var oContext = oSource.getBindingContext();
            if (!oContext) {
                return;
            }

            oContext.delete().then(function () {
                MessageToast.show("Item removed from cart.");

                // Cap nhat lai tong tien hien thi tren view
                this.onCartListUpdateFinished();

                // Cap nhat lai badge so luong tren FoodList (session/cartItemCount)
                var oSession = this.getOwnerComponent().getModel("session");
                var sCartId = oSession && oSession.getProperty("/cartId");
                var oODataModel = oContext.getModel();

                if (cartUtils && oSession && sCartId) {
                    cartUtils.refreshCartCount(oODataModel, oSession, sCartId);
                }
            }.bind(this)).catch(function () {
                MessageToast.show("Could not remove the item from cart.");
            });
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

            var fTotalAmount = aItems.reduce(function (sum, item) {
                return sum + ((parseFloat(item.UnitPrice) || 0) * (parseInt(item.Quantity, 10) || 0));
            }, 0);

            var oOrderPayload = {
                items: aItems,
                totalAmount: fTotalAmount,
                currency: oViewModel.getProperty("/currency"),
                note: ""
            };

            this.getOwnerComponent().setModel(
                new JSONModel(oOrderPayload), "checkoutData"
            );

            this.getOwnerComponent().getRouter().navTo("RouteCheckout");
        }
    });
});