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

        onOpenCart: function () {
            this.getOwnerComponent().getRouter().navTo("RouteCart", {}, true);
        },

        onAddToCart: function () {
            var oContext = this.getView().getBindingContext();
    var oMaterial = oContext.getObject();
    var oSession = this.getOwnerComponent().getModel("session");
    var sUserId = oSession && oSession.getProperty("/userId");
    var oODataModel = this.getOwnerComponent().getModel();

    var oQuantityInput = this.byId("quantityInput");
    var iQuantity = oQuantityInput ? oQuantityInput.getValue() : 1;

    cartUtils.addMaterialToCart(oODataModel, oSession, sUserId, oMaterial, iQuantity).then(function () {
        MessageToast.show(oMaterial.MaterialDescription + " added to cart");
    }).catch(function () {
        MessageToast.show("Unable to add item to cart");
    });
}
    });
});
