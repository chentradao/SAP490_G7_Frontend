sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap490g7fioriapp/model/sessionUtils"
], function (Controller, sessionUtils) {
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

        onLogout: function () {
            var oSession = this.getOwnerComponent().getModel("session");
            sessionUtils.resetSession(oSession);
            this.getOwnerComponent().getRouter().navTo("RouteLogin", {}, true);
        }
    });
});
