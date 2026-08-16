sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (Controller, Filter, FilterOperator, MessageToast, MessageBox) {
    "use strict";

    return Controller.extend("sap490g7fioriapp.controller.FoodStatus", {
        onInit: function () {
            this.getOwnerComponent().getRouter().getRoute("RouteFoodStatus")
                .attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            var oSession = this.getOwnerComponent().getModel("session");
            var sRole = String(oSession && oSession.getProperty("/role") || "").toUpperCase();
            if (!oSession || !oSession.getProperty("/isLoggedIn") || ["STAFF", "ADMIN"].indexOf(sRole) === -1) {
                MessageBox.warning("Only STAFF or ADMIN can manage food status.");
                this.getOwnerComponent().getRouter().navTo("RouteLogin", {}, true);
                return;
            }
            this._applyFilters("");
        },

        onSearch: function (oEvent) {
            var sQuery = oEvent.getParameter("newValue") || oEvent.getParameter("query") || "";
            this._applyFilters(sQuery);
        },

        _applyFilters: function (sQuery) {
            var oBinding = this.byId("foodStatusTable").getBinding("items");
            var aFilters = [new Filter("MaterialNumber", FilterOperator.GE, "FG00009")];
            if (sQuery) {
                aFilters.push(new Filter({
                    filters: [
                        new Filter("MaterialNumber", FilterOperator.Contains, sQuery),
                        new Filter("MaterialDescription", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                }));
            }
            oBinding.filter(aFilters);
        },

        onStatusChange: function (oEvent) {
            var oSwitch = oEvent.getSource();
            var oContext = oSwitch.getBindingContext();
            var bActive = oEvent.getParameter("state");
            var sDescription = oContext && oContext.getProperty("MaterialDescription") || "Food item";
            var oModel = this.getOwnerComponent().getModel();
            var oAction;

            if (!oContext) { return; }
            oSwitch.setEnabled(false);
            oAction = oModel.bindContext(
                "com.sap.gateway.srvd.zsd_g7_canteen.v0001.setFoodStatus(...)",
                oContext,
                { $$groupId: "$direct" }
            );
            oAction.setParameter("Status", bActive ? "A" : "I");

            oAction.execute().then(function () {
                return oContext.refresh();
            }).then(function () {
                MessageToast.show(sDescription + " is now " + (bActive ? "active" : "inactive") + ".");
            }).catch(function (oError) {
                console.error("Could not update food status:", oError);
                oSwitch.setState(!bActive);
                MessageBox.error("Could not update the food status. Please try again.");
            }).finally(function () {
                oSwitch.setEnabled(true);
            });
        },

        formatPrice: function (vPrice) {
            return Number(vPrice || 0).toLocaleString("en-US", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
            });
        },

        onBack: function () {
            this.getOwnerComponent().getRouter().navTo("RouteStaffDashboard", {}, true);
        }
    });
});
