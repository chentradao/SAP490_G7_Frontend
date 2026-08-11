sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/ui/core/Fragment"
], function (Controller, History, Filter, FilterOperator, JSONModel, MessageBox, Fragment) {
    "use strict";

    return Controller.extend("sap490g7fioriapp.controller.ProductionOrderHistory", {
        onInit: function () {
            this.getView().setModel(new JSONModel({
                version: 0,
                confirmedOrders: {}
            }), "confirmationState");

            this.getOwnerComponent().getRouter().getRoute("RouteProductionOrderHistory")
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
                MessageBox.warning("Only STAFF or ADMIN can access Production Order History.");
                this.getOwnerComponent().getRouter().navTo("RouteLogin", {}, true);
                return;
            }

            this.onClearFilters();
            this.onRefresh();
        },

        onSearch: function (oEvent) {
            const sQuery = (oEvent.getParameter("query") || oEvent.getParameter("newValue") || "").trim();
            this._applyFilters(sQuery);
        },

        onStatusChange: function () {
            const oSearch = this.byId("productionHistorySearch");
            this._applyFilters(oSearch ? oSearch.getValue().trim() : "");
        },

        _applyFilters: function (sQuery) {
            const oBinding = this.byId("productionHistoryTable").getBinding("items");
            if (!oBinding) {
                return;
            }

            const aFilters = [];
            const sStatus = this.byId("productionStatusFilter").getSelectedKey();

            if (sStatus === "ACTIVE") {
                aFilters.push(new Filter({
                    filters: [
                        new Filter("status", FilterOperator.EQ, "PENDING"),
                        new Filter("status", FilterOperator.EQ, "CREATED"),
                        new Filter("status", FilterOperator.EQ, "RELEASED"),
                        new Filter("status", FilterOperator.EQ, "GOODS_ISSUED"),
                        new Filter("status", FilterOperator.EQ, "GOODS_RECEIVED")
                    ],
                    and: false
                }));
            } else if (sStatus !== "ALL") {
                aFilters.push(new Filter("status", FilterOperator.EQ, sStatus));
            }

            if (sQuery) {
                aFilters.push(new Filter({
                    filters: [
                        new Filter("production_order", FilterOperator.Contains, sQuery),
                        new Filter("material_document", FilterOperator.Contains, sQuery),
                        new Filter("material", FilterOperator.Contains, sQuery),
                        new Filter("request_id", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                }));
            }

            oBinding.filter(aFilters.length ? new Filter({ filters: aFilters, and: true }) : []);
        },

        onClearFilters: function () {
            const oSearch = this.byId("productionHistorySearch");
            const oStatus = this.byId("productionStatusFilter");
            if (oSearch) {
                oSearch.setValue("");
            }
            if (oStatus) {
                oStatus.setSelectedKey("ALL");
            }
            this._applyFilters("");
        },

        onRefresh: function () {
            const oTable = this.byId("productionHistoryTable");
            const oBinding = oTable && oTable.getBinding("items");
            if (oBinding) {
                oBinding.refresh();
            }
            this.onRefreshConfirmations();
        },

        onRefreshConfirmations: function () {
            const oTable = this.byId("productionConfirmationHistoryTable");
            const oBinding = oTable && oTable.getBinding("items");
            if (oBinding) {
                oBinding.refresh();
            }
            this._loadConfirmedOrders();
        },

        _loadConfirmedOrders: async function () {
            try {
                const oBinding = this.getOwnerComponent().getModel().bindList(
                    "/ProductionConfirmationHistory",
                    undefined,
                    undefined,
                    [
                        new Filter("confirmation_status", FilterOperator.EQ, "CONFIRMED")
                    ],
                    {
                        $$groupId: "$direct",
                        $select: "production_order,operation,confirmation_status,final_confirmation"
                    }
                );
                const aContexts = await oBinding.requestContexts(0, 1000);
                const mConfirmedOrders = {};

                aContexts.forEach(function (oContext) {
                    const oConfirmation = oContext.getObject();
                    const sOperation = String(oConfirmation.operation || "").padStart(4, "0");
                    const sOrder = String(oConfirmation.production_order || "");
                    if (sOrder && sOperation === "0010") {
                        mConfirmedOrders[sOrder] = true;
                    }
                });

                const oState = this.getView().getModel("confirmationState");
                oState.setProperty("/confirmedOrders", mConfirmedOrders);
                oState.setProperty("/version", Number(oState.getProperty("/version") || 0) + 1);
            } catch (oError) {
                // Keep the worklist usable if confirmation history cannot be refreshed.
            }
        },

        _isOperation0010Confirmed: function (sProductionOrder) {
            const oState = this.getView().getModel("confirmationState");
            const mOrders = oState ? oState.getProperty("/confirmedOrders") || {} : {};
            return Boolean(mOrders[String(sProductionOrder || "")]);
        },

        onConfirmOperation: async function (oEvent) {
            this._confirmationContext = oEvent.getSource().getBindingContext();

            const sSelectedOrder = this._confirmationContext.getProperty("production_order") || "";
            if (this._isOperation0010Confirmed(sSelectedOrder)) {
                MessageBox.information(
                    "Operation 0010 of Production Order " + sSelectedOrder + " has already been confirmed."
                );
                return;
            }

            if (!this._confirmationDialog) {
                this._confirmationDialog = await Fragment.load({
                    id: this.getView().getId(),
                    name: "sap490g7fioriapp.fragment.ProductionOperationConfirmation",
                    controller: this
                });
                this.getView().addDependent(this._confirmationDialog);
            }

            const sOrder = this._confirmationContext.getProperty("production_order") || "";
            const sQuantity = this._confirmationContext.getProperty("order_quantity") || "1";
            const sUnit = this._confirmationContext.getProperty("unit") || "EA";

            this.byId("confirmationOrderIdentifier").setTitle("Production Order " + sOrder);
            this.byId("confirmationOrderIdentifier").setText(
                this._confirmationContext.getProperty("material") || ""
            );
            this.byId("confirmationOperationInput").setValue("0010");
            this.byId("confirmationYieldInput").setValue(sQuantity);
            this.byId("confirmationScrapInput").setValue("0");
            this.byId("confirmationUnitInput").setValue(sUnit);
            this.byId("confirmationFinalCheckBox").setSelected(true);
            this._confirmationDialog.open();
        },

        onCloseOperationConfirmation: function () {
            if (this._confirmationDialog) {
                this._confirmationDialog.close();
            }
        },

        onSubmitOperationConfirmation: async function () {
            const oContext = this._confirmationContext;
            if (!oContext) {
                MessageBox.error("Production Order context is missing.");
                return;
            }

            const sOperation = "0010";
            const sYield = this.byId("confirmationYieldInput").getValue().trim();
            const sScrap = this.byId("confirmationScrapInput").getValue().trim() || "0";
            const sUnit = this.byId("confirmationUnitInput").getValue().trim().toUpperCase();
            const bFinal = this.byId("confirmationFinalCheckBox").getSelected();
            const nYield = Number(sYield);
            const nScrap = Number(sScrap);

            if (!sOperation) {
                MessageBox.error("Select an Operation.");
                return;
            }
            if (!Number.isFinite(nYield) || !Number.isFinite(nScrap) || nYield < 0 || nScrap < 0) {
                MessageBox.error("Yield and Scrap must be valid non-negative numbers.");
                return;
            }
            if (nYield === 0 && nScrap === 0) {
                MessageBox.error("Yield Quantity or Scrap Quantity is required.");
                return;
            }
            if (!sUnit) {
                MessageBox.error("Unit is required.");
                return;
            }

            const sOrder = oContext.getProperty("production_order") || "";
            const bConfirmed = await new Promise(function (resolve) {
                MessageBox.confirm(
                    "Confirm Operation " + sOperation + " for Production Order " + sOrder + "?",
                    {
                        title: bFinal ? "Final Confirmation" : "Partial Confirmation",
                        emphasizedAction: MessageBox.Action.OK,
                        onClose: function (sAction) {
                            resolve(sAction === MessageBox.Action.OK);
                        }
                    }
                );
            });

            if (!bConfirmed) {
                return;
            }

            const oSubmitButton = this.byId("submitProductionConfirmationButton");
            oSubmitButton.setBusy(true);

            try {
                const oAction = this.getOwnerComponent().getModel().bindContext(
                    "com.sap.gateway.srvd.zsd_g7_canteen.v0001.ConfirmProductionOperation(...)",
                    oContext
                );
                oAction.setParameter("operation", sOperation);
                oAction.setParameter("yield_quantity", sYield);
                oAction.setParameter("scrap_quantity", sScrap);
                oAction.setParameter("unit", sUnit);
                oAction.setParameter("final_confirmation", bFinal ? "X" : "");
                await oAction.execute("$direct");

                this._confirmationDialog.close();
                oContext.refresh();
                this.onRefreshConfirmations();
                MessageBox.success(
                    "Operation " + sOperation + " of Production Order " + sOrder +
                    " was confirmed successfully."
                );
            } catch (oError) {
                MessageBox.error(oError.message || "Could not confirm the Production Operation.");
            } finally {
                oSubmitButton.setBusy(false);
            }
        },

        onRelease: async function (oEvent) {
            const oContext = oEvent.getSource().getBindingContext();
            const sProductionOrder = oContext.getProperty("production_order") || "";

            try {
                const oAction = this.getOwnerComponent().getModel().bindContext(
                    "com.sap.gateway.srvd.zsd_g7_canteen.v0001.ReleaseProductionOrder(...)",
                    oContext
                );
                await oAction.execute("$direct");
                oContext.refresh();
                MessageBox.success("Production Order " + sProductionOrder + " was released successfully.");
                this.onRefresh();
            } catch (oError) {
                MessageBox.error(oError.message || "Could not release the Production Order.");
            }
        },

        onPostGoodsIssue: async function (oEvent) {
            const oButton = oEvent.getSource();
            const oContext = oButton.getBindingContext();
            const sProductionOrder = oContext.getProperty("production_order") || "";
            const sRequestId = oContext.getProperty("request_id") || "";

            const bConfirmed = await new Promise(function (resolve) {
                MessageBox.confirm(
                    "Post movement type 261 for all remaining components of Production Order " +
                    sProductionOrder + " from storage location RM01?",
                    {
                        title: "Confirm Production Goods Issue",
                        emphasizedAction: MessageBox.Action.OK,
                        onClose: function (sAction) {
                            resolve(sAction === MessageBox.Action.OK);
                        }
                    }
                );
            });

            if (!bConfirmed) {
                return;
            }

            oButton.setBusy(true);

            try {
                const oModel = this.getOwnerComponent().getModel();
                const oAction = oModel.bindContext(
                    "com.sap.gateway.srvd.zsd_g7_canteen.v0001.PostProductionGoodsIssue(...)",
                    oContext
                );
                await oAction.execute("$direct");

                const oPollBinding = oModel.bindList(
                    "/ProductionOrderRequests",
                    undefined,
                    undefined,
                    [new Filter("request_id", FilterOperator.EQ, sRequestId)],
                    {
                        $$groupId: "$direct",
                        $select: "request_id,status,material_document,material_document_year,goods_issue_status,goods_issue_message,goods_issued_at"
                    }
                );

                let sMaterialDocument = "";
                let sDocumentYear = "";
                let sGoodsIssueStatus = "";
                let sGoodsIssueMessage = "";

                for (let iAttempt = 0; iAttempt < 5; iAttempt += 1) {
                    await new Promise(function (resolve) {
                        setTimeout(resolve, 1000);
                    });

                    oPollBinding.refresh();
                    const aContexts = await oPollBinding.requestContexts(0, 1);

                    if (aContexts.length > 0) {
                        sMaterialDocument = aContexts[0].getProperty("material_document") || "";
                        sDocumentYear = aContexts[0].getProperty("material_document_year") || "";
                        sGoodsIssueStatus = aContexts[0].getProperty("goods_issue_status") || "";
                        sGoodsIssueMessage = aContexts[0].getProperty("goods_issue_message") || "";
                    }

                    if (sMaterialDocument || sGoodsIssueStatus === "ERROR") {
                        break;
                    }
                }

                this.onRefresh();

                if (sMaterialDocument) {
                    MessageBox.success(
                        "Production Goods Issue posted successfully.\n\n" +
                        "Material Document: " + sMaterialDocument +
                        (sDocumentYear ? "\nDocument Year: " + sDocumentYear : "")
                    );
                } else {
                    MessageBox.error(
                        sGoodsIssueMessage ||
                        "SAP did not return a Material Document. Check the Production Order components."
                    );
                }
            } catch (oError) {
                MessageBox.error(oError.message || "Could not post the Production Goods Issue.");
            } finally {
                oButton.setBusy(false);
            }
        },

        onPostProductionGoodsReceipt: async function (oEvent) {
            const oButton = oEvent.getSource();
            const oContext = oButton.getBindingContext();
            const sProductionOrder = oContext.getProperty("production_order") || "";
            const sRequestId = oContext.getProperty("request_id") || "";
            const sMaterial = oContext.getProperty("material") || "";
            const sQuantity = oContext.getProperty("order_quantity") || "";
            const sUnit = oContext.getProperty("unit") || "";

            const bConfirmed = await new Promise(function (resolve) {
                MessageBox.confirm(
                    "Post movement type 101 for Production Order " + sProductionOrder + "?\n\n" +
                    "Finished Material: " + sMaterial + "\n" +
                    "Quantity: " + sQuantity + " " + sUnit + "\n" +
                    "Receiving Storage Location: FG01",
                    {
                        title: "Confirm Production Goods Receipt",
                        emphasizedAction: MessageBox.Action.OK,
                        onClose: function (sAction) {
                            resolve(sAction === MessageBox.Action.OK);
                        }
                    }
                );
            });

            if (!bConfirmed) {
                return;
            }

            oButton.setBusy(true);

            try {
                const oModel = this.getOwnerComponent().getModel();
                const oAction = oModel.bindContext(
                    "com.sap.gateway.srvd.zsd_g7_canteen.v0001.PostProductionGoodsReceipt(...)",
                    oContext
                );
                await oAction.execute("$direct");

                const oPollBinding = oModel.bindList(
                    "/ProductionOrderRequests",
                    undefined,
                    undefined,
                    [new Filter("request_id", FilterOperator.EQ, sRequestId)],
                    {
                        $$groupId: "$direct",
                        $select: "request_id,status,gr_material_document,gr_material_document_year,goods_receipt_status,goods_receipt_message,goods_received_at"
                    }
                );

                let sMaterialDocument = "";
                let sDocumentYear = "";
                let sReceiptStatus = "";
                let sReceiptMessage = "";

                for (let iAttempt = 0; iAttempt < 5; iAttempt += 1) {
                    await new Promise(function (resolve) {
                        setTimeout(resolve, 1000);
                    });

                    oPollBinding.refresh();
                    const aContexts = await oPollBinding.requestContexts(0, 1);
                    if (aContexts.length > 0) {
                        sMaterialDocument = aContexts[0].getProperty("gr_material_document") || "";
                        sDocumentYear = aContexts[0].getProperty("gr_material_document_year") || "";
                        sReceiptStatus = aContexts[0].getProperty("goods_receipt_status") || "";
                        sReceiptMessage = aContexts[0].getProperty("goods_receipt_message") || "";
                    }

                    if (sMaterialDocument || sReceiptStatus === "ERROR") {
                        break;
                    }
                }

                this.onRefresh();

                if (sMaterialDocument) {
                    MessageBox.success(
                        "Production Goods Receipt posted successfully.\n\n" +
                        "Material Document: " + sMaterialDocument +
                        (sDocumentYear ? "\nDocument Year: " + sDocumentYear : "") +
                        "\nFinished Goods Storage: FG01"
                    );
                } else {
                    MessageBox.error(
                        sReceiptMessage ||
                        "SAP did not return a Production Goods Receipt Material Document."
                    );
                }
            } catch (oError) {
                MessageBox.error(oError.message || "Could not post the Production Goods Receipt.");
            } finally {
                oButton.setBusy(false);
            }
        },

        onCompleteProductionOrder: async function (oEvent) {
            const oButton = oEvent.getSource();
            const oContext = oButton.getBindingContext();
            const sProductionOrder = oContext.getProperty("production_order") || "";
            const sRequestId = oContext.getProperty("request_id") || "";

            const bConfirmed = await new Promise(function (resolve) {
                MessageBox.confirm(
                    "Technically complete Production Order " + sProductionOrder + "?\n\n" +
                    "After TECO, this order will be treated as completed in the staff workflow.",
                    {
                        title: "Complete Production Order",
                        emphasizedAction: MessageBox.Action.OK,
                        onClose: function (sAction) {
                            resolve(sAction === MessageBox.Action.OK);
                        }
                    }
                );
            });

            if (!bConfirmed) {
                return;
            }

            oButton.setBusy(true);

            try {
                const oModel = this.getOwnerComponent().getModel();
                const oAction = oModel.bindContext(
                    "com.sap.gateway.srvd.zsd_g7_canteen.v0001.CompleteProductionOrder(...)",
                    oContext
                );
                await oAction.execute("$direct");

                const oPollBinding = oModel.bindList(
                    "/ProductionOrderRequests",
                    undefined,
                    undefined,
                    [new Filter("request_id", FilterOperator.EQ, sRequestId)],
                    {
                        $$groupId: "$direct",
                        $select: "request_id,status,bapi_message,production_order"
                    }
                );

                let sStatus = "";
                let sMessage = "";

                for (let iAttempt = 0; iAttempt < 5; iAttempt += 1) {
                    await new Promise(function (resolve) {
                        setTimeout(resolve, 1000);
                    });
                    oPollBinding.refresh();
                    const aContexts = await oPollBinding.requestContexts(0, 1);
                    if (aContexts.length > 0) {
                        sStatus = String(aContexts[0].getProperty("status") || "").toUpperCase();
                        sMessage = aContexts[0].getProperty("bapi_message") || "";
                    }
                    if (sStatus === "COMPLETED" || sStatus === "ERROR") {
                        break;
                    }
                }

                this.onRefresh();

                if (sStatus === "COMPLETED") {
                    MessageBox.success(
                        "Production Order " + sProductionOrder + " was technically completed successfully." +
                        (sMessage ? "\n\n" + sMessage : "")
                    );
                } else {
                    MessageBox.error(sMessage || "SAP did not return the COMPLETED status.");
                }
            } catch (oError) {
                MessageBox.error(oError.message || "Could not technically complete the Production Order.");
            } finally {
                oButton.setBusy(false);
            }
        },

        canRelease: function (sProductionOrder, sStatus) {
            const sNormalizedStatus = String(sStatus || "").toUpperCase();
            return Boolean(sProductionOrder) &&
                (sNormalizedStatus === "CREATED" || sNormalizedStatus === "PENDING");
        },

        canPostGoodsIssue: function (sProductionOrder, sStatus, sGoodsIssueStatus, sMaterialDocument) {
            return Boolean(sProductionOrder) &&
                String(sStatus || "").toUpperCase() === "RELEASED" &&
                String(sGoodsIssueStatus || "").toUpperCase() !== "POSTED" &&
                !sMaterialDocument;
        },

        canConfirmOperation: function (sProductionOrder, sStatus, sGoodsIssueStatus) {
            const sValue = String(sStatus || "").toUpperCase();
            return Boolean(sProductionOrder) &&
                sValue === "GOODS_ISSUED" &&
                String(sGoodsIssueStatus || "").toUpperCase() === "POSTED" &&
                !this._isOperation0010Confirmed(sProductionOrder);
        },

        canPostProductionGoodsReceipt: function (sProductionOrder, sStatus, sGoodsIssueStatus, sMaterialDocument, sReceiptStatus) {
            const sOrderStatus = String(sStatus || "").toUpperCase();
            return Boolean(sProductionOrder) &&
                (sOrderStatus === "GOODS_ISSUED" || sOrderStatus === "RELEASED") &&
                String(sGoodsIssueStatus || "").toUpperCase() === "POSTED" &&
                this._isOperation0010Confirmed(sProductionOrder) &&
                String(sReceiptStatus || "").toUpperCase() !== "POSTED" &&
                !sMaterialDocument;
        },

        canCompleteProductionOrder: function (sProductionOrder, sStatus, sMaterialDocument, sReceiptStatus) {
            return Boolean(sProductionOrder) &&
                String(sStatus || "").toUpperCase() === "GOODS_RECEIVED" &&
                Boolean(sMaterialDocument) &&
                String(sReceiptStatus || "").toUpperCase() === "POSTED";
        },

        formatNextStep: function (sProductionOrder, sStatus, sGoodsIssueStatus, sGoodsReceiptStatus) {
            const sValue = String(sStatus || "").toUpperCase();
            if (!sProductionOrder) { return "Create Production Order"; }
            if (sValue === "PENDING" || sValue === "CREATED") { return "1. Release Order"; }
            if (sValue === "RELEASED" && String(sGoodsIssueStatus || "").toUpperCase() !== "POSTED") {
                return "2. Post Goods Issue";
            }
            if ((sValue === "RELEASED" || sValue === "GOODS_ISSUED") &&
                String(sGoodsIssueStatus || "").toUpperCase() === "POSTED") {
                return this._isOperation0010Confirmed(sProductionOrder)
                    ? "4. Post Goods Receipt"
                    : "3. Confirm Operation 0010";
            }
            if (sValue === "GOODS_RECEIVED" || String(sGoodsReceiptStatus || "").toUpperCase() === "POSTED") {
                return "5. Complete Order";
            }
            if (sValue === "COMPLETED") { return "Completed"; }
            if (sValue.includes("ERROR")) { return "Resolve SAP Error"; }
            return "Review Order";
        },

        formatNextStepState: function (sProductionOrder, sStatus) {
            const sValue = String(sStatus || "").toUpperCase();
            if (sValue === "COMPLETED") { return "Success"; }
            if (sValue.includes("ERROR")) { return "Error"; }
            return sProductionOrder ? "Information" : "Warning";
        },

        formatConfirmationType: function (sFinalConfirmation) {
            return String(sFinalConfirmation || "").toUpperCase() === "X" ? "Final" : "Partial";
        },

        formatProductionSource: function (sPlannedOrder) {
            return sPlannedOrder ? "From MRP" : "Manual";
        },

        formatConfirmationState: function (sStatus) {
            const sValue = String(sStatus || "").toUpperCase();
            if (sValue === "CONFIRMED" || sValue === "SUCCESS") {
                return "Success";
            }
            if (sValue === "ERROR") {
                return "Error";
            }
            return "Warning";
        },

        formatState: function (sStatus) {
            const sValue = String(sStatus || "").toUpperCase();
            if (sValue === "CREATED" || sValue === "RELEASED" || sValue === "GOODS_ISSUED" ||
                sValue === "GOODS_RECEIVED" || sValue === "COMPLETED" || sValue === "SUCCESS") {
                return "Success";
            }
            if (sValue === "ERROR") {
                return "Error";
            }
            return "Warning";
        },

        formatGoodsIssueState: function (sStatus) {
            const sValue = String(sStatus || "").toUpperCase();
            if (sValue === "POSTED") {
                return "Success";
            }
            if (sValue === "ERROR") {
                return "Error";
            }
            return "None";
        },

        formatGoodsReceiptState: function (sStatus) {
            const sValue = String(sStatus || "").toUpperCase();
            if (sValue === "POSTED") {
                return "Success";
            }
            if (sValue === "ERROR") {
                return "Error";
            }
            return "None";
        },

        formatHighlight: function (sStatus) {
            return this.formatState(sStatus);
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
            this.getOwnerComponent().getRouter().navTo("RouteProductionOrder", {}, true);
        }
    });
});
