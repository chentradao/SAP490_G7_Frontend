sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageBox"
], function (Controller, History, Filter, FilterOperator, MessageBox) {
    "use strict";

    return Controller.extend("sap490g7fioriapp.controller.DailyFinishedGoodsIssueHistory", {
        onInit: function () {
            this.getOwnerComponent().getRouter()
                .getRoute("RouteDailyFinishedGoodsIssueHistory")
                .attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            const oSession = this.getOwnerComponent().getModel("session");
            const sRole = String(oSession && oSession.getProperty("/role") || "").toUpperCase();
            const bAllowed = Boolean(
                oSession && oSession.getProperty("/isLoggedIn") &&
                (sRole === "STAFF" || sRole === "ADMIN")
            );

            if (!bAllowed) {
                MessageBox.warning("Only STAFF or ADMIN can access Daily FG Goods Issue History.");
                this.getOwnerComponent().getRouter().navTo("RouteLogin", {}, true);
                return;
            }

            this.onClear();
            this.onRefresh();
        },

        onFilter: function () {
            const oBinding = this.byId("dailyGIHistoryTable").getBinding("items");
            if (!oBinding) {
                return;
            }

            const sQuery = String(this.byId("dailyGIHistorySearch").getValue() || "").trim();
            const sPostingDate = this.byId("dailyGIHistoryDate").getValue();
            const sSource = this.byId("dailyGIHistorySource").getSelectedKey();
            const aFilters = [];

            if (sQuery) {
                aFilters.push(new Filter({
                    filters: [
                        new Filter("MaterialDocument", FilterOperator.Contains, sQuery),
                        new Filter("Material", FilterOperator.Contains, sQuery.toUpperCase()),
                        new Filter("MaterialDescription", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                }));
            }
            if (sPostingDate) {
                aFilters.push(new Filter("PostingDate", FilterOperator.EQ, sPostingDate));
            }
            if (sSource === "DAILY") {
                aFilters.push(new Filter("ItemText", FilterOperator.StartsWith, "Daily canteen sales"));
            } else if (sSource === "MANUAL") {
                aFilters.push(new Filter("ItemText", FilterOperator.EQ, ""));
            }

            oBinding.filter(aFilters.length ? new Filter({ filters: aFilters, and: true }) : []);
        },

        onClear: function () {
            this.byId("dailyGIHistorySearch").setValue("");
            this.byId("dailyGIHistoryDate").setValue("");
            this.byId("dailyGIHistorySource").setSelectedKey("ALL");
            const oBinding = this.byId("dailyGIHistoryTable").getBinding("items");
            if (oBinding) {
                oBinding.filter([]);
            }
        },

        onRefresh: function () {
            const oBinding = this.byId("dailyGIHistoryTable").getBinding("items");
            if (oBinding) {
                oBinding.refresh();
            }
        },

        formatDate: function (vDate) {
            if (!vDate) { return "-"; }
            const oDate = vDate instanceof Date ? vDate : new Date(String(vDate) + "T00:00:00");
            return Number.isNaN(oDate.getTime()) ? String(vDate) : oDate.toLocaleDateString("vi-VN");
        },

        formatQuantity: function (vQuantity) {
            return Number(vQuantity || 0).toLocaleString("vi-VN", {
                minimumFractionDigits: 3,
                maximumFractionDigits: 3
            });
        },

        formatSource: function (sItemText) {
            return String(sItemText || "").startsWith("Daily canteen sales")
                ? "Daily Sales"
                : "Manual / Legacy";
        },

        formatSourceState: function (sItemText) {
            return String(sItemText || "").startsWith("Daily canteen sales")
                ? "Success"
                : "Information";
        },

        onNavBack: function () {
            const sPreviousHash = History.getInstance().getPreviousHash();
            if (sPreviousHash !== undefined) {
                window.history.go(-1);
            } else {
                this.getOwnerComponent().getRouter().navTo("RouteStaffDashboard", {}, true);
            }
        }
    });
});
