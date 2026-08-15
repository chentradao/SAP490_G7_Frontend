sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageToast",
    "sap490g7fioriapp/model/cartUtils"
], function (Controller, MessageToast, cartUtils) {
    "use strict";

    return Controller.extend("sap490g7fioriapp.controller.FoodDetail", {

        onInit: function () {
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("RouteFoodDetail").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function (oEvent) {
            var oSession = this.getOwnerComponent().getModel("session");
            if (!oSession || !oSession.getProperty("/isLoggedIn")) {
                // this.getOwnerComponent().getRouter().navTo("RouteLogin");
                return;
            }

            var sMaterialNumber = oEvent.getParameter("arguments").materialNumber;
            var sPath = "/Food2(MaterialNumber='" + encodeURIComponent(sMaterialNumber) + "')";

            this.getView().bindElement({
                path: sPath,
                parameters: {}
            });
        },

        onNavBack: function () {
            this.getOwnerComponent().getRouter().navTo("RouteFoodList");
        },

        formatPrice: function (vPrice) {
            if (vPrice === null || vPrice === undefined || vPrice === "") {
                return "";
            }
            var fPrice = parseFloat(String(vPrice).replace(/,/g, ""));
            if (!Number.isFinite(fPrice)) {
                return "";
            }
            return fPrice.toLocaleString("en-US", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
            });
        },

        onOpenCart: function () {
            var oSession = this.getOwnerComponent().getModel("session");
            var oContext = this.getView().getBindingContext();
            if (oSession) {
                oSession.setProperty("/cartReturnRoute", "RouteFoodDetail");
                oSession.setProperty("/cartReturnMaterialNumber",
                    oContext ? oContext.getProperty("MaterialNumber") : "");
            }
            this.getOwnerComponent().getRouter().navTo("RouteCart", {}, true);
        },

        onAddToCart: function () {
            var oContext = this.getView().getBindingContext();
            if (!oContext) {
                return;
            }

            var oMaterial = oContext.getObject();
            var oSession = this.getOwnerComponent().getModel("session");
            var sUserId = oSession && oSession.getProperty("/userId");
            var oODataModel = this.getOwnerComponent().getModel();
            var oQuantityInput = this.byId("quantityInput");
            var iQuantity = oQuantityInput ? oQuantityInput.getValue() : 1;

            cartUtils.addMaterialToCart(oODataModel, oSession, sUserId, oMaterial, iQuantity)
                .then(function (sCartId) {
                    return cartUtils.refreshCartCount(oODataModel, oSession, sCartId);
                }).then(function () {
                    MessageToast.show(oMaterial.MaterialDescription + " added to cart");
                }).catch(function (oError) {
                    console.error("Add to cart from Food Detail failed:", oError);
                    MessageToast.show("Unable to add item to cart");
                });
        }
    });
});
