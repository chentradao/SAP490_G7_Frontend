sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox"
], function (Controller, History, JSONModel, MessageBox) {
    "use strict";

    return Controller.extend("sap490g7fioriapp.controller.ForecastBatchOverview", {
        onInit: function () {
            this.getView().setModel(new JSONModel({
                busy: false,
                batches: [],
                selectedBatchId: "",
                batchCode: "No Forecast Batch",
                batchId: "",
                plant: "-",
                requirementDate: "-",
                status: "NO DATA",
                statusState: "None",
                progress: 0,
                forecastCount: 0,
                forecastCompleted: 0,
                mrpStatus: "Not Run",
                purchaseCount: 0,
                purchaseOrdered: 0,
                purchaseOrderCount: 0,
                goodsReceiptCount: 0,
                productionCount: 0,
                productionCreated: 0,
                productionCompleted: 0,
                nextActionText: "Create Forecast",
                latestMessage: ""
            }), "batchOverview");

            this.getOwnerComponent().getRouter().getRoute("RouteForecastBatchOverview")
                .attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function (oEvent) {
            const oSession = this.getOwnerComponent().getModel("session");
            const sRole = String(oSession && oSession.getProperty("/role") || "").toUpperCase();
            if (!oSession || !oSession.getProperty("/isLoggedIn") || !["STAFF", "ADMIN"].includes(sRole)) {
                MessageBox.warning("Only STAFF or ADMIN can access Forecast Batch Overview.");
                this.getOwnerComponent().getRouter().navTo("RouteLogin", {}, true);
                return;
            }

            const sBatchId = decodeURIComponent(
                String(oEvent.getParameter("arguments").batchId || "latest")
            );
            this._loadOverview(sBatchId);
        },

        _readCollection: async function (sPath) {
            const oBinding = this.getOwnerComponent().getModel().bindList(
                sPath,
                undefined,
                undefined,
                undefined,
                { $$groupId: "$direct" }
            );
            const aContexts = await oBinding.requestContexts(0, 5000);
            return aContexts.map(function (oContext) {
                return Object.assign({}, oContext.getObject());
            });
        },

        _formatBatchCode: function (sBatchId, vDate) {
            const sDate = String(vDate || "").slice(0, 10).replace(/-/g, "") || "UNKNOWN";
            const sShortId = String(sBatchId || "").replace(/-/g, "").slice(0, 8).toUpperCase();
            return "FORECAST-" + sDate + "-" + sShortId;
        },

        _loadOverview: async function (sRequestedBatchId) {
            const oViewModel = this.getView().getModel("batchOverview");
            oViewModel.setProperty("/busy", true);

            try {
                const aData = await Promise.all([
                    this._readCollection("/PIRRequests"),
                    this._readCollection("/MRPRuns"),
                    this._readCollection("/MRPRunItems"),
                    this._readCollection("/ZP_G7_PO_REQUEST"),
                    this._readCollection("/GoodsReceiptRequests"),
                    this._readCollection("/ProductionOrderRequests")
                ]);
                const aPIRs = aData[0];
                const aRuns = aData[1];
                const aRunItems = aData[2];
                const aPORequests = aData[3];
                const aGRRequests = aData[4];
                const aProductionRequests = aData[5];
                const mBatches = new Map();

                aPIRs.forEach(function (oPIR) {
                    const sBatchId = String(oPIR.batch_id || "");
                    if (!sBatchId) {
                        return;
                    }
                    const oBatch = mBatches.get(sBatchId) || {
                        batchId: sBatchId,
                        requirementDate: oPIR.requirement_date || "",
                        plant: oPIR.plant || "",
                        timestamp: String(oPIR.created_at || oPIR.requirement_date || "")
                    };
                    oBatch.timestamp = String(oPIR.created_at || oBatch.timestamp || "");
                    mBatches.set(sBatchId, oBatch);
                });

                aRuns.forEach(function (oRun) {
                    const sBatchId = String(oRun.BatchID || "");
                    if (!sBatchId) {
                        return;
                    }
                    const oBatch = mBatches.get(sBatchId) || {
                        batchId: sBatchId,
                        requirementDate: oRun.RequirementDate || "",
                        plant: oRun.Plant || "",
                        timestamp: ""
                    };
                    const sTimestamp = String(oRun.StartedAt || oRun.FinishedAt || "");
                    if (sTimestamp > oBatch.timestamp) {
                        oBatch.timestamp = sTimestamp;
                    }
                    oBatch.requirementDate = oBatch.requirementDate || oRun.RequirementDate || "";
                    oBatch.plant = oBatch.plant || oRun.Plant || "";
                    mBatches.set(sBatchId, oBatch);
                });

                const aBatches = Array.from(mBatches.values()).map(function (oBatch) {
                    return Object.assign({}, oBatch, {
                        code: this._formatBatchCode(oBatch.batchId, oBatch.requirementDate || oBatch.timestamp)
                    });
                }, this).sort(function (a, b) {
                    return String(b.timestamp).localeCompare(String(a.timestamp));
                });
                const sSelectedBatchId = sRequestedBatchId !== "latest" && mBatches.has(sRequestedBatchId)
                    ? sRequestedBatchId
                    : ((aBatches[0] && aBatches[0].batchId) || "");

                this._overviewData = {
                    pirs: aPIRs,
                    runs: aRuns,
                    runItems: aRunItems,
                    poRequests: aPORequests,
                    grRequests: aGRRequests,
                    productionRequests: aProductionRequests
                };
                oViewModel.setProperty("/batches", aBatches);
                oViewModel.setProperty("/selectedBatchId", sSelectedBatchId);
                this._applyBatch(sSelectedBatchId);
            } catch (oError) {
                MessageBox.error(oError.message || "Could not load Forecast Batch Overview.");
            } finally {
                oViewModel.setProperty("/busy", false);
            }
        },

        _applyBatch: function (sBatchId) {
            const oViewModel = this.getView().getModel("batchOverview");
            const aBatches = oViewModel.getProperty("/batches") || [];
            const oBatch = aBatches.find(function (oItem) {
                return oItem.batchId === sBatchId;
            });
            if (!oBatch || !this._overviewData) {
                return;
            }

            const aPIRs = this._overviewData.pirs.filter(function (oItem) {
                return String(oItem.batch_id || "") === sBatchId;
            });
            const aRuns = this._overviewData.runs.filter(function (oItem) {
                return String(oItem.BatchID || "") === sBatchId;
            }).sort(function (a, b) {
                return String(b.StartedAt || "").localeCompare(String(a.StartedAt || ""));
            });
            const aRunItems = this._overviewData.runItems.filter(function (oItem) {
                return String(oItem.BatchID || "") === sBatchId;
            });
            const aPRItems = aRunItems.filter(function (oItem) {
                return String(oItem.DocumentCategory || "").toUpperCase() === "PURCHASE_REQ";
            });
            const aPlannedItems = aRunItems.filter(function (oItem) {
                return String(oItem.DocumentCategory || "").toUpperCase() === "PLANNED_ORDER" &&
                    String(oItem.Material || "").startsWith("FG");
            });
            const aPORequests = this._overviewData.poRequests.filter(function (oItem) {
                return String(oItem.batch_id || "") === sBatchId;
            });
            const aGRRequests = this._overviewData.grRequests.filter(function (oItem) {
                return String(oItem.batch_id || "") === sBatchId;
            });
            const aProductionRequests = this._overviewData.productionRequests.filter(function (oItem) {
                return String(oItem.batch_id || "") === sBatchId;
            });
            const oLatestRun = aRuns[0] || {};
            const iForecastCompleted = aPIRs.filter(function (oItem) {
                return ["CREATED", "MRP_COMPLETED"].includes(String(oItem.status || "").toUpperCase());
            }).length;
            const iPurchaseOrdered = aPRItems.filter(function (oPR) {
                return Boolean(oPR.PurchaseOrder) || aPORequests.some(function (oRequest) {
                    return String(oRequest.purchase_requisition || "") === String(oPR.DocumentNumber || "") &&
                        String(oRequest.purchase_requisition_item || "") === String(oPR.DocumentItem || "") &&
                        Boolean(oRequest.purchase_order);
                });
            }).length;
            const iGoodsReceipts = aGRRequests.filter(function (oItem) {
                return Boolean(oItem.material_document);
            }).length;
            const iProductionCreated = aProductionRequests.filter(function (oItem) {
                return Boolean(oItem.production_order);
            }).length;
            const iProductionCompleted = aProductionRequests.filter(function (oItem) {
                return String(oItem.status || "").toUpperCase() === "COMPLETED" ||
                    Boolean(oItem.gr_material_document);
            }).length;
            const oUniquePOs = new Set(aPORequests.map(function (oItem) {
                return oItem.purchase_order;
            }).filter(Boolean));
            const bMRPCompleted = String(oLatestRun.RunStatus || "").toUpperCase() === "COMPLETED";
            const bProcurementCompleted = aPRItems.length === 0 || iPurchaseOrdered === aPRItems.length;
            const bProductionCompleted = aPlannedItems.length === 0 || iProductionCompleted === aPlannedItems.length;
            const aMilestones = [
                aPIRs.length > 0 && iForecastCompleted === aPIRs.length,
                bMRPCompleted,
                bProcurementCompleted,
                bProductionCompleted
            ];
            const iProgress = Math.round(aMilestones.filter(Boolean).length / aMilestones.length * 100);
            let sNextActionText = "Create Forecast";
            let sNextRoute = "RoutePIRPlanning";

            if (aPIRs.length && !bMRPCompleted) {
                sNextActionText = "Run Total MRP";
            } else if (!bProcurementCompleted) {
                sNextActionText = "Process Purchase Requisitions";
                sNextRoute = "RouteMRPResults";
            } else if (oUniquePOs.size && iGoodsReceipts < iPurchaseOrdered) {
                sNextActionText = "Post Goods Receipt";
                sNextRoute = "RoutePOHistory";
            } else if (!bProductionCompleted) {
                sNextActionText = "Continue Production";
                sNextRoute = "RouteProductionOrderHistory";
            } else {
                sNextActionText = "Batch Completed";
                sNextRoute = "RouteProductionOrderHistory";
            }

            this._nextRoute = sNextRoute;
            this.getOwnerComponent().setModel(new JSONModel({
                batchId: sBatchId,
                batchCode: oBatch.code
            }), "selectedForecastBatch");
            oViewModel.setData(Object.assign({}, oViewModel.getData(), {
                selectedBatchId: sBatchId,
                batchCode: oBatch.code,
                batchId: sBatchId,
                plant: oBatch.plant || "-",
                requirementDate: oBatch.requirementDate || "-",
                status: iProgress === 100 ? "COMPLETED" : "IN PROGRESS",
                statusState: iProgress === 100 ? "Success" : "Warning",
                progress: iProgress,
                forecastCount: aPIRs.length,
                forecastCompleted: iForecastCompleted,
                mrpStatus: oLatestRun.RunStatus || "Not Run",
                purchaseCount: aPRItems.length,
                purchaseOrdered: iPurchaseOrdered,
                purchaseOrderCount: oUniquePOs.size,
                goodsReceiptCount: iGoodsReceipts,
                productionCount: aPlannedItems.length,
                productionCreated: iProductionCreated,
                productionCompleted: iProductionCompleted,
                nextActionText: sNextActionText,
                latestMessage: oLatestRun.RunMessage || ""
            }));
        },

        onBatchChange: function () {
            const sBatchId = this.getView().getModel("batchOverview").getProperty("/selectedBatchId");
            if (sBatchId) {
                this.getOwnerComponent().getRouter().navTo("RouteForecastBatchOverview", {
                    batchId: encodeURIComponent(sBatchId)
                }, true);
            }
        },

        onContinue: function () {
            this.getOwnerComponent().getRouter().navTo(this._nextRoute || "RoutePIRPlanning");
        },

        onOpenForecasts: function () {
            this.getOwnerComponent().getRouter().navTo("RoutePIRPlanning");
        },

        onOpenMRPResults: function () {
            this.getOwnerComponent().getRouter().navTo("RouteMRPResults");
        },

        onOpenPurchaseOrders: function () {
            this.getOwnerComponent().getRouter().navTo("RoutePOHistory");
        },

        onOpenProduction: function () {
            this.getOwnerComponent().getRouter().navTo("RouteProductionOrderHistory");
        },

        onRefresh: function () {
            this._loadOverview(
                this.getView().getModel("batchOverview").getProperty("/selectedBatchId") || "latest"
            );
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
