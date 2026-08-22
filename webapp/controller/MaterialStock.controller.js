/*
 * Controller MaterialStock.controller: điều phối trạng thái, sự kiện giao diện và các lời gọi backend của màn hình.
 * Các hàm on... là event handler; các hàm bắt đầu bằng _ là helper chỉ dùng nội bộ controller.
 */
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageBox",
    "sap/m/SelectDialog",
    "sap/m/StandardListItem"
], function (
    Controller,
    JSONModel,
    Filter,
    FilterOperator,
    MessageBox,
    SelectDialog,
    StandardListItem
) {
    "use strict";

    return Controller.extend("sap490g7fioriapp.controller.MaterialStock", {

        // =========================================================
        // INIT
        // =========================================================
        onInit: function () {
            const oToday = new Date();
            const sToday = [
                oToday.getFullYear(),
                String(oToday.getMonth() + 1).padStart(2, "0"),
                String(oToday.getDate()).padStart(2, "0")
            ].join("-");

            const oUiModel = new JSONModel({
                busy: false,

                material: "",
                description: "",
                plant: "",
                storageLoc: "",
                unit: "",
                stock: "",
                reservedStock: "",
                availableStock: "",
                reorderPoint: "",

                vendor: "",
                vendorName: "",
                quantity: "",
                price: "",
                currency: "",
                deliveryDate: sToday,
                minimumDeliveryDate: oToday,

                companyCode: "PT01",
                purchOrg: "",
                purchGroup: ""
            });

            this.getView().setModel(oUiModel, "ui");
            this.getView().setModel(new JSONModel({
                busy: false,
                items: [],
                plantOptions: [{ key: "All", text: "All Plants" }],
                storageOptions: [{ key: "All", text: "All Storage Loc." }],
                unitOptions: [{ key: "All", text: "All Units" }]
            }), "stock");

            this.getOwnerComponent()
                .getRouter()
                .getRoute("RouteMaterialStock")
                .attachPatternMatched(this._onRouteMatched, this);
        },


        /** Kiểm tra quyền truy cập và chuẩn bị dữ liệu mỗi khi route được mở. */
        _onRouteMatched: function () {

            const oSession = this.getOwnerComponent().getModel("session");
            const bIsLoggedIn = Boolean(
                oSession && oSession.getProperty("/isLoggedIn")
            );
            const sRole = (
                oSession && oSession.getProperty("/role") || ""
            ).toUpperCase();

            if (bIsLoggedIn && (sRole === "STAFF" || sRole === "ADMIN")) {
                this._refreshStockData();
                return;
            }

            MessageBox.warning("Only STAFF or ADMIN can access Material Stock.");

            let sTargetRoute = "RouteLogin";

            if (bIsLoggedIn && sRole === "EMPLOYEE") {
                sTargetRoute = "RouteCart";
            }

            this.getOwnerComponent()
                .getRouter()
                .navTo(sTargetRoute, {}, true);
        },


        // =========================================================
        // SEARCH MATERIAL
        // =========================================================
        onSearchMaterial: function () {
            this._applyFilters();
        },


        /** Xử lý sự kiện Filter Change từ giao diện người dùng. */
        onFilterChange: function () {
            this._applyFilters();
        },


        /** Hàm nội bộ thực hiện apply Filters. */
        _applyFilters: function () {

            const oTable = this.byId("stockTable");

            if (!oTable) {
                return;
            }

            const oBinding = oTable.getBinding("items");

            if (!oBinding) {
                return;
            }

            const aFilters = [];
            // -----------------------------------------------------
            // Material search
            // -----------------------------------------------------
            const oSearchField =
                this.byId("materialSearchField");

            if (oSearchField) {

                const sQuery =
                    oSearchField.getValue().trim();

                if (sQuery) {

                    aFilters.push(
                        new Filter({
                            filters: [
                                new Filter(
                                    "Material",
                                    FilterOperator.Contains,
                                    sQuery
                                ),
                                new Filter(
                                    "MaterialDescription",
                                    FilterOperator.Contains,
                                    sQuery
                                )
                            ],
                            and: false
                        })
                    );
                }
            }


            // -----------------------------------------------------
            // Plant filter
            // -----------------------------------------------------
            const oPlantFilter =
                this.byId("plantFilter");

            if (oPlantFilter) {

                const sPlant =
                    oPlantFilter.getSelectedKey();

                if (sPlant && sPlant !== "All") {

                    aFilters.push(
                        new Filter(
                            "Plant",
                            FilterOperator.EQ,
                            sPlant
                        )
                    );
                }
            }


            // -----------------------------------------------------
            // Storage Location filter
            // -----------------------------------------------------
            const oStorageFilter =
                this.byId("storageLocFilter");

            if (oStorageFilter) {

                const sStorageLoc =
                    oStorageFilter.getSelectedKey();

                if (sStorageLoc && sStorageLoc !== "All") {

                    aFilters.push(
                        new Filter(
                            "StorageLocation",
                            FilterOperator.EQ,
                            sStorageLoc
                        )
                    );
                }
            }

            const oUnitFilter = this.byId("unitFilter");
            if (oUnitFilter) {
                const sUnit = oUnitFilter.getSelectedKey();
                if (sUnit && sUnit !== "All") {
                    aFilters.push(new Filter(
                        "MaterialBaseUnit",
                        FilterOperator.EQ,
                        sUnit
                    ));
                }
            }

            const oStatusFilter = this.byId("stockStatusFilter");
            if (oStatusFilter) {
                const sStatus = oStatusFilter.getSelectedKey();
                if (sStatus && sStatus !== "All") {
                    aFilters.push(new Filter(
                        "StockStatusKey",
                        FilterOperator.EQ,
                        sStatus
                    ));
                }
            }

            oBinding.filter(aFilters);
        },


        /** Xử lý sự kiện Clear Filters từ giao diện người dùng. */
        onClearFilters: function () {
            this.byId("materialSearchField").setValue("");
            this.byId("plantFilter").setSelectedKey("All");
            this.byId("storageLocFilter").setSelectedKey("All");
            this.byId("unitFilter").setSelectedKey("All");
            this.byId("stockStatusFilter").setSelectedKey("All");
            this._applyFilters();
        },

        /** Xử lý sự kiện Refresh Stock từ giao diện người dùng. */
        onRefreshStock: function () {
            this._refreshStockData();
        },


        /** Hàm nội bộ thực hiện refresh Stock Data. */
        _refreshStockData: async function () {
            const oStockModel = this.getView().getModel("stock");
            const sRequestUrl =
                "/sap/opu/odata4/sap/zsb_g7_canteen/" +
                "srvd/sap/zsd_g7_canteen/0001/" +
                "RawStock?$select=" +
                "Material,Plant,StorageLocation,MaterialBaseUnit," +
                "MaterialDescription,StockQuantity,ReservedQuantity," +
                "AvailableQuantity,ReorderPoint&$orderby=Material";

            oStockModel.setProperty("/busy", true);

            try {
                const oResponse = await fetch(sRequestUrl, {
                    method: "GET",
                    credentials: "same-origin",
                    cache: "no-store",
                    headers: {
                        Accept: "application/json"
                    }
                });

                if (!oResponse.ok) {
                    throw new Error(
                        "RawStock request failed with HTTP " + oResponse.status
                    );
                }

                const oPayload = await oResponse.json();

                const aItems = (Array.isArray(oPayload.value) ? oPayload.value : []).map(function (oItem) {
                    const sStatus = this.formatStockStatus(
                        oItem.AvailableQuantity,
                        oItem.ReorderPoint
                    );
                    return Object.assign({}, oItem, {
                        StockStatusKey: sStatus === "Out of Stock"
                            ? "OUT"
                            : (sStatus === "Low Stock" ? "LOW" : "AVAILABLE")
                    });
                }, this);

                oStockModel.setProperty("/items", aItems);
                oStockModel.setProperty(
                    "/plantOptions",
                    this._buildFilterOptions(aItems, "Plant", "All Plants", "Plant ")
                );
                oStockModel.setProperty(
                    "/storageOptions",
                    this._buildFilterOptions(aItems, "StorageLocation", "All Storage Loc.", "Storage ")
                );
                oStockModel.setProperty(
                    "/unitOptions",
                    this._buildFilterOptions(aItems, "MaterialBaseUnit", "All Units", "Unit ")
                );

                this._applyFilters();
            } catch (oError) {
                console.error("Could not load RawStock:", oError);
                MessageBox.error(
                    "Could not load raw material stock.\n\n" +
                    (oError.message || String(oError))
                );
            } finally {
                oStockModel.setProperty("/busy", false);
            }
        },

        _buildFilterOptions: function (aItems, sProperty, sAllText, sPrefix) {
            const aValues = Array.from(new Set(aItems.map(function (oItem) {
                return String(oItem[sProperty] || "").trim();
            }).filter(Boolean))).sort();

            return [{ key: "All", text: sAllText }].concat(aValues.map(function (sValue) {
                return {
                    key: sValue,
                    text: sPrefix + sValue
                };
            }));
        },


        // =========================================================
        // FORMAT QUANTITY
        // =========================================================
        formatQuantity: function (vQuantity) {

            const fQuantity = Number(vQuantity);

            if (!Number.isFinite(fQuantity)) {
                return "0,000";
            }

            return fQuantity.toLocaleString("vi-VN", {
                minimumFractionDigits: 3,
                maximumFractionDigits: 3
            });
        },


        /** Định dạng Stock Status trước khi hiển thị trên giao diện. */
        formatStockStatus: function (vAvailable, vReorderPoint) {
            const fAvailable = Number(vAvailable);
            const fReorderPoint = Number(vReorderPoint);

            if (!Number.isFinite(fAvailable) || fAvailable <= 0) {
                return "Out of Stock";
            }

            if (Number.isFinite(fReorderPoint) &&
                fReorderPoint > 0 &&
                fAvailable < fReorderPoint) {
                return "Low Stock";
            }

            return "Available";
        },


        /** Định dạng Stock State trước khi hiển thị trên giao diện. */
        formatStockState: function (vAvailable, vReorderPoint) {
            const sStatus = this.formatStockStatus(vAvailable, vReorderPoint);

            if (sStatus === "Out of Stock") {
                return "Error";
            }

            return sStatus === "Low Stock" ? "Warning" : "Success";
        },


        /** Định dạng Stock Highlight trước khi hiển thị trên giao diện. */
        formatStockHighlight: function (vAvailable, vReorderPoint) {
            const sStatus = this.formatStockStatus(vAvailable, vReorderPoint);

            if (sStatus === "Out of Stock") {
                return "Error";
            }

            return sStatus === "Low Stock" ? "Warning" : "None";
        },


        /** Định dạng Total Amount trước khi hiển thị trên giao diện. */
        formatTotalAmount: function (vQuantity, vPrice) {
            const fQuantity = Number(String(vQuantity || 0).replace(",", "."));
            const fPrice = Number(String(vPrice || 0).replace(",", "."));
            const fTotal = fQuantity * fPrice;

            if (!Number.isFinite(fTotal)) {
                return "0";
            }

            return fTotal.toLocaleString("en-US", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
            });
        },


        // =========================================================
        // CREATE PO FROM RAW STOCK ROW
        // =========================================================
        onCreatePOForRow: function (oEvent) {

            const oButton =
                oEvent.getSource();

            const oContext =
                oButton.getBindingContext("stock");

            if (!oContext) {

                MessageBox.error(
                    "Could not read material information."
                );

                return;
            }


            const oStock =
                oContext.getObject();

            const oUiModel =
                this.getView().getModel("ui");


            // -----------------------------------------------------
            // Material information
            // -----------------------------------------------------
            oUiModel.setProperty(
                "/material",
                oStock.Material || ""
            );

            oUiModel.setProperty(
                "/description",
                oStock.MaterialDescription || ""
            );

            oUiModel.setProperty(
                "/plant",
                oStock.Plant || ""
            );

            oUiModel.setProperty(
                "/storageLoc",
                oStock.StorageLocation || ""
            );

            oUiModel.setProperty(
                "/unit",
                oStock.MaterialBaseUnit || ""
            );

            oUiModel.setProperty(
                "/stock",
                oStock.StockQuantity || ""
            );

            oUiModel.setProperty(
                "/reservedStock",
                oStock.ReservedQuantity || "0"
            );

            oUiModel.setProperty(
                "/availableStock",
                oStock.AvailableQuantity || "0"
            );

            oUiModel.setProperty(
                "/reorderPoint",
                oStock.ReorderPoint || "0"
            );


            // -----------------------------------------------------
            // Reset PO fields
            // -----------------------------------------------------
            oUiModel.setProperty("/vendor", "50000004");
            oUiModel.setProperty("/vendorName", "");
            oUiModel.setProperty("/quantity", "");
            oUiModel.setProperty("/price", "");
            oUiModel.setProperty("/currency", "VND");
            oUiModel.setProperty("/purchOrg", "P324");
            oUiModel.setProperty("/purchGroup", "324");
            oUiModel.setProperty("/deliveryDate", this._formatDateForOData(new Date()));


            this.byId("createPODialog").open();
        },


        // =========================================================
        // CANCEL
        // =========================================================
        onCancelPOForm: function () {
            this.byId("createPODialog").close();
        },


        // =========================================================
        // VALUE HELPS AND DATE HELPERS
        // =========================================================
        _formatDateForOData: function (oDate) {
            return [
                oDate.getFullYear(),
                String(oDate.getMonth() + 1).padStart(2, "0"),
                String(oDate.getDate()).padStart(2, "0")
            ].join("-");
        },

        /** Hàm nội bộ thực hiện open Value Help. */
        _openValueHelp: function (mConfig) {
            const oDialog = new SelectDialog({
                title: mConfig.title,
                noDataText: "No matching values found",
                search: function (oEvent) {
                    const sValue = (oEvent.getParameter("value") || "").trim();
                    const aFilters = (mConfig.baseFilters || []).slice();

                    if (sValue) {
                        aFilters.push(new Filter({
                            filters: [
                                new Filter(mConfig.keyField, FilterOperator.Contains, sValue),
                                new Filter(mConfig.textField, FilterOperator.Contains, sValue)
                            ],
                            and: false
                        }));
                    }

                    const oItemsBinding = oDialog.getBinding("items");
                    if (oItemsBinding) {
                        oItemsBinding.filter(aFilters);
                    }
                },
                confirm: function (oEvent) {
                    const oItem = oEvent.getParameter("selectedItem");
                    const oContext = oItem && oItem.getBindingContext();

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
                filters: mConfig.baseFilters || [],
                template: new StandardListItem({
                    title: "{" + mConfig.keyField + "}",
                    description: "{" + mConfig.textField + "}"
                })
            });

            this.getView().addDependent(oDialog);
            oDialog.open();
        },

        /** Xử lý sự kiện Vendor Value Help từ giao diện người dùng. */
        onVendorValueHelp: function () {
            const oUiModel = this.getView().getModel("ui");
            const sPurchOrg = oUiModel.getProperty("/purchOrg");
            const aBaseFilters = sPurchOrg
                ? [new Filter("PurchasingOrganization", FilterOperator.EQ, sPurchOrg)]
                : [];

            this._openValueHelp({
                title: "Select Vendor",
                path: "/VendorVH",
                keyField: "Vendor",
                textField: "VendorName",
                baseFilters: aBaseFilters,
                onSelect: function (oVendor) {
                    oUiModel.setProperty("/vendor", oVendor.Vendor || "");
                    oUiModel.setProperty("/vendorName", oVendor.VendorName || "");
                }
            });
        },

        /** Xử lý sự kiện Purch Org Value Help từ giao diện người dùng. */
        onPurchOrgValueHelp: function () {
            const oUiModel = this.getView().getModel("ui");

            this._openValueHelp({
                title: "Select Purchasing Organization",
                path: "/PurchasingOrganizationVH",
                keyField: "PurchasingOrganization",
                textField: "PurchasingOrganizationName",
                onSelect: function (oPurchOrg) {
                    oUiModel.setProperty(
                        "/purchOrg",
                        oPurchOrg.PurchasingOrganization || ""
                    );
                    oUiModel.setProperty(
                        "/companyCode",
                        oPurchOrg.CompanyCode || "PT01"
                    );
                    oUiModel.setProperty("/vendor", "");
                    oUiModel.setProperty("/vendorName", "");
                }
            });
        },

        /** Xử lý sự kiện Purch Group Value Help từ giao diện người dùng. */
        onPurchGroupValueHelp: function () {
            const oUiModel = this.getView().getModel("ui");

            this._openValueHelp({
                title: "Select Purchasing Group",
                path: "/PurchasingGroupVH",
                keyField: "PurchasingGroup",
                textField: "PurchasingGroupName",
                onSelect: function (oPurchGroup) {
                    oUiModel.setProperty(
                        "/purchGroup",
                        oPurchGroup.PurchasingGroup || ""
                    );
                }
            });
        },


        // =========================================================
        // FORMAT DECIMAL
        // =========================================================
        _formatDecimal: function (sValue, iScale) {

            if (
                sValue === null ||
                sValue === undefined ||
                sValue === ""
            ) {
                return "0." + "0".repeat(iScale);
            }


            const sNumber =
                String(sValue)
                    .trim()
                    .replace(",", ".");


            const fNumber =
                Number(sNumber);


            if (!Number.isFinite(fNumber)) {
                return "0." + "0".repeat(iScale);
            }


            return fNumber.toFixed(iScale);
        },


        // =========================================================
        // CREATE PURCHASE ORDER
        // =========================================================
        onCreatePOConfirm: async function () {

            const oUiModel =
                this.getView().getModel("ui");

            const oData =
                oUiModel.getData();


            // =====================================================
            // VALIDATION
            // =====================================================

            if (!oData.vendor) {

                MessageBox.warning(
                    "Please enter a vendor."
                );

                return;
            }

            const sVendor = String(oData.vendor).trim();

            if (!/^\d{8,10}$/.test(sVendor)) {
                MessageBox.warning(
                    "Vendor phai gom tu 8 den 10 chu so. Vi du: 50000004."
                );

                return;
            }


            if (!oData.quantity) {

                MessageBox.warning(
                    "Please enter a quantity."
                );

                return;
            }


            if (!oData.price) {

                MessageBox.warning(
                    "Please enter a price."
                );

                return;
            }


            if (!oData.currency) {

                MessageBox.warning(
                    "Please enter a currency."
                );

                return;
            }


            if (!oData.deliveryDate) {
                MessageBox.warning("Please choose a delivery date.");
                return;
            }

            const sToday = this._formatDateForOData(new Date());
            if (oData.deliveryDate < sToday) {
                MessageBox.warning("Delivery date cannot be earlier than today.");
                return;
            }


            if (!oData.purchOrg) {

                MessageBox.warning(
                    "Please enter a purchasing organization."
                );

                return;
            }


            if (!oData.purchGroup) {

                MessageBox.warning(
                    "Please enter a purchasing group."
                );

                return;
            }


            // =====================================================
            // NUMBER VALIDATION
            // =====================================================

            const fQuantity =
                Number(
                    String(oData.quantity)
                        .trim()
                        .replace(",", ".")
                );


            const fPrice =
                Number(
                    String(oData.price)
                        .trim()
                        .replace(",", ".")
                );


            if (
                !Number.isFinite(fQuantity) ||
                fQuantity <= 0
            ) {

                MessageBox.warning(
                    "Quantity must be greater than 0."
                );

                return;
            }


            if (
                !Number.isFinite(fPrice) ||
                fPrice <= 0
            ) {

                MessageBox.warning(
                    "Price must be greater than 0."
                );

                return;
            }


            // =====================================================
            // BUSY
            // =====================================================

            oUiModel.setProperty(
                "/busy",
                true
            );


            const oModel =
                this.getOwnerComponent().getModel();


            try {

                // =================================================
                // STEP 1
                // CREATE PO REQUEST
                // =================================================

                const oListBinding =
                    oModel.bindList(
                        "/ZP_G7_PO_REQUEST",
                        undefined,
                        undefined,
                        undefined,
                        {
                            $$updateGroupId: "$direct"
                        }
                    );


                /*
                 * KHÔNG gửi:
                 *
                 * request_id
                 * purchase_order
                 * status
                 *
                 * request_id:
                 * -> RAP managed numbering
                 *
                 * purchase_order:
                 * -> backend tạo
                 *
                 * status:
                 * -> backend cập nhật
                 */

                const oContext =
                    oListBinding.create({

                        vendor:
                            sVendor,

                        material:
                            String(oData.material)
                                .trim(),

                        quantity:
                            this._formatDecimal(
                                fQuantity,
                                3
                            ),

                        unit:
                            String(oData.unit)
                                .trim(),

                        price:
                            this._formatDecimal(
                                fPrice,
                                2
                            ),

                        currency:
                            String(oData.currency)
                                .trim()
                                .toUpperCase(),

                        delivery_date:
                            String(oData.deliveryDate)
                                .trim(),

                        company_code:
                            String(oData.companyCode || "PT01")
                                .trim()
                                .toUpperCase(),

                        plant:
                            String(oData.plant)
                                .trim(),

                        storage_loc:
                            String(oData.storageLoc)
                                .trim(),

                        purch_org:
                            String(oData.purchOrg)
                                .trim(),

                        purch_group:
                            String(oData.purchGroup)
                                .trim()
                    });


                console.log(
                    "Creating PO Request...",
                    oContext
                );


                // =================================================
                // STEP 2
                // WAIT CREATE
                // =================================================

                await oContext.created();


                const oCreatedData =
                    oContext.getObject();


                console.log(
                    "PO Request created:",
                    oCreatedData
                );


                // =================================================
                // STEP 3
                // GET GENERATED REQUEST ID
                // =================================================

                const sRequestId =
                    oContext.getProperty(
                        "request_id"
                    );


                if (!sRequestId) {

                    throw new Error(
                        "RAP did not return request_id after creating the request."
                    );
                }


                console.log(
                    "Generated request_id:",
                    sRequestId
                );


                // =================================================
                // STEP 4
                // BIND BOUND ACTION
                // =================================================

                /*
                 * Metadata của bạn:
                 *
                 * Action Name="CreatePurchaseOrder"
                 * IsBound="true"
                 *
                 * Therefore the action must be called
                 * on the specific INSTANCE:
                 *
                 * ZC_G7_PO_REQUEST(<request_id>)
                 */

                const oActionBinding = oModel.bindContext(
                    "com.sap.gateway.srvd.zsd_g7_canteen.v0001.CreatePurchaseOrder(...)",
                    oContext
                );


                // =================================================
                // STEP 5
                // EXECUTE ACTION
                // =================================================

                console.log(
                    "Calling CreatePurchaseOrder..."
                );


                await oActionBinding.execute("$direct");


                console.log(
                    "CreatePurchaseOrder executed successfully."
                );


                // =================================================
                // STEP 6
                // GET RESULT
                // =================================================

                let sPurchaseOrder = "";

                const oPollBinding = oModel.bindList(
                    "/ZP_G7_PO_REQUEST",
                    undefined,
                    undefined,
                    [
                        new Filter(
                            "request_id",
                            FilterOperator.EQ,
                            sRequestId
                        )
                    ],
                    {
                        $$groupId: "$direct"
                    }
                );

                for (let iAttempt = 0; iAttempt < 5; iAttempt += 1) {
                    await new Promise(function (resolve) {
                        setTimeout(resolve, 1000);
                    });

                    oPollBinding.refresh();

                    const aRequestContexts =
                        await oPollBinding.requestContexts(0, 1);

                    if (aRequestContexts.length > 0) {
                        sPurchaseOrder =
                            aRequestContexts[0].getProperty("purchase_order") || "";
                    }

                    if (sPurchaseOrder) {
                        break;
                    }
                }


                // =================================================
                // STEP 7
                // CHECK PO
                // =================================================

                if (sPurchaseOrder) {

                    MessageBox.success(

                        "Purchase Order created successfully!\n\n" +
                        "PO Number: " +
                        sPurchaseOrder,

                        {

                            onClose: function () {

                                this._resetForm();

                            }.bind(this)

                        }
                    );

                } else {

                    MessageBox.information(
                        "The action ran, but SAP did not return a PO number."
                    );
                }


            } catch (oError) {

                console.error(
                    "Create PO Error:",
                    oError
                );


                let sMessage =
                    "Could not create Purchase Order.";


                if (
                    oError &&
                    oError.message
                ) {

                    sMessage +=
                        "\n\n" +
                        oError.message;
                }


                MessageBox.error(
                    sMessage
                );


            } finally {

                oUiModel.setProperty(
                    "/busy",
                    false
                );
            }
        },


        // =========================================================
        // RESET FORM
        // =========================================================
        _resetForm: function () {

            const oUiModel =
                this.getView().getModel("ui");


            this.byId("createPODialog").close();

            oUiModel.setProperty(
                "/vendor",
                ""
            );

            oUiModel.setProperty(
                "/quantity",
                ""
            );

            oUiModel.setProperty(
                "/price",
                ""
            );

            oUiModel.setProperty(
                "/currency",
                "VND"
            );

            oUiModel.setProperty(
                "/purchOrg",
                "P324"
            );

            oUiModel.setProperty(
                "/purchGroup",
                "324"
            );

            oUiModel.setProperty(
                "/deliveryDate",
                this._formatDateForOData(new Date())
            );
        },


        // =========================================================
        // NAVIGATION
        // =========================================================
        onOpenPOHistory: function () {

            this.getOwnerComponent()
                .getRouter()
                .navTo("RoutePOHistory");
        },

        /** Điều hướng về màn hình trước hoặc màn hình mặc định khi không có lịch sử. */
        onNavBack: function () {

            this.getOwnerComponent()
                .getRouter()
                .navTo("RouteStaffDashboard", {}, true);
        }

    });
});
