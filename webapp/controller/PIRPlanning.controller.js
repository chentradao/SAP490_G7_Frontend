sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/routing/History",
    "sap/m/MessageBox",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], function (Controller, JSONModel, History, MessageBox, Filter, FilterOperator) {
    "use strict";

    return Controller.extend("sap490g7fioriapp.controller.PIRPlanning", {
        onInit: function () {
            this.getView().setModel(new JSONModel(this._createInitialData()), "pir");
            this.getOwnerComponent().getRouter().getRoute("RoutePIRPlanning")
                .attachPatternMatched(this._onRouteMatched, this);
        },

        _formatLocalDate: function (oDate) {
            const iMonth = oDate.getMonth() + 1;
            const iDay = oDate.getDate();
            return oDate.getFullYear() + "-" +
                String(iMonth).padStart(2, "0") + "-" +
                String(iDay).padStart(2, "0");
        },

        _createInitialData: function () {
            const oTomorrow = new Date();
            oTomorrow.setDate(oTomorrow.getDate() + 1);
            return {
                material: "",
                description: "",
                plant: "P001",
                currentStock: "0",
                requirementDate: this._formatLocalDate(oTomorrow),
                minimumDate: oTomorrow,
                quantity: "10",
                unit: "EA",
                requirementType: "VSF",
                version: "00",
                versionActive: true,
                busy: false
            };
        },

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

        onFinishedGoodSelected: function (oEvent) {
            const oContext = oEvent.getParameter("listItem").getBindingContext();
            const oPIR = this.getView().getModel("pir");
            oPIR.setProperty("/material", oContext.getProperty("Material") || "");
            oPIR.setProperty("/description", oContext.getProperty("MaterialDescription") || "");
            oPIR.setProperty("/plant", oContext.getProperty("Plant") || "P001");
            oPIR.setProperty("/currentStock", oContext.getProperty("StockQuantity") || "0");
            oPIR.setProperty("/unit", oContext.getProperty("MaterialBaseUnit") || "EA");
        },

        onCreatePIR: async function () {
            const oPIR = this.getView().getModel("pir");
            const oData = oPIR.getData();
            const nQuantity = Number(oData.quantity);

            if (!oData.material) {
                MessageBox.error("Select a Finished Good first.");
                return;
            }
            if (!oData.requirementDate) {
                MessageBox.error("Requirement Date is required.");
                return;
            }
            if (!Number.isFinite(nQuantity) || nQuantity <= 0) {
                MessageBox.error("Forecast Quantity must be greater than zero.");
                return;
            }

            const bConfirmed = await new Promise(function (resolve) {
                MessageBox.confirm(
                    "Create an active PIR for " + oData.material + "?\n\n" +
                    "Date: " + oData.requirementDate + "\n" +
                    "Quantity: " + oData.quantity + " " + oData.unit + "\n" +
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

            try {
                const oModel = this.getOwnerComponent().getModel();
                const oList = oModel.bindList("/PIRRequests", undefined, undefined, undefined, {
                    $$updateGroupId: "$direct"
                });
                const oContext = oList.create({
                    material: oData.material,
                    plant: oData.plant,
                    requirement_date: oData.requirementDate,
                    requirement_quantity: String(oData.quantity),
                    unit: oData.unit,
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
                    {
                        $$groupId: "$direct",
                        $select: "pir_request_id,status,bapi_message,material,requirement_date"
                    }
                );

                let sStatus = "";
                let sMessage = "";

                for (let iAttempt = 0; iAttempt < 5; iAttempt += 1) {
                    await new Promise(function (resolve) {
                        setTimeout(resolve, 800);
                    });

                    oPollBinding.refresh();
                    const aContexts = await oPollBinding.requestContexts(0, 1);
                    if (aContexts.length > 0) {
                        sStatus = String(aContexts[0].getProperty("status") || "").toUpperCase();
                        sMessage = aContexts[0].getProperty("bapi_message") || "";
                    }

                    if (sStatus === "CREATED" || sStatus === "ERROR") {
                        break;
                    }
                }

                oContext.refresh();
                this.onRefresh();

                if (sStatus === "CREATED") {
                    MessageBox.success("PIR was created successfully." + (sMessage ? "\n\n" + sMessage : ""));
                } else {
                    MessageBox.error(sMessage || "SAP did not return PIR status CREATED.");
                }
            } catch (oError) {
                MessageBox.error(oError.message || "Could not create the PIR.");
            } finally {
                oPIR.setProperty("/busy", false);
            }
        },

        onRunMRP: async function (oEvent) {
            const oContext = oEvent.getSource().getBindingContext();
            if (!oContext) {
                MessageBox.error("Select a PIR request first.");
                return;
            }

            const sMaterial = oContext.getProperty("material") || "";
            const sPlant = oContext.getProperty("plant") || "";
            const sStatus = String(oContext.getProperty("status") || "").toUpperCase();
            const sRequestId = oContext.getProperty("pir_request_id") || "";

            if (sStatus !== "CREATED" && sStatus !== "MRP_ERROR") {
                MessageBox.warning("MRP can only be run for a created PIR or retried after an MRP error.");
                return;
            }

            const bConfirmed = await new Promise(function (resolve) {
                MessageBox.confirm(
                    "Run single-item, multi-level MRP for " + sMaterial + " in plant " + sPlant + "?\n\n" +
                    "SAP will create a Planned Order for the finished good and Purchase Requisitions for missing raw materials when required.",
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
                    [new Filter("pir_request_id", FilterOperator.EQ, sRequestId)],
                    {
                        $$groupId: "$direct",
                        $select: "pir_request_id,status,bapi_message,material,plant"
                    }
                );

                let sUpdatedStatus = "";
                let sMessage = "";

                for (let iAttempt = 0; iAttempt < 8; iAttempt += 1) {
                    await new Promise(function (resolve) {
                        setTimeout(resolve, 800);
                    });

                    oPollBinding.refresh();
                    const aContexts = await oPollBinding.requestContexts(0, 1);
                    if (aContexts.length > 0) {
                        sUpdatedStatus = String(aContexts[0].getProperty("status") || "").toUpperCase();
                        sMessage = aContexts[0].getProperty("bapi_message") || "";
                    }

                    if (sUpdatedStatus === "MRP_COMPLETED" || sUpdatedStatus === "MRP_ERROR") {
                        break;
                    }
                }

                this.onRefresh();

                if (sUpdatedStatus === "MRP_COMPLETED") {
                    MessageBox.success(
                        "MRP completed successfully for " + sMaterial + "." +
                        (sMessage ? "\n\n" + sMessage : ""),
                        {
                            title: "MRP Completed",
                            onClose: function () {
                                this.getOwnerComponent().getRouter().navTo("RouteMRPResults");
                            }.bind(this)
                        }
                    );
                } else {
                    MessageBox.error(sMessage || "SAP did not return MRP status MRP_COMPLETED.");
                }
            } catch (oError) {
                MessageBox.error(oError.message || "Could not run MRP.");
            } finally {
                oPIR.setProperty("/busy", false);
            }
        },

        onRefresh: function () {
            ["pirFinishedGoodsTable", "pirHistoryTable"].forEach(function (sId) {
                const oBinding = this.byId(sId).getBinding("items");
                if (oBinding) {
                    oBinding.refresh();
                }
            }, this);
        },

        formatState: function (sStatus) {
            const sValue = String(sStatus || "").toUpperCase();
            if (sValue === "CREATED" || sValue === "MRP_COMPLETED") { return "Success"; }
            if (sValue === "ERROR" || sValue === "MRP_ERROR") { return "Error"; }
            return "Warning";
        },

        formatHighlight: function (sStatus) {
            return this.formatState(sStatus);
        },

        formatDate: function (vDate) {
            if (!vDate) { return "-"; }
            const oDate = new Date(String(vDate) + "T00:00:00");
            return Number.isNaN(oDate.getTime()) ? String(vDate) : oDate.toLocaleDateString("vi-VN");
        },

        formatDateTime: function (vDate) {
            if (!vDate) { return "-"; }
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
