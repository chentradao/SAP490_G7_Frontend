sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageBox"
], function (Controller, History, Filter, FilterOperator, MessageBox) {
    "use strict";

    return Controller.extend("sap490g7fioriapp.controller.ProductionGoodsReceiptHistory", {
        onInit: function () {
            this.getOwnerComponent().getRouter().getRoute("RouteProductionGoodsReceiptHistory")
                .attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            const oSession = this.getOwnerComponent().getModel("session");
            const sRole = String(oSession && oSession.getProperty("/role") || "").toUpperCase();
            const bCanAccess = Boolean(oSession && oSession.getProperty("/isLoggedIn") &&
                (sRole === "STAFF" || sRole === "ADMIN"));
            if (!bCanAccess) {
                MessageBox.warning("Only STAFF or ADMIN can access Production Goods Receipt History.");
                this.getOwnerComponent().getRouter().navTo("RouteLogin", {}, true);
                return;
            }
            this._applyFilters("");
            this.onRefresh();
        },

        onSearch: function (oEvent) {
            this._applyFilters((oEvent.getParameter("query") || oEvent.getParameter("newValue") || "").trim());
        },

        _applyFilters: function (sQuery) {
            const oBinding = this.byId("productionGoodsReceiptHistoryTable").getBinding("items");
            if (!oBinding) {
                return;
            }
            const aFilters = [new Filter("goods_receipt_status", FilterOperator.EQ, "POSTED")];
            if (sQuery) {
                aFilters.push(new Filter({
                    filters: [
                        new Filter("gr_material_document", FilterOperator.Contains, sQuery),
                        new Filter("production_order", FilterOperator.Contains, sQuery),
                        new Filter("material", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                }));
            }
            oBinding.filter(new Filter({ filters: aFilters, and: true }));
        },

        onClear: function () {
            this.byId("productionGRSearch").setValue("");
            this._applyFilters("");
        },

        onRefresh: function () {
            const oBinding = this.byId("productionGoodsReceiptHistoryTable").getBinding("items");
            if (oBinding) {
                oBinding.refresh();
            }
        },

        formatDateTime: function (vDate) {
            if (!vDate) {
                return "-";
            }
            const oDate = vDate instanceof Date ? vDate : new Date(vDate);
            return Number.isNaN(oDate.getTime()) ? String(vDate) : oDate.toLocaleString("vi-VN");
        },

        onNavBack: function () {
            if (History.getInstance().getPreviousHash() !== undefined) {
                window.history.go(-1);
                return;
            }
            this.getOwnerComponent().getRouter().navTo("RouteStaffDashboard", {}, true);
        }
    });
});
