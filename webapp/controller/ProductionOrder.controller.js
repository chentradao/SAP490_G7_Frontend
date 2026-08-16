sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageBox"
], function (Controller, JSONModel, Filter, FilterOperator, MessageBox) {
    "use strict";

    return Controller.extend("sap490g7fioriapp.controller.ProductionOrder", {
        onInit: function () {
            this.getView().setModel(new JSONModel({
                bom: [],
                canCreate: false,
                selectedMaterial: "",
                selectedDescription: "",
                selectedStock: "",
                selectedUnit: "",
                selectedPlant: "P001",
                selectedStorage: "FG01",
                orderQuantity: "1",
                hasShortage: false,
                shortageMessage: "",
                orderType: "PP01",
                productionVersion: "0001",
                lastStockSyncText: "Not synchronized in this session"
            }), "ui");

            this.getOwnerComponent().getRouter().getRoute("RouteProductionOrder")
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
                MessageBox.warning("Only STAFF or ADMIN can access Production Orders.");
                this.getOwnerComponent().getRouter().navTo("RouteLogin", {}, true);
            }
        },

        onNavBack: function () {
            this.getOwnerComponent().getRouter().navTo("RouteStaffDashboard", {}, true);
        },

        onOpenHistory: function () {
            this.getOwnerComponent().getRouter().navTo("RouteProductionOrderHistory");
        },

        onSyncFoodStock: async function () {
            const oSession = this.getOwnerComponent().getModel("session");
            const sRole = String(
                oSession && oSession.getProperty("/role") || ""
            ).toUpperCase();

            if (sRole !== "ADMIN") {
                MessageBox.warning("Only ADMIN can synchronize Food2 stock.");
                return;
            }

            const oButton = this.byId("syncFoodStockButton");
            const oModel = this.getOwnerComponent().getModel();
            const oAction = oModel.bindContext(
                "/Food2/com.sap.gateway.srvd.zsd_g7_canteen.v0001.syncFromFG01(...)",
                undefined,
                { $$groupId: "$direct" }
            );

            if (oButton) {
                oButton.setBusy(true);
                oButton.setEnabled(false);
            }

            try {
                await oAction.execute();
                oModel.refresh();
                this.getView().getModel("ui").setProperty(
                    "/lastStockSyncText",
                    "Last synchronized: " + new Date().toLocaleString("vi-VN")
                );
                MessageBox.success(
                    "Food2 stock was synchronized from P001/FG01 successfully."
                );
            } catch (oError) {
                console.error("Food2 stock synchronization failed:", oError);
                MessageBox.error("Unable to synchronize Food2 stock from P001/FG01.");
            } finally {
                if (oButton) {
                    oButton.setBusy(false);
                    oButton.setEnabled(true);
                }
            }
        },

        onFGSelected: async function (oEvent) {
            const oItem = oEvent.getParameter("listItem");
            const oData = oItem.getBindingContext().getObject();
            const oUi = this.getView().getModel("ui");

            oUi.setProperty("/selectedMaterial", oData.MaterialNumber);
            oUi.setProperty("/selectedDescription", oData.MaterialDescription || "");
            oUi.setProperty("/selectedStock", oData.AvailableStock || "0");
            oUi.setProperty("/selectedUnit", oData.BaseUnit || "");
            oUi.setProperty("/selectedPlant", oData.Plant || "P001");
            oUi.setProperty("/selectedStorage", oData.StorageLocation || "FG01");
            oUi.setProperty("/bom", []);
            oUi.setProperty("/canCreate", false);

            try {
                const oModel = this.getView().getModel();
                const oBinding = oModel.bindList("/FinishedGoodsBOM", null, null, [
                    new Filter("FinishedMaterial", FilterOperator.EQ, oData.MaterialNumber),
                    new Filter("Plant", FilterOperator.EQ, oData.Plant || "P001")
                ]);
                const aContexts = await oBinding.requestContexts(0, 100);
                const aBom = aContexts.map((oContext) => {
                    const oBom = oContext.getObject();
                    return Object.assign({}, oBom, {
                        RequiredForOrder: 0,
                        ShortageQuantity: 0,
                        AvailabilityText: "",
                        AvailabilityState: "None"
                    });
                });
                oUi.setProperty("/bom", aBom);
                this._recalculateMaterialAvailability();

                if (aBom.length === 0) {
                    MessageBox.warning("No BOM was found for the selected finished material.");
                }
            } catch (oError) {
                MessageBox.error(oError.message || "Could not load the BOM.");
            }
        },

        onOrderQuantityChange: function (oEvent) {
            const sValue = oEvent.getParameter("value");
            this.getView().getModel("ui").setProperty("/orderQuantity", sValue);
            this._recalculateMaterialAvailability();
        },

        _recalculateMaterialAvailability: function () {
            const oUi = this.getView().getModel("ui");
            const nOrderQuantity = Number(oUi.getProperty("/orderQuantity"));
            const aBom = oUi.getProperty("/bom") || [];
            const bValidQuantity = Number.isFinite(nOrderQuantity) && nOrderQuantity > 0;
            const aShortages = [];

            const aCalculatedBom = aBom.map(function (oBom) {
                const nAvailable = Number(oBom.AvailableQuantity || 0);
                const nRequiredPerUnit = Number(oBom.ComponentQuantity || 0);
                const nRequiredForOrder = bValidQuantity ? nRequiredPerUnit * nOrderQuantity : 0;
                const nShortage = Math.max(0, nRequiredForOrder - nAvailable);

                if (nShortage > 0) {
                    aShortages.push(
                        (oBom.ComponentDescription || oBom.ComponentMaterial) + ": short by " +
                        this._formatQuantity(nShortage) + " " + (oBom.ComponentUnit || "")
                    );
                }

                return Object.assign({}, oBom, {
                    RequiredForOrder: this._formatQuantity(nRequiredForOrder),
                    ShortageQuantity: this._formatQuantity(nShortage),
                    AvailabilityText: nShortage > 0 ?
                        "Shortage " + this._formatQuantity(nShortage) + " " + (oBom.ComponentUnit || "") :
                        "Available",
                    AvailabilityState: nShortage > 0 ? "Error" : "Success"
                });
            }.bind(this));

            oUi.setProperty("/bom", aCalculatedBom);
            oUi.setProperty("/hasShortage", aShortages.length > 0);
            oUi.setProperty("/shortageMessage", aShortages.length ?
                "Insufficient material stock to create this Production Order: " + aShortages.join("; ") : "");
            oUi.setProperty("/canCreate", Boolean(aCalculatedBom.length && bValidQuantity && !aShortages.length));
        },

        _formatQuantity: function (vQuantity) {
            return Number(vQuantity || 0).toLocaleString("en-US", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 3
            });
        },

        onCreateProductionOrder: async function () {
            const oUi = this.getView().getModel("ui");
            const sMaterial = oUi.getProperty("/selectedMaterial");
            const nQuantity = Number(oUi.getProperty("/orderQuantity"));

            if (!sMaterial || !nQuantity || nQuantity <= 0) {
                MessageBox.warning("Select a finished material and enter a quantity greater than zero.");
                return;
            }

            this._recalculateMaterialAvailability();
            if (!(oUi.getProperty("/bom") || []).length) {
                MessageBox.warning("Cannot create a Production Order because no BOM is available.");
                return;
            }
            if (oUi.getProperty("/hasShortage")) {
                MessageBox.warning(oUi.getProperty("/shortageMessage"), {
                    title: "Insufficient Material Stock"
                });
                return;
            }

            const oModel = this.getView().getModel();
            try {
                const oListBinding = oModel.bindList(
                    "/ProductionOrderRequests",
                    undefined,
                    undefined,
                    undefined,
                    { $$updateGroupId: "$direct" }
                );
                const oContext = oListBinding.create({
                    material: sMaterial,
                    plant: oUi.getProperty("/selectedPlant"),
                    order_quantity: String(nQuantity),
                    unit: oUi.getProperty("/selectedUnit"),
                    order_type: oUi.getProperty("/orderType")
                });
                await oContext.created();

                const sRequestId = oContext.getProperty("request_id");
                if (!sRequestId) {
                    throw new Error("SAP did not return a Production Order Request ID.");
                }

                const oAction = oModel.bindContext(
                    "com.sap.gateway.srvd.zsd_g7_canteen.v0001.CreateProductionOrder(...)",
                    oContext
                );
                await oAction.execute("$direct");

                const oPollBinding = oModel.bindList(
                    "/ProductionOrderRequests",
                    undefined,
                    undefined,
                    [new Filter("request_id", FilterOperator.EQ, sRequestId)],
                    { $$groupId: "$direct" }
                );

                let sProductionOrder = "";
                let sStatus = "";
                let sBapiMessage = "";

                for (let iAttempt = 0; iAttempt < 5; iAttempt += 1) {
                    await new Promise(function (resolve) {
                        setTimeout(resolve, 1000);
                    });

                    oPollBinding.refresh();
                    const aRequestContexts = await oPollBinding.requestContexts(0, 1);

                    if (aRequestContexts.length > 0) {
                        sProductionOrder = aRequestContexts[0].getProperty("production_order") || "";
                        sStatus = aRequestContexts[0].getProperty("status") || "";
                        sBapiMessage = aRequestContexts[0].getProperty("bapi_message") || "";
                    }

                    if (sProductionOrder || sStatus === "ERROR") {
                        break;
                    }
                }

                if (!sProductionOrder) {
                    throw new Error(
                        sBapiMessage ||
                        (sStatus ? "SAP status: " + sStatus : "SAP did not return a Production Order number.")
                    );
                }

                MessageBox.success("Production Order " + sProductionOrder + " was created successfully.");
                oUi.setProperty("/canCreate", false);
            } catch (oError) {
                MessageBox.error(oError.message || "Could not create the Production Order.");
            }
        }
    });
});
