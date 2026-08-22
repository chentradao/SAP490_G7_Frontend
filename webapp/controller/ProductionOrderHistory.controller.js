/*
 * Controller ProductionOrderHistory.controller: điều phối trạng thái, sự kiện giao diện và các lời gọi backend của màn hình.
 * Các hàm on... là event handler; các hàm bắt đầu bằng _ là helper chỉ dùng nội bộ controller.
 */
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/Sorter",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/ui/core/Fragment",
    "sap/m/GroupHeaderListItem"
], function (Controller, History, Filter, FilterOperator, Sorter, JSONModel, MessageBox, Fragment, GroupHeaderListItem) {
    "use strict";

    return Controller.extend("sap490g7fioriapp.controller.ProductionOrderHistory", {
        /** Khởi tạo model trạng thái và đăng ký các sự kiện điều hướng của màn hình. */
        onInit: function () {
            this.getView().setModel(new JSONModel({
                version: 0,
                confirmedOrders: {}
            }), "confirmationState");

            this.getOwnerComponent().getRouter().getRoute("RouteProductionOrderHistory")
                .attachPatternMatched(this._onRouteMatched, this);
        },

        /** Kiểm tra quyền truy cập và chuẩn bị dữ liệu mỗi khi route được mở. */
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
            this._applyBatchGrouping();
            this.onRefresh();
        },

        _applyBatchGrouping: function () {
            const oBinding = this.byId("productionHistoryTable").getBinding("items");
            if (!oBinding) {
                return;
            }

            oBinding.sort([
                new Sorter("batch_id", true, function (oContext) {
                    const vBatchId = oContext.getProperty("batch_id");
                    const sBatchId = String(vBatchId || "");
                    return {
                        key: sBatchId,
                        text: sBatchId
                    };
                }),
                new Sorter("created_at", true)
            ]);
        },

        /** Xử lý sự kiện Search từ giao diện người dùng. */
        onSearch: function (oEvent) {
            const sQuery = (oEvent.getParameter("query") || oEvent.getParameter("newValue") || "").trim();
            this._applyFilters(sQuery);
        },

        /** Xử lý sự kiện Status Change từ giao diện người dùng. */
        onStatusChange: function () {
            const oSearch = this.byId("productionHistorySearch");
            this._applyFilters(oSearch ? oSearch.getValue().trim() : "");
        },

        createProductionBatchHeader: function (oGroup) {
            const sBatchId = String(
                oGroup && (oGroup.key || oGroup.text || oGroup.value) || ""
            );
            const sTitle = sBatchId
                ? "FORECAST-" + sBatchId.replace(/-/g, "").slice(0, 8).toUpperCase()
                : "LEGACY / MANUAL · NO BATCH";

            return new GroupHeaderListItem({
                title: sTitle,
                description: sBatchId ? "Batch ID: " + sBatchId : "Historical records without Forecast Batch tracking",
                upperCase: false
            });
        },

        /** Hàm nội bộ thực hiện apply Filters. */
        _applyFilters: function (sQuery) {
            const oBinding = this.byId("productionHistoryTable").getBinding("items");
            if (!oBinding) {
                return;
            }

            const aFilters = [
                new Filter("material", FilterOperator.GE, "FG00009")
            ];
            const sStatus = this.byId("productionStatusFilter").getSelectedKey();

            if (sStatus === "ACTIVE") {
                aFilters.push(new Filter({
                    filters: [
                        new Filter("status", FilterOperator.EQ, "PENDING"),
                        new Filter("status", FilterOperator.EQ, "CREATED"),
                        new Filter("status", FilterOperator.EQ, "RELEASED"),
                        new Filter("status", FilterOperator.EQ, "GOODS_ISSUED"),
                        new Filter("status", FilterOperator.EQ, "GOODS_RECEIVED"),
                        new Filter("status", FilterOperator.Contains, "ERROR")
                    ],
                    and: false
                }));
            } else if (sStatus !== "ALL") {
                aFilters.push(new Filter("status", FilterOperator.EQ, sStatus));
            }

            if (sQuery) {
                aFilters.push(new Filter({
                    filters: [
                        new Filter("production_order", FilterOperator.EQ, sQuery),
                        new Filter("material_document", FilterOperator.EQ, sQuery),
                        new Filter("material", FilterOperator.EQ, sQuery.toUpperCase()),
                        new Filter("request_id", FilterOperator.EQ, sQuery),
                        new Filter("batch_id", FilterOperator.EQ, sQuery.replace(/-/g, ""))
                    ],
                    and: false
                }));
            }

            oBinding.filter(aFilters.length ? new Filter({ filters: aFilters, and: true }) : []);
        },

        /** Xử lý sự kiện Clear Filters từ giao diện người dùng. */
        onClearFilters: function () {
            const oSearch = this.byId("productionHistorySearch");
            const oStatus = this.byId("productionStatusFilter");
            if (oSearch) {
                oSearch.setValue("");
            }
            if (oStatus) {
                oStatus.setSelectedKey("ACTIVE");
            }
            this._applyFilters("");
        },

        /** Xử lý sự kiện Open Production Details từ giao diện người dùng. */
        onOpenProductionDetails: function (oEvent) {
            const oContext = oEvent.getSource().getBindingContext();
            const oDialog = this.byId("productionDetailsDialog");
            if (oContext && oDialog) {
                oDialog.setBindingContext(oContext);
                oDialog.open();
            }
        },

        /** Xử lý sự kiện Close Production Details từ giao diện người dùng. */
        onCloseProductionDetails: function () {
            const oDialog = this.byId("productionDetailsDialog");
            if (oDialog) {
                oDialog.close();
            }
        },

        /** Tải lại dữ liệu mới nhất cho các binding đang hiển thị. */
        onRefresh: function () {
            const oTable = this.byId("productionHistoryTable");
            const oBinding = oTable && oTable.getBinding("items");
            if (oBinding) {
                oBinding.refresh();
            }
            this.onRefreshConfirmations();
        },

        /** Xử lý sự kiện Refresh Confirmations từ giao diện người dùng. */
        onRefreshConfirmations: function () {
            const oTable = this.byId("productionConfirmationHistoryTable");
            const oBinding = oTable && oTable.getBinding("items");
            if (oBinding) {
                oBinding.refresh();
            }
            this._loadConfirmedOrders();
        },

        /** Tải Confirmed Orders từ nguồn dữ liệu và cập nhật trạng thái màn hình. */
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

        /** Kiểm tra điều kiện Operation0010 Confirmed. */
        _isOperation0010Confirmed: function (sProductionOrder) {
            const oState = this.getView().getModel("confirmationState");
            const mOrders = oState ? oState.getProperty("/confirmedOrders") || {} : {};
            return Boolean(mOrders[String(sProductionOrder || "")]);
        },

        /** Xử lý sự kiện Confirm Operation từ giao diện người dùng. */
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

        /** Xử lý sự kiện Close Operation Confirmation từ giao diện người dùng. */
        onCloseOperationConfirmation: function () {
            if (this._confirmationDialog) {
                this._confirmationDialog.close();
            }
        },

        /** Xử lý sự kiện Submit Operation Confirmation từ giao diện người dùng. */
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
                const oState = this.getView().getModel("confirmationState");
                const mConfirmedOrders = Object.assign(
                    {},
                    oState.getProperty("/confirmedOrders") || {}
                );
                mConfirmedOrders[String(sOrder)] = true;
                oState.setProperty("/confirmedOrders", mConfirmedOrders);
                oState.setProperty("/version", Number(oState.getProperty("/version") || 0) + 1);
                await oContext.refresh();
                await this.onRefreshConfirmations();
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

        /** Xử lý sự kiện Release từ giao diện người dùng. */
        onRelease: async function (oEvent) {
            const oButton = oEvent.getSource();
            const oContext = oButton.getBindingContext();

            if (!oContext) {
                MessageBox.error("Production Order context is missing.");
                return;
            }

            const sProductionOrder = oContext.getProperty("production_order") || "";
            const sRequestId = oContext.getProperty("request_id") || "";

            if (!sProductionOrder || !sRequestId) {
                MessageBox.error("Production Order or Request ID is missing.");
                return;
            }

            const bConfirmed = await new Promise(function (resolve) {
                MessageBox.confirm(
                    "Release Production Order " + sProductionOrder + "?",
                    {
                        title: "Release Production Order",
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
                    "com.sap.gateway.srvd.zsd_g7_canteen.v0001.ReleaseProductionOrder(...)",
                    oContext
                );
                await oAction.execute("$direct");

                // Đọc lại bản ghi theo Request ID để không phụ thuộc vào row context
                // đang được table cache sau khi action vừa hoàn tất.
                const oPollBinding = oModel.bindList(
                    "/ProductionOrderRequests",
                    undefined,
                    undefined,
                    [new Filter("request_id", FilterOperator.EQ, sRequestId)],
                    {
                        $$groupId: "$direct",
                        $select: "request_id,production_order,status,bapi_message"
                    }
                );

                let sStatus = "";
                let sMessage = "";

                for (let iAttempt = 0; iAttempt < 8; iAttempt += 1) {
                    await new Promise(function (resolve) {
                        setTimeout(resolve, 750);
                    });

                    oPollBinding.refresh();
                    const aContexts = await oPollBinding.requestContexts(0, 1);

                    if (aContexts.length > 0) {
                        sStatus = String(aContexts[0].getProperty("status") || "")
                            .trim()
                            .toUpperCase();
                        sMessage = aContexts[0].getProperty("bapi_message") || "";
                    }

                    if (sStatus === "RELEASED" || sStatus.includes("ERROR")) {
                        break;
                    }
                }

                this.onRefresh();

                if (sStatus === "RELEASED") {
                    MessageBox.success(
                        "Production Order " + sProductionOrder + " was released successfully." +
                        (sMessage ? "\n\n" + sMessage : "")
                    );
                } else {
                    MessageBox.error(
                        sMessage ||
                        "SAP did not return the RELEASED status. Check whether the Production Order is locked."
                    );
                }
            } catch (oError) {
                MessageBox.error(oError.message || "Could not release the Production Order.");
            } finally {
                oButton.setBusy(false);
            }
        },

        /** Xử lý sự kiện Post Goods Issue từ giao diện người dùng. */
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

        /** Xử lý sự kiện Post Production Goods Receipt từ giao diện người dùng. */
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

        /** Xử lý sự kiện Complete Production Order từ giao diện người dùng. */
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

        /** Thực hiện xử lý can Release. */
        canRelease: function (sProductionOrder, sStatus, sMessage) {
            const sNormalizedStatus = String(sStatus || "").trim().toUpperCase();
            const sNormalizedMessage = String(sMessage || "").trim().toUpperCase();
            return Boolean(sProductionOrder) &&
                (sNormalizedStatus === "CREATED" || sNormalizedStatus === "PENDING") &&
                !sNormalizedMessage.includes("ALREADY RELEASED");
        },

        /** Thực hiện xử lý can Post Goods Issue. */
        canPostGoodsIssue: function (sProductionOrder, sStatus, sGoodsIssueStatus, sMaterialDocument) {
            return Boolean(sProductionOrder) &&
                String(sStatus || "").trim().toUpperCase() === "RELEASED" &&
                String(sGoodsIssueStatus || "").trim().toUpperCase() !== "POSTED" &&
                !sMaterialDocument;
        },

        /** Thực hiện xử lý can Confirm Operation. */
        canConfirmOperation: function (sProductionOrder, sStatus, sGoodsIssueStatus) {
            const sValue = String(sStatus || "").trim().toUpperCase();
            return Boolean(sProductionOrder) &&
                sValue === "GOODS_ISSUED" &&
                String(sGoodsIssueStatus || "").trim().toUpperCase() === "POSTED" &&
                !this._isOperation0010Confirmed(sProductionOrder);
        },

        /** Thực hiện xử lý can Post Production Goods Receipt. */
        canPostProductionGoodsReceipt: function (sProductionOrder, sStatus, sGoodsIssueStatus, sMaterialDocument, sReceiptStatus) {
            const sOrderStatus = String(sStatus || "").trim().toUpperCase();
            return Boolean(sProductionOrder) &&
                (sOrderStatus === "GOODS_ISSUED" || sOrderStatus === "RELEASED") &&
                String(sGoodsIssueStatus || "").toUpperCase() === "POSTED" &&
                this._isOperation0010Confirmed(sProductionOrder) &&
                String(sReceiptStatus || "").toUpperCase() !== "POSTED" &&
                !sMaterialDocument;
        },

        /** Thực hiện xử lý can Complete Production Order. */
        canCompleteProductionOrder: function (sProductionOrder, sStatus, sMaterialDocument, sReceiptStatus, sMessage) {
            const sNormalizedMessage = String(sMessage || "").toUpperCase();
            return Boolean(sProductionOrder) &&
                String(sStatus || "").toUpperCase() === "GOODS_RECEIVED" &&
                Boolean(sMaterialDocument) &&
                String(sReceiptStatus || "").toUpperCase() === "POSTED" &&
                !sNormalizedMessage.includes("TECHNICALLY COMPLETE");
        },

        /** Đọc và trả về Next Action phục vụ xử lý nội bộ. */
        _getNextAction: function (
            sProductionOrder,
            sStatus,
            sGoodsIssueStatus,
            sGoodsIssueDocument,
            sGoodsReceiptDocument,
            sGoodsReceiptStatus,
            sMessage
        ) {
            if (this.canRelease(sProductionOrder, sStatus, sMessage)) {
                return "RELEASE";
            }
            if (this.canPostGoodsIssue(sProductionOrder, sStatus, sGoodsIssueStatus, sGoodsIssueDocument)) {
                return "GI";
            }
            if (this.canConfirmOperation(sProductionOrder, sStatus, sGoodsIssueStatus)) {
                return "CONFIRM";
            }
            if (this.canPostProductionGoodsReceipt(
                sProductionOrder,
                sStatus,
                sGoodsIssueStatus,
                sGoodsReceiptDocument,
                sGoodsReceiptStatus
            )) {
                return "GR";
            }
            if (this.canCompleteProductionOrder(
                sProductionOrder,
                sStatus,
                sGoodsReceiptDocument,
                sGoodsReceiptStatus,
                sMessage
            )) {
                return "COMPLETE";
            }
            return "";
        },

        /** Thực hiện xử lý has Next Action. */
        hasNextAction: function () {
            return Boolean(this._getNextAction.apply(this, arguments));
        },

        /** Định dạng Next Action Text trước khi hiển thị trên giao diện. */
        formatNextActionText: function () {
            const mText = {
                RELEASE: "Release Order",
                GI: "Post Goods Issue",
                CONFIRM: "Confirm Operation",
                GR: "Post Goods Receipt",
                COMPLETE: "Complete Order"
            };
            return mText[this._getNextAction.apply(this, arguments)] || "";
        },

        /** Định dạng Next Action Icon trước khi hiển thị trên giao diện. */
        formatNextActionIcon: function () {
            const mIcon = {
                RELEASE: "sap-icon://play",
                GI: "sap-icon://outbox",
                CONFIRM: "sap-icon://complete",
                GR: "sap-icon://inbox",
                COMPLETE: "sap-icon://complete"
            };
            return mIcon[this._getNextAction.apply(this, arguments)] || "";
        },

        /** Xử lý sự kiện Execute Next Step từ giao diện người dùng. */
        onExecuteNextStep: function (oEvent) {
            const oContext = oEvent.getSource().getBindingContext();
            if (!oContext) {
                MessageBox.error("Production Order context is missing.");
                return;
            }

            const sAction = this._getNextAction(
                oContext.getProperty("production_order"),
                oContext.getProperty("status"),
                oContext.getProperty("goods_issue_status"),
                oContext.getProperty("material_document"),
                oContext.getProperty("gr_material_document"),
                oContext.getProperty("goods_receipt_status"),
                oContext.getProperty("bapi_message")
            );
            const mHandler = {
                RELEASE: this.onRelease,
                GI: this.onPostGoodsIssue,
                CONFIRM: this.onConfirmOperation,
                GR: this.onPostProductionGoodsReceipt,
                COMPLETE: this.onCompleteProductionOrder
            };

            if (mHandler[sAction]) {
                mHandler[sAction].call(this, oEvent);
            }
        },

        /** Định dạng Workflow Progress trước khi hiển thị trên giao diện. */
        formatWorkflowProgress: function (sProductionOrder, sStatus, sGoodsIssueStatus, sGoodsReceiptStatus) {
            const sOrderStatus = String(sStatus || "").trim().toUpperCase();
            const bReleased = Boolean(sProductionOrder) &&
                !["", "PENDING", "CREATED", "ERROR"].includes(sOrderStatus);
            const bGoodsIssued = String(sGoodsIssueStatus || "").trim().toUpperCase() === "POSTED" ||
                ["GOODS_ISSUED", "GOODS_RECEIVED", "COMPLETED"].includes(sOrderStatus);
            const bConfirmed = this._isOperation0010Confirmed(sProductionOrder);
            const bGoodsReceived = String(sGoodsReceiptStatus || "").trim().toUpperCase() === "POSTED" ||
                ["GOODS_RECEIVED", "COMPLETED"].includes(sOrderStatus);
            const bCompleted = sOrderStatus === "COMPLETED";
            const aSteps = [
                ["Release", bReleased],
                ["GI", bGoodsIssued],
                ["Confirm", bConfirmed],
                ["GR", bGoodsReceived],
                ["Complete", bCompleted]
            ];
            let bCurrentFound = false;

            return aSteps.map(function (aStep) {
                if (aStep[1]) {
                    return "✓ " + aStep[0];
                }
                if (!bCurrentFound) {
                    bCurrentFound = true;
                    return "→ " + aStep[0];
                }
                return "○ " + aStep[0];
            }).join("   ");
        },

        /** Định dạng Friendly Order Status trước khi hiển thị trên giao diện. */
        formatFriendlyOrderStatus: function (sStatus) {
            const sValue = String(sStatus || "").trim().toUpperCase();
            const mStatus = {
                PENDING: "Waiting for SAP",
                CREATED: "Created",
                RELEASED: "Released",
                GOODS_ISSUED: "Materials Issued",
                GOODS_RECEIVED: "Finished Goods Received",
                COMPLETED: "Completed",
                ERROR: "SAP Error"
            };
            return mStatus[sValue] || sStatus || "Unknown";
        },

        /** Định dạng Release Button Type trước khi hiển thị trên giao diện. */
        formatReleaseButtonType: function (sProductionOrder, sStatus, sMessage) {
            return this.canRelease(sProductionOrder, sStatus, sMessage) ? "Emphasized" : "Default";
        },

        /** Định dạng Goods Issue Button Type trước khi hiển thị trên giao diện. */
        formatGoodsIssueButtonType: function (sProductionOrder, sStatus, sGoodsIssueStatus, sMaterialDocument) {
            return this.canPostGoodsIssue(sProductionOrder, sStatus, sGoodsIssueStatus, sMaterialDocument)
                ? "Accept" : "Default";
        },

        /** Định dạng Confirmation Button Type trước khi hiển thị trên giao diện. */
        formatConfirmationButtonType: function (sProductionOrder, sStatus, sGoodsIssueStatus) {
            return this.canConfirmOperation(sProductionOrder, sStatus, sGoodsIssueStatus)
                ? "Emphasized" : "Default";
        },

        /** Định dạng Goods Receipt Button Type trước khi hiển thị trên giao diện. */
        formatGoodsReceiptButtonType: function (sProductionOrder, sStatus, sGoodsIssueStatus, sMaterialDocument, sReceiptStatus) {
            return this.canPostProductionGoodsReceipt(
                sProductionOrder,
                sStatus,
                sGoodsIssueStatus,
                sMaterialDocument,
                sReceiptStatus
            ) ? "Accept" : "Default";
        },

        /** Định dạng Complete Button Type trước khi hiển thị trên giao diện. */
        formatCompleteButtonType: function (sProductionOrder, sStatus, sMaterialDocument, sReceiptStatus, sMessage) {
            return this.canCompleteProductionOrder(
                sProductionOrder,
                sStatus,
                sMaterialDocument,
                sReceiptStatus,
                sMessage
            ) ? "Accept" : "Default";
        },

        /** Định dạng Next Step trước khi hiển thị trên giao diện. */
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

        /** Định dạng Next Step State trước khi hiển thị trên giao diện. */
        formatNextStepState: function (sProductionOrder, sStatus) {
            const sValue = String(sStatus || "").toUpperCase();
            if (sValue === "COMPLETED") { return "Success"; }
            if (sValue.includes("ERROR")) { return "Error"; }
            return sProductionOrder ? "Information" : "Warning";
        },

        /** Định dạng Confirmation Type trước khi hiển thị trên giao diện. */
        formatConfirmationType: function (sFinalConfirmation) {
            return String(sFinalConfirmation || "").toUpperCase() === "X" ? "Final" : "Partial";
        },

        /** Định dạng Production Source trước khi hiển thị trên giao diện. */
        formatProductionSource: function (sPlannedOrder) {
            return sPlannedOrder ? "From MRP" : "Manual";
        },

        /** Định dạng Confirmation State trước khi hiển thị trên giao diện. */
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

        /** Định dạng State trước khi hiển thị trên giao diện. */
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

        /** Định dạng Goods Issue State trước khi hiển thị trên giao diện. */
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

        /** Định dạng Goods Receipt State trước khi hiển thị trên giao diện. */
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

        /** Định dạng Highlight trước khi hiển thị trên giao diện. */
        formatHighlight: function (sStatus) {
            return this.formatState(sStatus);
        },

        /** Định dạng Date Time trước khi hiển thị trên giao diện. */
        formatDateTime: function (vDate) {
            if (!vDate) {
                return "-";
            }
            const oDate = vDate instanceof Date ? vDate : new Date(vDate);
            return Number.isNaN(oDate.getTime()) ? String(vDate) : oDate.toLocaleString("vi-VN");
        },

        onOpenMRPResults: function () {
            this.getOwnerComponent().getRouter().navTo("RouteMRPResults");
        },

        onOpenPOHistory: function () {
            this.getOwnerComponent().getRouter().navTo("RoutePOHistory");
        },

        /** Điều hướng về màn hình trước hoặc màn hình mặc định khi không có lịch sử. */
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
