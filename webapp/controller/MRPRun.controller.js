sap.ui.define([
    "./PIRPlanning.controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox"
], function (PIRPlanningController, JSONModel, MessageBox) {
    "use strict";

    return PIRPlanningController.extend("sap490g7fioriapp.controller.MRPRun", {
        onInit: function () {
            const oInitialData = this._createInitialData();
            oInitialData.totalBatchCount = 0;
            oInitialData.filteredBatchCount = 0;
            this.getView().setModel(new JSONModel(oInitialData), "pir");
            this.getOwnerComponent().getRouter().getRoute("RouteMRPRun")
                .attachPatternMatched(this._onMRPRunMatched, this);
        },

        _onMRPRunMatched: function () {
            const oSession = this.getOwnerComponent().getModel("session");
            const sRole = String(oSession && oSession.getProperty("/role") || "").toUpperCase();
            const bCanAccess = Boolean(oSession && oSession.getProperty("/isLoggedIn") &&
                (sRole === "STAFF" || sRole === "ADMIN"));

            if (!bCanAccess) {
                MessageBox.warning("Only STAFF or ADMIN can access MRP Run.");
                this.getOwnerComponent().getRouter().navTo("RouteLogin", {}, true);
                return;
            }
            this.onRefresh();
        },

        _loadPIRHistory: async function () {
            await PIRPlanningController.prototype._loadPIRHistory.apply(this, arguments);
            this._allHistoryBatches = (this.getView().getModel("pir").getProperty("/historyBatches") || []).slice();
            this._applyBatchFilters();
        },

        onRefresh: function () {
            return this._loadPIRHistory();
        },

        onFiltersChanged: function () {
            this._applyBatchFilters();
        },

        onClearFilters: function () {
            this.byId("mrpRunSearch").setValue("");
            this.byId("mrpRunStatusFilter").setSelectedKey("ALL");
            this.byId("mrpRunSort").setSelectedKey("NEWEST");
            this._applyBatchFilters();
        },

        _applyBatchFilters: function () {
            const oPIR = this.getView().getModel("pir");
            const aAllBatches = (this._allHistoryBatches || []).slice();
            const sQuery = String(this.byId("mrpRunSearch").getValue() || "").trim().toUpperCase();
            const sStatus = this.byId("mrpRunStatusFilter").getSelectedKey();
            const sSort = this.byId("mrpRunSort").getSelectedKey();

            const aFiltered = aAllBatches.filter(function (oBatch) {
                const aItems = oBatch.items || [];
                const aStatuses = aItems.map(function (oItem) {
                    return String(oItem.status || "").toUpperCase();
                });
                const bMatchesQuery = !sQuery || [
                    oBatch.batchId,
                    oBatch.requirementDate,
                    oBatch.plant
                ].concat(aItems.map(function (oItem) {
                    return oItem.material;
                })).some(function (vValue) {
                    return String(vValue || "").toUpperCase().includes(sQuery);
                });

                let bMatchesStatus = true;
                if (sStatus === "READY") {
                    bMatchesStatus = Boolean(oBatch.canRunMRP);
                } else if (sStatus === "COMPLETED") {
                    bMatchesStatus = aStatuses.length > 0 && aStatuses.every(function (sItemStatus) {
                        return sItemStatus === "MRP_COMPLETED";
                    });
                } else if (sStatus === "ERROR") {
                    bMatchesStatus = aStatuses.some(function (sItemStatus) {
                        return sItemStatus === "MRP_ERROR" || sItemStatus === "ERROR";
                    });
                } else if (sStatus === "LEGACY") {
                    bMatchesStatus = String(oBatch.batchId || "").toUpperCase().startsWith("LEGACY-");
                }
                return bMatchesQuery && bMatchesStatus;
            });

            aFiltered.sort(function (a, b) {
                if (sSort === "OLDEST") {
                    return String(a.createdAt || a.requirementDate).localeCompare(String(b.createdAt || b.requirementDate));
                }
                if (sSort === "BATCH_ASC") {
                    return String(a.batchId || "").localeCompare(String(b.batchId || ""));
                }
                if (sSort === "BATCH_DESC") {
                    return String(b.batchId || "").localeCompare(String(a.batchId || ""));
                }
                return String(b.createdAt || b.requirementDate).localeCompare(String(a.createdAt || a.requirementDate));
            });

            oPIR.setProperty("/totalBatchCount", aAllBatches.length);
            oPIR.setProperty("/filteredBatchCount", aFiltered.length);
            oPIR.setProperty("/historyBatches", aFiltered);
        },

        onOpenPIRPlanning: function () {
            this.getOwnerComponent().getRouter().navTo("RoutePIRPlanning");
        },

        onOpenMRPResults: function () {
            this.getOwnerComponent().getRouter().navTo("RouteMRPResults");
        }
    });
});
