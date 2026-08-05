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

            var sFoodId = oEvent.getParameter("arguments").foodId;
            var oODataModel = this.getOwnerComponent().getModel();

            var sPath = "/Foods(FoodID='" + sFoodId + "')";

            this.getView().bindElement({
                path: sPath,
                parameters: {
                    $expand: "_Category"
                }
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
    var oFood = oContext.getObject();
    var oSession = this.getOwnerComponent().getModel("session");
    var sUserId = oSession && oSession.getProperty("/userId");
    var oODataModel = this.getOwnerComponent().getModel();

    var oQuantityInput = this.byId("quantityInput");
    var iQuantity = oQuantityInput ? oQuantityInput.getValue() : 1;

    cartUtils.addFoodToCart(oODataModel, oSession, sUserId, oFood, iQuantity).then(function () {
        MessageToast.show(oFood.FoodName + " added to cart");
    }).catch(function () {
        MessageToast.show("Unable to add item to cart");
    });
}
    });
});