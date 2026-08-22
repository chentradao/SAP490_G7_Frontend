/*
 * Controller PIRPlanning.controller: điều phối trạng thái, sự kiện giao diện và các lời gọi backend của màn hình.
 * Các hàm on... là event handler; các hàm bắt đầu bằng _ là helper chỉ dùng nội bộ controller.
 */
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/routing/History",
    "sap/m/MessageBox",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/Sorter"
], function (Controller, JSONModel, History, MessageBox, Filter, FilterOperator, Sorter) {
    "use strict";

    return Controller.extend("sap490g7fioriapp.controller.PIRPlanning", {
        /** Khởi tạo model trạng thái và đăng ký các sự kiện điều hướng của màn hình. */
        onInit: function () {
            this.getView().setModel(new JSONModel(this._createInitialData()), "pir");
            this.getOwnerComponent().getRouter().getRoute("RoutePIRPlanning")
                .attachPatternMatched(this._onRouteMatched, this);
        },

        /** Định dạng Local Date trước khi hiển thị trên giao diện. */
        _formatLocalDate: function (oDate) {
            const iMonth = oDate.getMonth() + 1;
            const iDay = oDate.getDate();
            return oDate.getFullYear() + "-" +
                String(iMonth).padStart(2, "0") + "-" +
                String(iDay).padStart(2, "0");
        },

        /** Tạo Initial Data dùng cho luồng xử lý hiện tại. */
        _createInitialData: function () {
            const oTomorrow = new Date();
            oTomorrow.setDate(oTomorrow.getDate() + 1);
            return {
                plant: "P001",
                requirementDate: this._formatLocalDate(oTomorrow),
                minimumDate: oTomorrow,
                selectedMeals: [],
                batchRequestId: "",
                batchMealCount: 0,
                batchStatusText: "",
                batchStatusState: "None",
                historyBatches: [],
                requirementType: "VSF",
                version: "00",
                versionActive: true,
                busy: false
            };
        },

        /** Kiểm tra quyền truy cập và chuẩn bị dữ liệu mỗi khi route được mở. */
        _onRouteMatched: function () {
            const oSession = this.getOwnerComponent().getModel("session");
            const sRole = String(oSession && oSession.getProperty("/role") || "").toUpperCase();
            const bCanAccess = Boolean(oSession && oSession.getProperty("/isLoggedIn") &&
                (sRole === "STAFF" || sRole === "ADMIN"));
            if (!bCanAccess) {
                MessageBox.warning("Only STAFF or ADMIN can access Demand Forecast planning.");
                this.getOwnerComponent().getRouter().navTo("RouteLogin", {}, true);
                return;
            }
            this.onRefresh();
        },

        /** Đồng bộ các món đã chọn để người dùng nhập nhu cầu cho từng món. */
        onFinishedGoodSelected: function (oEvent) {
            const oPIR = this.getView().getModel("pir");
            const mExistingQuantities = (oPIR.getProperty("/selectedMeals") || []).reduce(function (mQuantities, oMeal) {
                mQuantities[oMeal.material] = oMeal.quantity;
                return mQuantities;
            }, {});
            const aSelectedMeals = oEvent.getSource().getSelectedItems().map(function (oItem) {
                const oContext = oItem.getBindingContext();
                const sMaterial = oContext.getProperty("Material") || "";
                return {
                    material: sMaterial,
                    description: oContext.getProperty("MaterialDescription") || "",
                    plant: oContext.getProperty("Plant") || "P001",
                    currentStock: oContext.getProperty("StockQuantity") || "0",
                    unit: oContext.getProperty("MaterialBaseUnit") || "EA",
                    quantity: mExistingQuantities[sMaterial] || "10"
                };
            });
            oPIR.setProperty("/selectedMeals", aSelectedMeals);
        },

        /** Xử lý sự kiện Finished Goods Search từ giao diện người dùng. */
        onFinishedGoodsSearch: function (oEvent) {
            const sQuery = String(oEvent.getParameter("newValue") || "").trim();
            const aFilters = [new Filter("Material", FilterOperator.GE, "FG00009")];
            if (sQuery) {
                aFilters.push(new Filter({
                    filters: [
                        new Filter("Material", FilterOperator.Contains, sQuery),
                        new Filter("MaterialDescription", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                }));
            }
            this.byId("pirFinishedGoodsTable").getBinding("items").filter(aFilters);
        },

        /** Xử lý sự kiện Create PIR từ giao diện người dùng. */
        onCreatePIR: async function () {
            const oPIR = this.getView().getModel("pir");
            const oData = oPIR.getData();
            const aMeals = Array.isArray(oData.selectedMeals) ? oData.selectedMeals : [];

            if (!aMeals.length) {
                MessageBox.error("Select one or more Finished Goods first.");
                return;
            }
            if (!oData.requirementDate) {
                MessageBox.error("Requirement Date is required.");
                return;
            }
            const oInvalidMeal = aMeals.find(function (oMeal) {
                const nQuantity = Number(oMeal.quantity);
                return !oMeal.material || !Number.isFinite(nQuantity) || nQuantity <= 0;
            });
            if (oInvalidMeal) {
                MessageBox.error("Every selected meal must have a forecast quantity greater than zero.");
                return;
            }

            const bConfirmed = await new Promise(function (resolve) {
                MessageBox.confirm(
                    "Create active PIRs for " + aMeals.length + " selected meal(s)?\n\n" +
                    "Date: " + oData.requirementDate + "\n" +
                    "Requirement Type: VSF / Version: 00",
                    {
                        title: "Create Planned Independent Requirement",
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

            oPIR.setProperty("/busy", true);
            const sBatchId = this._createBatchId();
            const sBatchCode = this._formatForecastBatchCode(sBatchId, oData.requirementDate);

            try {
                const oModel = this.getOwnerComponent().getModel();
                const oList = oModel.bindList("/PIRRequests", undefined, undefined, undefined, {
                    $$updateGroupId: "$direct"
                });
                const aFailures = [];
                const aCreatedRequestIds = [];
                for (const oMeal of aMeals) {
                    const oContext = oList.create({
                        batch_id: sBatchId,
                        material: oMeal.material,
                        plant: oMeal.plant || oData.plant,
                        requirement_date: oData.requirementDate,
                        requirement_quantity: String(oMeal.quantity),
                        unit: oMeal.unit,
                        requirement_type: oData.requirementType,
                        version: oData.version,
                        version_active: oData.versionActive ? "X" : "",
                        requirement_plan_number: ""
                    });
                    await oContext.created();

                    const oAction = oModel.bindContext(
                        "com.sap.gateway.srvd.zsd_g7_canteen.v0001.CreatePIR(...)",
                        oContext
                    );
                    await oAction.execute("$direct");

                    const sRequestId = oContext.getProperty("pir_request_id") || "";
                    const oPollBinding = oModel.bindList(
                        "/PIRRequests",
                        undefined,
                        undefined,
                        [new Filter("pir_request_id", FilterOperator.EQ, sRequestId)],
                        { $$groupId: "$direct", $select: "status,bapi_message" }
                    );
                    await new Promise(function (resolve) { setTimeout(resolve, 800); });
                    const aContexts = await oPollBinding.requestContexts(0, 1);
                    const oResult = aContexts[0] && aContexts[0].getObject();
                    if (oResult && String(oResult.status || "").toUpperCase() === "CREATED") {
                        aCreatedRequestIds.push(sRequestId);
                    } else {
                        aFailures.push(oMeal.material + ": " + ((oResult && oResult.bapi_message) || "PIR was not created"));
                    }
                }

                this.onRefresh();

                if (!aFailures.length) {
                    const sCreatedDetails = aMeals.map(function (oMeal) {
                        return "• " + oMeal.material + " — " + oMeal.description +
                            " — " + oMeal.quantity + " " + oMeal.unit;
                    }).join("\n");
                    MessageBox.success(
                        "Forecast Batch: " + sBatchCode + "\n" +
                        "Batch ID: " + sBatchId + "\n\n" +
                        aMeals.length + " forecast(s) were created successfully.\n\n" +
                        "Requirement date: " + oData.requirementDate + "\n" +
                        "Plant: " + oData.plant + "\n\n" +
                        "Created forecasts:\n" + sCreatedDetails +
                        "\n\nThe batch is available in Previous Forecasts and MRP Runs.",
                        { title: "Forecast Batch Created" }
                    );
                    oPIR.setProperty("/selectedMeals", []);
                    oPIR.setProperty("/batchRequestId", "");
                    oPIR.setProperty("/batchMealCount", 0);
                    oPIR.setProperty("/batchStatusText", "");
                    oPIR.setProperty("/batchStatusState", "None");
                } else {
                    MessageBox.error(
                        "Forecast Batch: " + sBatchCode + "\n" +
                        "Batch ID: " + sBatchId + "\n\n" +
                        "Some forecasts could not be created:\n" + aFailures.join("\n")
                    );
                }
            } catch (oError) {
                MessageBox.error(oError.message || "Could not create the PIR.");
            } finally {
                oPIR.setProperty("/busy", false);
            }
        },

        /** Xử lý sự kiện Run MRP từ giao diện người dùng. */
        onRunTotalMRP: async function () {
            const sRequestId = this.getView().getModel("pir").getProperty("/batchRequestId");
            if (!sRequestId) {
                MessageBox.warning("Create a forecast batch first.");
                return;
            }

            try {
                const oBinding = this.getOwnerComponent().getModel().bindList(
                    "/PIRRequests",
                    undefined,
                    undefined,
                    [new Filter("pir_request_id", FilterOperator.EQ, sRequestId)],
                    { $$groupId: "$direct" }
                );
                const aContexts = await oBinding.requestContexts(0, 1);
                if (!aContexts.length) {
                    MessageBox.error("The latest forecast batch could not be found.");
                    return;
                }
                await this.onRunMRP(aContexts[0]);
            } catch (oError) {
                MessageBox.error(oError.message || "Could not load the forecast batch.");
            }
        },

        onRunHistoryBatch: async function (oEvent) {
            const oBatch = oEvent.getSource().getBindingContext("pir").getObject();
            const oRunnableItem = oBatch && (oBatch.items || []).find(function (oItem) {
                const sStatus = String(oItem.status || "").toUpperCase();
                return sStatus === "CREATED" || sStatus === "MRP_ERROR";
            });
            const sRunnableRequestId = oRunnableItem && oRunnableItem.pir_request_id;

            if (!oBatch || !sRunnableRequestId) {
                MessageBox.warning("This forecast batch has no runnable forecast.");
                return;
            }
            const oBinding = this.getOwnerComponent().getModel().bindList(
                "/PIRRequests", undefined, undefined,
                [new Filter("pir_request_id", FilterOperator.EQ, sRunnableRequestId)],
                { $$groupId: "$direct" }
            );
            const aContexts = await oBinding.requestContexts(0, 1);
            if (aContexts.length) {
                await this.onRunMRP(aContexts[0]);
            }
        },

        onRunSingleMRP: async function (oEvent) {
            const oHistoryContext = oEvent.getSource().getBindingContext("pir");
            const oHistoryItem = oHistoryContext && oHistoryContext.getObject();
            if (!oHistoryItem || !oHistoryItem.pir_request_id) {
                MessageBox.error("The selected PIR could not be read.");
                return;
            }

            const sRequestId = oHistoryItem.pir_request_id;
            const sMaterial = oHistoryItem.material || "";
            const sStatus = String(oHistoryItem.status || "").toUpperCase();

            if (sStatus !== "CREATED" && sStatus !== "MRP_ERROR") {
                MessageBox.warning("This PIR is not ready for single-item MRP.");
                return;
            }

            const bConfirmed = await new Promise(function (resolve) {
                MessageBox.confirm(
                    "Run MRP only for " + sMaterial + "?\n\nOther items in this batch will not be processed.",
                    {
                        title: "Run Single MRP",
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

            const oPIR = this.getView().getModel("pir");
            oPIR.setProperty("/busy", true);

            try {
                const oModel = this.getOwnerComponent().getModel();
                const oRequestBinding = oModel.bindList(
                    "/PIRRequests", undefined, undefined,
                    [new Filter("pir_request_id", FilterOperator.EQ, sRequestId)],
                    { $$groupId: "$direct" }
                );
                const aRequestContexts = await oRequestBinding.requestContexts(0, 1);
                if (!aRequestContexts.length) {
                    throw new Error("The selected PIR could not be loaded from SAP.");
                }
                const oBackendContext = aRequestContexts[0];
                const oAction = oModel.bindContext(
                    "com.sap.gateway.srvd.zsd_g7_canteen.v0001.RunSingleMRP(...)",
                    oBackendContext
                );
                await oAction.execute("$direct");

                const oPollBinding = oModel.bindList(
                    "/PIRRequests", undefined, undefined,
                    [new Filter("pir_request_id", FilterOperator.EQ, sRequestId)],
                    { $$groupId: "$direct", $select: "status,bapi_message,material" }
                );

                let sStatus = "";
                let sMessage = "";
                for (let iAttempt = 0; iAttempt < 8; iAttempt += 1) {
                    await new Promise(function (resolve) { setTimeout(resolve, 800); });
                    oPollBinding.refresh();
                    const aContexts = await oPollBinding.requestContexts(0, 1);
                    if (aContexts.length) {
                        sStatus = String(aContexts[0].getProperty("status") || "").toUpperCase();
                        sMessage = aContexts[0].getProperty("bapi_message") || "";
                    }
                    if (sStatus === "MRP_COMPLETED" || sStatus === "MRP_ERROR") {
                        break;
                    }
                }

                await this._loadPIRHistory();

                if (sStatus === "MRP_COMPLETED") {
                    MessageBox.success("MRP completed for " + sMaterial + "." + (sMessage ? "\n\n" + sMessage : ""));
                } else {
                    MessageBox.error(sMessage || "Single-item MRP failed.");
                }
            } catch (oError) {
                MessageBox.error(oError.message || "Could not run single-item MRP.");
            } finally {
                oPIR.setProperty("/busy", false);
            }
        },

        _createBatchId: function () {
            if (window.crypto && typeof window.crypto.randomUUID === "function") {
                return window.crypto.randomUUID().replace(/-/g, "").toUpperCase();
            }
            return (Date.now().toString(16) + Math.random().toString(16).slice(2)).slice(0, 32).toUpperCase();
        },

        _formatForecastBatchCode: function (sBatchId, vRequirementDate) {
            const sDate = String(vRequirementDate || "").slice(0, 10).replace(/-/g, "") || "UNKNOWN";
            const sShortId = String(sBatchId || "").replace(/-/g, "").slice(0, 8).toUpperCase();
            return "FORECAST-" + sDate + "-" + (sShortId || "LEGACY");
        },

        /** Xử lý một lần chạy MRP tổng dựa trên PIR đại diện của batch. */
        onRunMRP: async function (oEventOrContext) {
            const oContext = oEventOrContext && typeof oEventOrContext.getSource === "function"
                ? oEventOrContext.getSource().getBindingContext()
                : oEventOrContext;
            if (!oContext) {
                MessageBox.error("Select a PIR request first.");
                return;
            }

            const sPlant = oContext.getProperty("plant") || "";
            const sBatchId = oContext.getProperty("batch_id") || "";
            const sRequirementDate = oContext.getProperty("requirement_date") || "";
            const sBatchCode = this._formatForecastBatchCode(sBatchId, sRequirementDate);

            if (!sBatchId) {
                MessageBox.warning("This forecast does not have a Batch ID and cannot run batch MRP.");
                return;
            }

            const bConfirmed = await new Promise(function (resolve) {
                MessageBox.confirm(
                    "Forecast Batch: " + sBatchCode + "\n" +
                    "Batch ID: " + (sBatchId || "-") + "\n" +
                    "Plant: " + sPlant + "\n" +
                    "Requirement Date: " + (sRequirementDate || "-") + "\n\n" +
                    "Run total MRP for all created forecasts in this batch?\n\n" +
                    "SAP will calculate material requirements once and generate planning and procurement proposals.",
                    {
                        title: "Run MRP",
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

            const oPIR = this.getView().getModel("pir");
            oPIR.setProperty("/busy", true);
            oPIR.setProperty("/batchStatusText", "Total MRP is running...");
            oPIR.setProperty("/batchStatusState", "Information");

            try {
                const oModel = this.getOwnerComponent().getModel();
                const oAction = oModel.bindContext(
                    "com.sap.gateway.srvd.zsd_g7_canteen.v0001.RunMRP(...)",
                    oContext
                );
                await oAction.execute("$direct");

                const oPollBinding = oModel.bindList(
                    "/PIRRequests",
                    undefined,
                    undefined,
                    [new Filter("batch_id", FilterOperator.EQ, sBatchId)],
                    {
                        $$groupId: "$direct",
                        $select: "pir_request_id,batch_id,status,bapi_message,material,plant"
                    }
                );

                let aBatchResults = [];

                for (let iAttempt = 0; iAttempt < 10; iAttempt += 1) {
                    await new Promise(function (resolve) {
                        setTimeout(resolve, 500);
                    });

                    oPollBinding.refresh();
                    const aContexts = await oPollBinding.requestContexts(0, 100);
                    aBatchResults = aContexts.map(function (oBatchContext) {
                        return oBatchContext.getObject();
                    });

                    if (aBatchResults.length > 0 && aBatchResults.every(function (oRequest) {
                        const sRequestStatus = String(oRequest.status || "").toUpperCase();
                        return sRequestStatus === "MRP_COMPLETED" || sRequestStatus === "MRP_ERROR";
                    })) {
                        break;
                    }
                }

                this.onRefresh();

                const aCompleted = aBatchResults.filter(function (oRequest) {
                    return String(oRequest.status || "").toUpperCase() === "MRP_COMPLETED";
                });
                const aFailed = aBatchResults.filter(function (oRequest) {
                    return String(oRequest.status || "").toUpperCase() === "MRP_ERROR";
                });
                const sCreatedDocuments = await this._getMRPCreatedDocuments(
                    aBatchResults.map(function (oRequest) {
                        return oRequest.pir_request_id;
                    })
                );
                const sResultDetails = aBatchResults.map(function (oRequest) {
                    return "• " + (oRequest.material || "Unknown material") + ": " +
                        (oRequest.bapi_message || oRequest.status || "No SAP message");
                }).join("\n");

                if (aBatchResults.length > 0 && aFailed.length === 0 &&
                    aCompleted.length === aBatchResults.length) {
                    oPIR.setProperty("/batchStatusText", "Total MRP completed");
                    oPIR.setProperty("/batchStatusState", "Success");
                    MessageBox.success(
                        "Forecast Batch: " + sBatchCode + "\n" +
                        "Batch ID: " + (sBatchId || "-") + "\n" +
                        "Plant: " + sPlant + "\n" +
                        "Requirement Date: " + (sRequirementDate || "-") + "\n\n" +
                        "MRP completed successfully for " + aCompleted.length +
                        " forecast(s) in plant " + sPlant + "." +
                        (sResultDetails ? "\n\nMaterial results:\n" + sResultDetails : "") +
                        (sCreatedDocuments ? "\n\nDocuments created:\n" + sCreatedDocuments :
                            "\n\nNo new Planned Order or Purchase Requisition was recorded."),
                        {
                            title: "MRP Completed",
                            onClose: function () {
                                this.getOwnerComponent().getRouter().navTo("RouteMRPResults");
                            }.bind(this)
                        }
                    );
                } else if (aCompleted.length > 0) {
                    oPIR.setProperty("/batchStatusText", "Total MRP partially completed");
                    oPIR.setProperty("/batchStatusState", "Warning");
                    MessageBox.warning(
                        "Forecast Batch: " + sBatchCode + "\n" +
                        "Batch ID: " + sBatchId + "\n" +
                        "Plant: " + sPlant + "\n\n" +
                        "Successful: " + aCompleted.length + "/" + aBatchResults.length + "\n" +
                        "Failed: " + aFailed.length + "\n\n" +
                        sResultDetails +
                        (sCreatedDocuments ? "\n\nDocuments created:\n" + sCreatedDocuments : ""),
                        { title: "MRP Partially Completed" }
                    );
                } else {
                    oPIR.setProperty("/batchStatusText", "Total MRP failed");
                    oPIR.setProperty("/batchStatusState", "Error");
                    MessageBox.error(
                        "Forecast Batch: " + sBatchCode + "\n" +
                        "Batch ID: " + sBatchId + "\n\n" +
                        (sResultDetails || "SAP did not return a completed MRP result.")
                    );
                }
            } catch (oError) {
                oPIR.setProperty("/batchStatusText", "Total MRP failed");
                oPIR.setProperty("/batchStatusState", "Error");
                MessageBox.error(oError.message || "Could not run MRP.");
            } finally {
                oPIR.setProperty("/busy", false);
            }
        },

        /** Đọc và trả về MRP Created Documents phục vụ xử lý nội bộ. */
        _getMRPCreatedDocuments: async function (aPIRRequestIds) {
            try {
                const oModel = this.getOwnerComponent().getModel();
                const aValidRequestIds = Array.from(new Set((aPIRRequestIds || []).filter(Boolean)));
                if (!aValidRequestIds.length) { return ""; }

                const oRequestFilter = new Filter({
                    filters: aValidRequestIds.map(function (sRequestId) {
                        return new Filter("PIRRequestID", FilterOperator.EQ, sRequestId);
                    }),
                    and: false
                });
                const oRuns = oModel.bindList(
                    "/MRPRuns", undefined,
                    [new Sorter("StartedAt", true)],
                    [oRequestFilter],
                    { $$groupId: "$direct", $select: "MRPRunID,PIRRequestID,FinishedMaterial,StartedAt" }
                );
                const aRunContexts = await oRuns.requestContexts(0, 100);
                if (!aRunContexts.length) { return ""; }

                const aRunItems = await Promise.all(aRunContexts.map(async function (oRunContext) {
                    const oItems = oModel.bindList(
                        "/MRPRunItems", undefined,
                        [new Sorter("ItemNo", false)],
                        [new Filter("MRPRunID", FilterOperator.EQ, oRunContext.getProperty("MRPRunID"))],
                        {
                            $$groupId: "$direct",
                            $select: "MRPRunID,ItemNo,DocumentCategory,DocumentNumber,DocumentItem,Material,RequiredQuantity,Unit"
                        }
                    );
                    const aItemContexts = await oItems.requestContexts(0, 200);
                    return aItemContexts.map(function (oItemContext) {
                        return oItemContext.getObject();
                    });
                }));

                const mDocuments = new Map();
                aRunItems.flat().forEach(function (oItem) {
                    const sKey = [
                        oItem.DocumentCategory,
                        oItem.DocumentNumber,
                        oItem.DocumentItem
                    ].join("|");
                    if (!mDocuments.has(sKey)) {
                        mDocuments.set(sKey, oItem);
                    }
                });

                return Array.from(mDocuments.values()).map(function (oItem) {
                    const sCategory = oItem.DocumentCategory === "PLANNED_ORDER"
                        ? "Planned Order" : "Purchase Requisition";
                    const sItem = oItem.DocumentItem ? "/" + oItem.DocumentItem : "";
                    return "• " + sCategory + ": " + oItem.DocumentNumber + sItem +
                        " — " + oItem.Material + " — " +
                        Number(oItem.RequiredQuantity || 0).toLocaleString("vi-VN", { maximumFractionDigits: 3 }) +
                        " " + (oItem.Unit || "");
                }).join("\n");
            } catch (oError) {
                return "";
            }
        },

        /** Tải lại dữ liệu mới nhất cho các binding đang hiển thị. */
        onRefresh: function () {
            const oFinishedGoodsBinding = this.byId("pirFinishedGoodsTable").getBinding("items");
            if (oFinishedGoodsBinding) {
                oFinishedGoodsBinding.refresh();
            }
            this._loadPIRHistory();
        },

        _loadPIRHistory: async function () {
            try {
                const oBinding = this.getOwnerComponent().getModel().bindList(
                    "/PIRRequests", undefined, undefined,
                    [new Filter("material", FilterOperator.GE, "FG00009")],
                    {
                        $$groupId: "$direct",
                        $select: "pir_request_id,batch_id,material,plant,requirement_date,requirement_quantity,unit,status,bapi_message,created_at"
                    }
                );
                const aContexts = await oBinding.requestContexts(0, 5000);
                const mGroups = {};
                aContexts.map(function (oContext) { return oContext.getObject(); }).forEach(function (oItem) {
                    const sBatchId = oItem.batch_id || "LEGACY-" + (oItem.requirement_date || "UNKNOWN");
                    if (!mGroups[sBatchId]) {
                        mGroups[sBatchId] = {
                            batchId: sBatchId,
                            requestId: oItem.pir_request_id,
                            plant: oItem.plant,
                            requirementDate: oItem.requirement_date,
                            createdAt: oItem.created_at || "",
                            items: []
                        };
                    }
                    mGroups[sBatchId].items.push(oItem);
                });
                const aGroups = Object.keys(mGroups).map(function (sKey) {
                    const oGroup = mGroups[sKey];
                    oGroup.summary = oGroup.items.length + " meal(s) · " + (oGroup.requirementDate || "") + " · " + (oGroup.plant || "");
                    return oGroup;
                });
                aGroups.sort(function (a, b) {
                    return String(b.createdAt || b.requirementDate).localeCompare(String(a.createdAt || a.requirementDate));
                });
                this.getView().getModel("pir").setProperty("/historyBatches", aGroups);
            } catch (oError) {
                console.error("Could not load PIR batches:", oError);
            }
        },

        /** Định dạng State trước khi hiển thị trên giao diện. */
        formatState: function (sStatus) {
            const sValue = String(sStatus || "").toUpperCase();
            if (sValue === "CREATED" || sValue === "MRP_COMPLETED") { return "Success"; }
            if (sValue === "ERROR" || sValue === "MRP_ERROR") { return "Error"; }
            return "Warning";
        },

        /** Định dạng Highlight trước khi hiển thị trên giao diện. */
        formatHighlight: function (sStatus) {
            return this.formatState(sStatus);
        },

        /** Định dạng Date trước khi hiển thị trên giao diện. */
        formatDate: function (vDate) {
            if (!vDate) { return "-"; }
            const oDate = new Date(String(vDate) + "T00:00:00");
            return Number.isNaN(oDate.getTime()) ? String(vDate) : oDate.toLocaleDateString("vi-VN");
        },

        /** Định dạng Date Time trước khi hiển thị trên giao diện. */
        formatDateTime: function (vDate) {
            if (!vDate) { return "-"; }
            const oDate = vDate instanceof Date ? vDate : new Date(vDate);
            return Number.isNaN(oDate.getTime()) ? String(vDate) : oDate.toLocaleString("vi-VN");
        },

        /** Điều hướng về màn hình trước hoặc màn hình mặc định khi không có lịch sử. */
        onNavBack: function () {
            if (History.getInstance().getPreviousHash() !== undefined) {
                window.history.go(-1);
                return;
            }
            this.getOwnerComponent().getRouter().navTo("RouteStaffDashboard", {}, true);
        }
    });
});
