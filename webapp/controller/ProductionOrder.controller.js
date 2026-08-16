/*
 * Controller ProductionOrder.controller: điều phối trạng thái, sự kiện giao diện và các lời gọi backend của màn hình.
 * Các hàm on... là event handler; các hàm bắt đầu bằng _ là helper chỉ dùng nội bộ controller.
 */
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageBox"
], function (Controller, JSONModel, Filter, FilterOperator, MessageBox) {
    "use strict";

    return Controller.extend("sap490g7fioriapp.controller.ProductionOrder", {
        /** Khởi tạo model trạng thái và đăng ký các sự kiện điều hướng của màn hình. */
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
                MessageBox.warning("Only STAFF or ADMIN can access Production Orders.");
                this.getOwnerComponent().getRouter().navTo("RouteLogin", {}, true);
            }
        },

        /** Điều hướng về màn hình trước hoặc màn hình mặc định khi không có lịch sử. */
        onNavBack: function () {
            this.getOwnerComponent().getRouter().navTo("RouteStaffDashboard", {}, true);
        },

        /** Xử lý sự kiện Open History từ giao diện người dùng. */
        onOpenHistory: function () {
            this.getOwnerComponent().getRouter().navTo("RouteProductionOrderHistory");
        },

        /** Xử lý sự kiện Refresh FG Stock từ giao diện người dùng. */
        onRefreshFGStock: async function () {
            const oSession = this.getOwnerComponent().getModel("session");
            const sRole = String(
                oSession && oSession.getProperty("/role") || ""
            ).toUpperCase();

            if (sRole !== "ADMIN") {
                MessageBox.warning("Only ADMIN can refresh finished-goods stock.");
                return;
            }

            const oButton = this.byId("refreshFGStockButton");
            const oTable = this.byId("fgTable");
            const oBinding = oTable && oTable.getBinding("items");

            if (oButton) {
                oButton.setBusy(true);
                oButton.setEnabled(false);
            }

            try {
                if (!oBinding) {
                    throw new Error("Finished-goods stock binding is not available.");
                }

                oBinding.refresh();
                await oBinding.requestContexts(0, 15);
                this.getView().getModel("ui").setProperty(
                    "/lastStockSyncText",
                    "Last refreshed: " + new Date().toLocaleString("vi-VN")
                );
                MessageBox.success("Finished-goods stock from P001/FG01 was refreshed.");
            } catch (oError) {
                console.error("Finished-goods stock refresh failed:", oError);
                MessageBox.error(oError.message || "Unable to refresh stock from P001/FG01.");
            } finally {
                if (oButton) {
                    oButton.setBusy(false);
                    oButton.setEnabled(true);
                }
            }
        },

        /** Xử lý sự kiện FG Selected từ giao diện người dùng. */
        onFGSelected: async function (oEvent) {
            const oItem = oEvent.getParameter("listItem");
            const oData = oItem.getBindingContext().getObject();
            const oUi = this.getView().getModel("ui");

            oUi.setProperty("/selectedMaterial", oData.Material);
            oUi.setProperty("/selectedDescription", oData.MaterialDescription || "");
            oUi.setProperty("/selectedStock", oData.StockQuantity || "0");
            oUi.setProperty("/selectedUnit", oData.MaterialBaseUnit || "EA");
            oUi.setProperty("/selectedPlant", oData.Plant || "P001");
            oUi.setProperty("/selectedStorage", "FG01");
            oUi.setProperty("/bom", []);
            oUi.setProperty("/canCreate", false);

            try {
                const oModel = this.getView().getModel();
                const oBinding = oModel.bindList("/FinishedGoodsBOM", null, null, [
                    new Filter("FinishedMaterial", FilterOperator.EQ, oData.Material),
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

        /** Xử lý sự kiện Order Quantity Change từ giao diện người dùng. */
        onOrderQuantityChange: function (oEvent) {
            const sValue = oEvent.getParameter("value");
            this.getView().getModel("ui").setProperty("/orderQuantity", sValue);
            this._recalculateMaterialAvailability();
        },

        /** Hàm nội bộ thực hiện recalculate Material Availability. */
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

        /** Định dạng Quantity trước khi hiển thị trên giao diện. */
        _formatQuantity: function (vQuantity) {
            return Number(vQuantity || 0).toLocaleString("en-US", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 3
            });
        },

        /** Xử lý sự kiện Create Production Order từ giao diện người dùng. */
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
