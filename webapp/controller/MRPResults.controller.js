sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History",
    "sap/ui/core/Fragment",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/m/SelectDialog",
    "sap/m/StandardListItem",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], function (
    Controller,
    History,
    Fragment,
    JSONModel,
    MessageBox,
    SelectDialog,
    StandardListItem,
    Filter,
    FilterOperator
) {
    "use strict";

    return Controller.extend("sap490g7fioriapp.controller.MRPResults", {
        onInit: function () {
            this.getView().setModel(new JSONModel({
                busy: false
            }), "mrp");
            this.getView().setModel(new JSONModel({}), "prConvert");

            this.getOwnerComponent().getRouter().getRoute("RouteMRPResults")
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
                MessageBox.warning("Only STAFF or ADMIN can access MRP Results.");
                this.getOwnerComponent().getRouter().navTo("RouteLogin", {}, true);
                return;
            }

            this.byId("mrpMaterialFilter").setValue("");
            this.byId("mrpPlantFilter").setValue("");
            this.byId("mrpPRScope").setSelectedKey("ALL");
            ["plannedOrdersTable", "purchaseRequisitionsTable"].forEach(function (sId) {
                const oBinding = this.byId(sId).getBinding("items");
                if (oBinding) {
                    oBinding.filter([]);
                }
            }, this);
            this.onRefresh();
        },

        _getFilterValue: function (sId) {
            return String(this.byId(sId).getValue() || "").trim().toUpperCase();
        },

        onFilter: function () {
            const sMaterial = this._getFilterValue("mrpMaterialFilter");
            const sPlant = this._getFilterValue("mrpPlantFilter");
            const sPRScope = this.byId("mrpPRScope").getSelectedKey();
            const aCommonFilters = [];

            if (sMaterial) {
                aCommonFilters.push(new Filter("Material", FilterOperator.Contains, sMaterial));
            }
            if (sPlant) {
                aCommonFilters.push(new Filter("Plant", FilterOperator.EQ, sPlant));
            }

            const oPlannedBinding = this.byId("plannedOrdersTable").getBinding("items");
            if (oPlannedBinding) {
                oPlannedBinding.filter(aCommonFilters);
            }

            const aPRFilters = aCommonFilters.slice();
            if (sPRScope === "OPEN") {
                aPRFilters.push(new Filter("OpenQuantity", FilterOperator.GT, 0));
            }
            const oPRBinding = this.byId("purchaseRequisitionsTable").getBinding("items");
            if (oPRBinding) {
                oPRBinding.filter(aPRFilters);
            }
        },

        onClearFilters: function () {
            this.byId("mrpMaterialFilter").setValue("");
            this.byId("mrpPlantFilter").setValue("");
            this.byId("mrpPRScope").setSelectedKey("ALL");
            this.onFilter();
        },

        onRefresh: function () {
            ["plannedOrdersTable", "purchaseRequisitionsTable"].forEach(function (sId) {
                const oBinding = this.byId(sId).getBinding("items");
                if (oBinding) {
                    oBinding.refresh();
                }
            }, this);
        },

        _formatLocalDate: function (oDate) {
            return oDate.getFullYear() + "-" +
                String(oDate.getMonth() + 1).padStart(2, "0") + "-" +
                String(oDate.getDate()).padStart(2, "0");
        },

        _getSafeDeliveryDate: function (vDeliveryDate) {
            const oTomorrow = new Date();
            oTomorrow.setHours(0, 0, 0, 0);
            oTomorrow.setDate(oTomorrow.getDate() + 1);

            if (!vDeliveryDate) {
                return this._formatLocalDate(oTomorrow);
            }

            const sDate = String(vDeliveryDate).slice(0, 10);
            const oDate = new Date(sDate + "T00:00:00");
            return Number.isNaN(oDate.getTime()) || oDate < oTomorrow
                ? this._formatLocalDate(oTomorrow)
                : sDate;
        },

        onConvertPurchaseRequisition: async function () {
            const oTable = this.byId("purchaseRequisitionsTable");
            const oItem = oTable.getSelectedItem();

            if (!oItem) {
                MessageBox.warning("Select one Purchase Requisition item first.");
                return;
            }

            const oPR = oItem.getBindingContext().getObject();
            const nOpenQuantity = this._parseQuantity(oPR.OpenQuantity);

            if (nOpenQuantity <= 0) {
                MessageBox.error("This Purchase Requisition has no open quantity remaining.");
                return;
            }
            if (this._isClosed(oPR.IsClosed)) {
                MessageBox.error("This Purchase Requisition item is closed.");
                return;
            }
            if (oPR.PurchaseOrder) {
                MessageBox.error("This Purchase Requisition is already linked to Purchase Order " + oPR.PurchaseOrder + ".");
                return;
            }

            this.getView().getModel("prConvert").setData({
                purchaseRequisition: oPR.PurchaseRequisition || "",
                prItem: oPR.PurchaseRequisitionItem || "",
                material: oPR.Material || "",
                description: oPR.MaterialDescription || "",
                quantity: String(oPR.OpenQuantity || ""),
                unit: oPR.Unit || "",
                plant: oPR.Plant || "P001",
                storageLocation: oPR.StorageLocation || "RM01",
                deliveryDate: this._getSafeDeliveryDate(oPR.DeliveryDate),
                vendor: oPR.FixedSupplier || oPR.DesiredSupplier || "",
                vendorName: "",
                companyCode: "PT01",
                purchOrg: oPR.PurchasingOrganization || "",
                purchOrgName: "",
                purchGroup: oPR.PurchasingGroup || "324",
                purchGroupName: "",
                price: "",
                currency: "VND"
            });

            if (!this._prConversionDialog) {
                this._prConversionDialog = await Fragment.load({
                    id: this.getView().getId(),
                    name: "sap490g7fioriapp.fragment.PurchaseRequisitionConversion",
                    controller: this
                });
                this.getView().addDependent(this._prConversionDialog);
            }

            this._prConversionDialog.open();
        },

        onClosePRConversion: function () {
            if (this._prConversionDialog) {
                this._prConversionDialog.close();
            }
        },

        _openPRValueHelp: function (mConfig) {
            const oDialog = new SelectDialog({
                title: mConfig.title,
                search: function (oEvent) {
                    const sValue = oEvent.getParameter("value") || "";
                    const oBinding = oEvent.getSource().getBinding("items");
                    oBinding.filter(sValue ? [new Filter({
                        filters: [
                            new Filter(mConfig.keyField, FilterOperator.Contains, sValue),
                            new Filter(mConfig.textField, FilterOperator.Contains, sValue)
                        ],
                        and: false
                    })] : []);
                },
                confirm: function (oEvent) {
                    const oContext = oEvent.getParameter("selectedItem").getBindingContext();
                    if (oContext) {
                        mConfig.onSelect(oContext.getObject());
                    }
                },
                afterClose: function () {
                    oDialog.destroy();
                }
            });

            oDialog.bindAggregation("items", {
                path: mConfig.path,
                filters: mConfig.filters || [],
                template: new StandardListItem({
                    title: "{" + mConfig.keyField + "}",
                    description: "{" + mConfig.textField + "}"
                })
            });
            this.getView().addDependent(oDialog);
            oDialog.open();
        },

        onPRPurchOrgValueHelp: function () {
            const oData = this.getView().getModel("prConvert");
            this._openPRValueHelp({
                title: "Select Purchasing Organization",
                path: "/PurchasingOrganizationVH",
                keyField: "PurchasingOrganization",
                textField: "PurchasingOrganizationName",
                onSelect: function (oItem) {
                    oData.setProperty("/purchOrg", oItem.PurchasingOrganization || "");
                    oData.setProperty("/purchOrgName", oItem.PurchasingOrganizationName || "");
                    oData.setProperty("/companyCode", oItem.CompanyCode || "PT01");
                    oData.setProperty("/vendor", "");
                    oData.setProperty("/vendorName", "");
                }
            });
        },

        onPRVendorValueHelp: function () {
            const oData = this.getView().getModel("prConvert");
            const sPurchOrg = oData.getProperty("/purchOrg") || "";
            this._openPRValueHelp({
                title: "Select Vendor",
                path: "/VendorVH",
                keyField: "Vendor",
                textField: "VendorName",
                filters: sPurchOrg
                    ? [new Filter("PurchasingOrganization", FilterOperator.EQ, sPurchOrg)]
                    : [],
                onSelect: function (oItem) {
                    oData.setProperty("/vendor", oItem.Vendor || "");
                    oData.setProperty("/vendorName", oItem.VendorName || "");
                }
            });
        },

        onPRPurchGroupValueHelp: function () {
            const oData = this.getView().getModel("prConvert");
            this._openPRValueHelp({
                title: "Select Purchasing Group",
                path: "/PurchasingGroupVH",
                keyField: "PurchasingGroup",
                textField: "PurchasingGroupName",
                onSelect: function (oItem) {
                    oData.setProperty("/purchGroup", oItem.PurchasingGroup || "");
                    oData.setProperty("/purchGroupName", oItem.PurchasingGroupName || "");
                }
            });
        },

        _readPOConversionResult: async function (sRequestId) {
            const oBinding = this.getOwnerComponent().getModel().bindList(
                "/ZP_G7_PO_REQUEST",
                undefined,
                undefined,
                [new Filter("request_id", FilterOperator.EQ, sRequestId)],
                {
                    $$groupId: "$direct",
                    $select: "request_id,purchase_requisition,purchase_requisition_item,purchase_order,status,bapi_message"
                }
            );

            let oResult = null;
            for (let iAttempt = 0; iAttempt < 6; iAttempt += 1) {
                await this._wait(800);
                oBinding.refresh();
                const aContexts = await oBinding.requestContexts(0, 1);
                if (aContexts.length > 0) {
                    oResult = aContexts[0].getObject();
                    if (["CREATED", "ERROR"].includes(String(oResult.status || "").toUpperCase())) {
                        break;
                    }
                }
            }
            return oResult;
        },

        onSubmitPRConversion: async function () {
            const oDataModel = this.getView().getModel("prConvert");
            const oData = oDataModel.getData();
            const nQuantity = this._parseQuantity(oData.quantity);
            const nPrice = this._parseQuantity(oData.price);

            if (!oData.vendor || !oData.purchOrg || !oData.purchGroup || !oData.companyCode) {
                MessageBox.error("Vendor and purchasing organization data are required.");
                return;
            }
            if (nQuantity <= 0 || nPrice <= 0) {
                MessageBox.error("Open Quantity and Net Price must be greater than zero.");
                return;
            }

            const oButton = this.byId("submitPRConversionButton");
            oButton.setBusy(true);
            this.getView().getModel("mrp").setProperty("/busy", true);

            try {
                const oModel = this.getOwnerComponent().getModel();
                const oList = oModel.bindList("/ZP_G7_PO_REQUEST", undefined, undefined, undefined, {
                    $$updateGroupId: "$direct"
                });
                const oContext = oList.create({
                    vendor: oData.vendor,
                    vendor_name: oData.vendorName || "",
                    material: oData.material,
                    material_description: oData.description || "",
                    quantity: nQuantity.toFixed(3),
                    unit: oData.unit,
                    price: nPrice.toFixed(2),
                    currency: oData.currency || "VND",
                    delivery_date: oData.deliveryDate,
                    company_code: oData.companyCode,
                    plant: oData.plant,
                    storage_loc: oData.storageLocation || "RM01",
                    purch_org: oData.purchOrg,
                    purch_group: oData.purchGroup,
                    purchase_requisition: oData.purchaseRequisition,
                    purchase_requisition_item: oData.prItem
                });

                await oContext.created();
                const sRequestId = oContext.getProperty("request_id") || "";
                const oAction = oModel.bindContext(
                    "com.sap.gateway.srvd.zsd_g7_canteen.v0001.CreatePurchaseOrderFromPR(...)",
                    oContext
                );
                await oAction.execute("$direct");

                const oResult = await this._readPOConversionResult(sRequestId);
                const sStatus = String((oResult && oResult.status) || "").toUpperCase();
                const sPO = (oResult && oResult.purchase_order) || "";
                const sMessage = (oResult && oResult.bapi_message) || "";

                if (sStatus === "CREATED" && sPO) {
                    this._prConversionDialog.close();
                    this.byId("purchaseRequisitionsTable").removeSelections(true);
                    this.onRefresh();
                    MessageBox.success("Purchase Order " + sPO + " was created successfully." +
                        (sMessage ? "\n\n" + sMessage : ""));
                } else {
                    MessageBox.error(sMessage || "SAP did not return a Purchase Order number.");
                }
            } catch (oError) {
                MessageBox.error(oError.message || "Could not convert the Purchase Requisition.");
            } finally {
                oButton.setBusy(false);
                this.getView().getModel("mrp").setProperty("/busy", false);
            }
        },

        _wait: function (iMilliseconds) {
            return new Promise(function (resolve) {
                setTimeout(resolve, iMilliseconds);
            });
        },

        _confirmConversion: function (oPlannedOrder) {
            return new Promise(function (resolve) {
                MessageBox.confirm(
                    "Convert Planned Order " + oPlannedOrder.PlannedOrder +
                    " to a Production Order?\n\n" +
                    "Material: " + oPlannedOrder.Material + "\n" +
                    "Quantity: " + oPlannedOrder.PlannedOrderQuantity + " " + oPlannedOrder.Unit + "\n" +
                    "Plant: " + oPlannedOrder.Plant,
                    {
                        title: "Convert Planned Order",
                        emphasizedAction: MessageBox.Action.OK,
                        onClose: function (sAction) {
                            resolve(sAction === MessageBox.Action.OK);
                        }
                    }
                );
            });
        },

        _readConversionResult: async function (sRequestId) {
            const oModel = this.getOwnerComponent().getModel();
            const oBinding = oModel.bindList(
                "/ProductionOrderRequests",
                undefined,
                undefined,
                [new Filter("request_id", FilterOperator.EQ, sRequestId)],
                {
                    $$groupId: "$direct",
                    $select: "request_id,planned_order,production_order,status,bapi_message"
                }
            );

            let oResult = null;

            for (let iAttempt = 0; iAttempt < 6; iAttempt += 1) {
                await this._wait(800);
                oBinding.refresh();
                const aContexts = await oBinding.requestContexts(0, 1);

                if (aContexts.length > 0) {
                    oResult = aContexts[0].getObject();
                    const sStatus = String(oResult.status || "").toUpperCase();
                    if (sStatus === "CREATED" || sStatus === "CONVERSION_ERROR") {
                        break;
                    }
                }
            }

            return oResult;
        },

        onConvertPlannedOrder: async function () {
            const oTable = this.byId("plannedOrdersTable");
            const oSelectedItem = oTable.getSelectedItem();

            if (!oSelectedItem) {
                MessageBox.warning("Select one Planned Order first.");
                return;
            }

            const oSourceContext = oSelectedItem.getBindingContext();
            const oPlannedOrder = oSourceContext && oSourceContext.getObject();

            if (!oPlannedOrder || !oPlannedOrder.PlannedOrder) {
                MessageBox.error("The selected Planned Order could not be read.");
                return;
            }

            if (!await this._confirmConversion(oPlannedOrder)) {
                return;
            }

            const oMRPModel = this.getView().getModel("mrp");
            oMRPModel.setProperty("/busy", true);

            try {
                const oModel = this.getOwnerComponent().getModel();
                const oRequestList = oModel.bindList(
                    "/ProductionOrderRequests",
                    undefined,
                    undefined,
                    undefined,
                    { $$updateGroupId: "$direct" }
                );

                const oRequestContext = oRequestList.create({
                    material: oPlannedOrder.Material,
                    plant: oPlannedOrder.Plant,
                    order_quantity: String(oPlannedOrder.PlannedOrderQuantity),
                    unit: oPlannedOrder.Unit,
                    order_type: "PP01",
                    planned_order: oPlannedOrder.PlannedOrder
                });

                await oRequestContext.created();

                const sRequestId = oRequestContext.getProperty("request_id") || "";
                const oAction = oModel.bindContext(
                    "com.sap.gateway.srvd.zsd_g7_canteen.v0001.ConvertPlannedOrder(...)",
                    oRequestContext
                );

                await oAction.execute("$direct");

                const oResult = await this._readConversionResult(sRequestId);
                const sStatus = String((oResult && oResult.status) || "").toUpperCase();
                const sProductionOrder = (oResult && oResult.production_order) || "";
                const sMessage = (oResult && oResult.bapi_message) || "";

                if (sStatus === "CREATED" && sProductionOrder) {
                    oTable.removeSelections(true);
                    this.onRefresh();
                    MessageBox.success(
                        "Production Order " + sProductionOrder + " was created successfully." +
                        (sMessage ? "\n\n" + sMessage : "")
                    );
                } else {
                    MessageBox.error(sMessage || "SAP did not return a Production Order number.");
                }
            } catch (oError) {
                MessageBox.error(oError.message || "Could not convert the Planned Order.");
            } finally {
                oMRPModel.setProperty("/busy", false);
            }
        },

        formatDate: function (vDate) {
            if (!vDate) { return "-"; }
            const oDate = vDate instanceof Date ? vDate : new Date(String(vDate) + "T00:00:00");
            return Number.isNaN(oDate.getTime()) ? String(vDate) : oDate.toLocaleDateString("vi-VN");
        },

        formatPRStatus: function (sStatus) {
            const sValue = String(sStatus || "").toUpperCase();
            if (!sValue) { return "Open"; }
            return sValue;
        },

        formatPRState: function (sStatus) {
            const sValue = String(sStatus || "").toUpperCase();
            if (["05", "COMPLETED", "CLOSED"].includes(sValue)) { return "Success"; }
            if (["08", "REJECTED", "ERROR"].includes(sValue)) { return "Error"; }
            return "Warning";
        },

        formatPRHighlight: function (sStatus) {
            return this.formatPRState(sStatus);
        },

        _parseQuantity: function (vQuantity) {
            if (typeof vQuantity === "number") {
                return vQuantity;
            }

            let sValue = String(vQuantity || "0").trim();
            if (sValue.includes(",") && sValue.includes(".")) {
                sValue = sValue.replace(/,/g, "");
            } else if (sValue.includes(",")) {
                sValue = sValue.replace(",", ".");
            }

            const nValue = Number(sValue);
            return Number.isFinite(nValue) ? nValue : 0;
        },

        formatOpenQuantityState: function (vQuantity) {
            return this._parseQuantity(vQuantity) > 0 ? "Success" : "Error";
        },

        _isClosed: function (vClosed) {
            const sValue = String(vClosed || "").trim().toUpperCase();
            return vClosed === true || sValue === "X" || sValue === "TRUE";
        },

        formatClosedText: function (vClosed) {
            return this._isClosed(vClosed) ? "Closed" : "Open";
        },

        formatClosedState: function (vClosed) {
            return this._isClosed(vClosed) ? "Error" : "Success";
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
