sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageBox"
], function (Controller, History, Filter, FilterOperator, MessageBox) {
    "use strict";

    return Controller.extend("sap490g7fioriapp.controller.ProductionGoodsIssueHistory", {
        onInit: function () {
            this.getOwnerComponent().getRouter().getRoute("RouteProductionGoodsIssueHistory")
                .attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            const oSession = this.getOwnerComponent().getModel("session");
            const sRole = String(oSession && oSession.getProperty("/role") || "").toUpperCase();
            const bCanAccess = Boolean(
                oSession &&
                oSession.getProperty("/isLoggedIn") &&
                (sRole === "STAFF" || sRole === "ADMIN")
            );

            if (!bCanAccess) {
                MessageBox.warning("Only STAFF or ADMIN can access Production Goods Issue History.");
                this.getOwnerComponent().getRouter().navTo("RouteLogin", {}, true);
                return;
            }

            this.onClear();
            this.onRefresh();
        },

        onSearch: function (oEvent) {
            const sQuery = (oEvent.getParameter("query") || oEvent.getParameter("newValue") || "").trim();
            this._applyFilters(sQuery);
        },

        _applyFilters: function (sQuery) {
            const oTable = this.byId("goodsIssueHistoryTable");
            const oBinding = oTable && oTable.getBinding("items");
            if (!oBinding) {
                return;
            }

            const aFilters = [
                new Filter("goods_issue_status", FilterOperator.EQ, "POSTED")
            ];

            if (sQuery) {
                aFilters.push(new Filter({
                    filters: [
                        new Filter("material_document", FilterOperator.EQ, sQuery),
                        new Filter("production_order", FilterOperator.EQ, sQuery),
                        new Filter("material", FilterOperator.EQ, sQuery.toUpperCase()),
                        new Filter("request_id", FilterOperator.EQ, sQuery)
                    ],
                    and: false
                }));
            }

            oBinding.filter(new Filter({ filters: aFilters, and: true }));
        },

        onClear: function () {
            const oSearch = this.byId("goodsIssueHistorySearch");
            if (oSearch) {
                oSearch.setValue("");
            }
            this._applyFilters("");
        },

        onRefresh: function () {
            const oTable = this.byId("goodsIssueHistoryTable");
            const oBinding = oTable && oTable.getBinding("items");
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
            const sPreviousHash = History.getInstance().getPreviousHash();
            if (sPreviousHash !== undefined) {
                window.history.go(-1);
                return;
            }
            this.getOwnerComponent().getRouter().navTo("RouteProductionOrderHistory", {}, true);
        }
    });
});
