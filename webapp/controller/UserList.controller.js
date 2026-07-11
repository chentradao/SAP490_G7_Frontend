sap.ui.define([
    "sap/ui/core/mvc/Controller"
], function (Controller) {
    "use strict";

    return Controller.extend("sap490g7fioriapp.controller.UserList", {

        onInit: function () {
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("RouteUserList").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            var oSession = this.getOwnerComponent().getModel("session");
            if (!oSession || !oSession.getProperty("/isLoggedIn")) {
                // this.getOwnerComponent().getRouter().navTo("RouteLogin");
            }
        },

        onNavBack: function () {
            // this.getOwnerComponent().getRouter().navTo("RouteFoodList");
        }
    });
});
