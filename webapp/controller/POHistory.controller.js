/*
 * Controller POHistory.controller: điều phối trạng thái, sự kiện giao diện và các lời gọi backend của màn hình.
 * Các hàm on... là event handler; các hàm bắt đầu bằng _ là helper chỉ dùng nội bộ controller.
 */
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageBox"
], function (Controller, History, JSONModel, Filter, FilterOperator, MessageBox) {
    "use strict";

    return Controller.extend("sap490g7fioriapp.controller.POHistory", {
        /** Khởi tạo model trạng thái và đăng ký các sự kiện điều hướng của màn hình. */
        onInit: function () {
            const oToday = new Date();
            const sToday = this._formatDateForOData(oToday);

            this.getView().setModel(new JSONModel({
                busy: false,
                purchaseOrder: "",
                purchaseOrderItem: "00010",
                material: "",
                materialDescription: "",
                plant: "",
                storageLoc: "",
                unit: "",
                quantity: "",
                postingDate: sToday,
                documentDate: sToday,
                minimumPostingDate: oToday
            }), "gr");

            this.getView().setModel(new JSONModel({
                busy: false,
                groups: []
            }), "poGroups");

            if (!this.getOwnerComponent().getModel("poSuccess")) {
                this.getOwnerComponent().setModel(new JSONModel({
                    visible: false,
                    purchaseOrder: "",
                    materialCount: 0,
                    vendor: ""
                }), "poSuccess");
            }

            this.getOwnerComponent().getRouter().getRoute("RoutePOHistory")
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
                MessageBox.warning("Only STAFF or ADMIN can access PO History.");
                this.getOwnerComponent().getRouter().navTo("RouteLogin", {}, true);
                return;
            }

            const oSearchField = this.byId("poHistorySearch");
            if (oSearchField) {
                oSearchField.setValue("");
            }
            const oStatusFilter = this.byId("poStatusFilter");
            if (oStatusFilter) {
                oStatusFilter.setSelectedKey("ALL");
            }
            this._applyFilters("");
            this.onRefresh();
        },

        onOpenMRPResults: function () {
            this.getOwnerComponent().getRouter().navTo("RouteMRPResults");
        },

        /** Xử lý sự kiện Search từ giao diện người dùng. */
        onSearch: function (oEvent) {
            const sQuery = (
                oEvent.getParameter("query") ||
                oEvent.getParameter("newValue") ||
                ""
            ).trim();
            this._applyFilters(sQuery);
        },

        /** Xử lý sự kiện Status Change từ giao diện người dùng. */
        onStatusChange: function () {
            const oSearchField = this.byId("poHistorySearch");
            const sQuery = oSearchField ? oSearchField.getValue().trim() : "";
            this._applyFilters(sQuery);
        },

        /** Hàm nội bộ thực hiện apply Filters. */
        _applyFilters: function (sQuery) {
            const oStatusFilter = this.byId("poStatusFilter");
            const sStatus = oStatusFilter ? oStatusFilter.getSelectedKey() : "ALL";
            this._loadPOGroups(sQuery, sStatus);
        },

        /** Xử lý sự kiện Clear Filters từ giao diện người dùng. */
        onClearFilters: function () {
            this.byId("poHistorySearch").setValue("");
            this.byId("poStatusFilter").setSelectedKey("ALL");
            this._applyFilters("");
        },

        /** Tải lại dữ liệu mới nhất cho các binding đang hiển thị. */
        onRefresh: function () {
            const oSearchField = this.byId("poHistorySearch");
            const oStatusFilter = this.byId("poStatusFilter");
            this._loadPOGroups(
                oSearchField ? oSearchField.getValue().trim() : "",
                oStatusFilter ? oStatusFilter.getSelectedKey() : "ALL"
            );
        },

        _formatForecastBatchCode: function (sBatchId, vDate) {
            if (!sBatchId) {
                return "MANUAL";
            }
            const sDate = String(vDate || "").slice(0, 10).replace(/-/g, "") || "UNKNOWN";
            const sShortId = String(sBatchId).replace(/-/g, "").slice(0, 8).toUpperCase();
            return "FORECAST-" + sDate + "-" + sShortId;
        },

        _loadPOGroups: async function (sQuery, sStatus) {
            const oGroupsModel = this.getView().getModel("poGroups");
            const oModel = this.getOwnerComponent().getModel();
            oGroupsModel.setProperty("/busy", true);

            try {
                const oPOBinding = oModel.bindList(
                    "/ZP_G7_PO_REQUEST",
                    undefined,
                    undefined,
                    undefined,
                    { $$groupId: "$direct" }
                );
                const oOverviewBinding = oModel.bindList(
                    "/POReceivingOverview",
                    undefined,
                    undefined,
                    undefined,
                    { $$groupId: "$direct" }
                );

                const aResults = await Promise.all([
                    oPOBinding.requestContexts(0, 5000),
                    oOverviewBinding.requestContexts(0, 5000)
                ]);

                const mOverview = {};
                aResults[1].forEach(function (oContext) {
                    const oItem = oContext.getObject();
                    mOverview[oItem.request_id] = oItem;
                });

                const sNormalizedQuery = String(sQuery || "").trim().toUpperCase();
                const mGroups = {};

                aResults[0].forEach(function (oContext) {
                    const oPO = Object.assign({}, oContext.getObject());
                    const oOverview = mOverview[oPO.request_id] || {};
                    const sDerivedStatus = oPO.purchase_order
                        ? "CREATED"
                        : (String(oPO.status || "").toUpperCase() === "ERROR" ? "ERROR" : "PENDING");

                    if (sStatus && sStatus !== "ALL" && sStatus !== sDerivedStatus) {
                        return;
                    }

                    const sSearchText = [
                        oPO.purchase_order,
                        oPO.material,
                        oPO.material_description,
                        oPO.vendor,
                        oPO.vendor_name,
                        oPO.purchase_requisition
                    ].join(" ").toUpperCase();

                    if (sNormalizedQuery && sSearchText.indexOf(sNormalizedQuery) === -1) {
                        return;
                    }

                    const oItem = Object.assign({}, oPO, oOverview, {
                        ordered_quantity: oOverview.ordered_quantity !== undefined
                            ? oOverview.ordered_quantity
                            : oPO.quantity,
                        received_quantity: oOverview.received_quantity || 0,
                        remaining_quantity: oOverview.remaining_quantity !== undefined
                            ? oOverview.remaining_quantity
                            : oPO.quantity,
                        purchase_order_item: oOverview.purchase_order_item || ""
                    });
                    const sGroupKey = oPO.purchase_order || ("REQUEST-" + oPO.request_id);

                    if (!mGroups[sGroupKey]) {
                        mGroups[sGroupKey] = {
                            key: sGroupKey,
                            purchaseOrder: oPO.purchase_order || "Not generated",
                            batchId: oPO.batch_id || "",
                            batchCode: oPO.batch_id
                                ? this._formatForecastBatchCode(
                                    oPO.batch_id,
                                    oPO.delivery_date || oPO.created_at
                                )
                                : (oPO.purchase_requisition ? "LEGACY · NO BATCH" : "MANUAL"),
                            vendor: oPO.vendor || "-",
                            createdAt: oPO.created_at || "",
                            statusText: sDerivedStatus,
                            statusState: sDerivedStatus === "CREATED"
                                ? "Success"
                                : (sDerivedStatus === "ERROR" ? "Error" : "Warning"),
                            items: []
                        };
                    }

                    const bDuplicatePOItem = Boolean(oItem.purchase_order_item) &&
                        mGroups[sGroupKey].items.some(function (oExistingItem) {
                            return String(oExistingItem.purchase_order_item) === String(oItem.purchase_order_item);
                        });

                    if (!bDuplicatePOItem) {
                        mGroups[sGroupKey].items.push(oItem);
                    }
                }, this);

                const aGroups = Object.keys(mGroups).map(function (sKey) {
                    const oGroup = mGroups[sKey];
                    oGroup.items.sort(function (a, b) {
                        return String(a.purchase_order_item || "").localeCompare(String(b.purchase_order_item || ""));
                    });
                    oGroup.itemCount = oGroup.items.length;
                    oGroup.remainingItemCount = oGroup.items.filter(function (oItem) {
                        return Number(oItem.remaining_quantity || 0) > 0 && Boolean(oItem.purchase_order_item);
                    }).length;
                    return oGroup;
                }).sort(function (a, b) {
                    return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
                });

                oGroupsModel.setProperty("/groups", aGroups);
            } catch (oError) {
                MessageBox.error(oError.message || "Could not load grouped Purchase Orders.");
            } finally {
                oGroupsModel.setProperty("/busy", false);
            }
        },

        /** Định dạng Status trước khi hiển thị trên giao diện. */
        formatStatus: function (sPurchaseOrder, sStatus) {
            return sPurchaseOrder ? "CREATED" : (sStatus || "PENDING");
        },

        /** Định dạng Status State trước khi hiển thị trên giao diện. */
        formatStatusState: function (sPurchaseOrder, sStatus) {
            if (sPurchaseOrder) {
                return "Success";
            }
            return sStatus === "ERROR" ? "Error" : "Warning";
        },

        /** Định dạng Purchase Source trước khi hiển thị trên giao diện. */
        formatPurchaseSource: function (sPurchaseRequisition) {
            return sPurchaseRequisition ? "From MRP PR" : "Manual";
        },

        /** Định dạng Date trước khi hiển thị trên giao diện. */
        formatDate: function (vDate) {
            if (!vDate) {
                return "-";
            }

            const oDate = vDate instanceof Date
                ? vDate
                : new Date(String(vDate).length === 10
                    ? String(vDate) + "T00:00:00"
                    : vDate);

            if (Number.isNaN(oDate.getTime())) {
                return String(vDate);
            }

            return oDate.toLocaleDateString("vi-VN");
        },

        /** Định dạng Date Time trước khi hiển thị trên giao diện. */
        formatDateTime: function (vDateTime) {
            if (!vDateTime) {
                return "-";
            }

            const oDate = vDateTime instanceof Date
                ? vDateTime
                : new Date(vDateTime);

            if (Number.isNaN(oDate.getTime())) {
                return String(vDateTime);
            }

            return oDate.toLocaleString("vi-VN", {
                dateStyle: "short",
                timeStyle: "short"
            });
        },

        /** Định dạng Remaining State trước khi hiển thị trên giao diện. */
        formatRemainingState: function (vRemaining) {
            const fRemaining = Number(vRemaining || 0);
            return fRemaining <= 0 ? "Error" : "Success";
        },

        /** Định dạng Date For O Data trước khi hiển thị trên giao diện. */
        _formatDateForOData: function (oDate) {
            return [
                oDate.getFullYear(),
                String(oDate.getMonth() + 1).padStart(2, "0"),
                String(oDate.getDate()).padStart(2, "0")
            ].join("-");
        },

        /** Định dạng Quantity trước khi hiển thị trên giao diện. */
        _formatQuantity: function (vValue) {
            const fValue = Number(String(vValue || "").trim().replace(",", "."));
            return Number.isFinite(fValue) ? fValue.toFixed(3) : "0.000";
        },

        /** Định dạng Total Amount trước khi hiển thị trên giao diện. */
        formatTotalAmount: function (vQuantity, vPrice) {
            const fQuantity = Number(vQuantity || 0);
            const fPrice = Number(vPrice || 0);
            const fTotal = fQuantity * fPrice;

            if (!Number.isFinite(fTotal)) {
                return "0";
            }

            return fTotal.toLocaleString("en-US", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
            });
        },

        /** Định dạng Price trước khi hiển thị trên giao diện. */
        formatPrice: function (vPrice) {
            var fPrice = Number(vPrice);
            return Number.isFinite(fPrice) ? fPrice.toLocaleString("en-US", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
            }) : "0";
        },

        /** Xử lý sự kiện Open PO Details từ giao diện người dùng. */
        onOpenPODetails: function (oEvent) {
            const oContext = oEvent.getSource().getBindingContext();
            const oDialog = this.byId("poDetailsDialog");

            if (oContext && oDialog) {
                oDialog.setBindingContext(oContext);
                oDialog.open();
            }
        },

        /** Xử lý sự kiện Close PO Details từ giao diện người dùng. */
        onClosePODetails: function () {
            this.byId("poDetailsDialog").close();
        },

        onOpenSingleGR: function (oEvent) {
            const oContext = oEvent.getSource().getBindingContext("poGroups");
            const oItem = oContext && oContext.getObject();

            if (!oItem || !oItem.purchase_order || !oItem.purchase_order_item) {
                MessageBox.warning("Purchase Order item data is incomplete.");
                return;
            }

            const oToday = new Date();
            const sToday = this._formatDateForOData(oToday);
            const fRemaining = Number(oItem.remaining_quantity || 0);

            if (fRemaining <= 0) {
                MessageBox.information("This Purchase Order item has already been received in full.");
                return;
            }

            this.getView().getModel("gr").setData({
                busy: false,
                purchaseOrder: oItem.purchase_order,
                purchaseOrderItem: oItem.purchase_order_item,
                batchId: oItem.batch_id || "",
                mrpRunId: oItem.mrp_run_id || "",
                mrpRunItemNo: oItem.mrp_run_item_no || "",
                batchCode: oItem.batch_id
                    ? this._formatForecastBatchCode(
                        oItem.batch_id,
                        oItem.delivery_date || oItem.created_at
                    )
                    : (oItem.purchase_requisition ? "LEGACY · NO BATCH" : "MANUAL"),
                material: oItem.material || "",
                materialDescription: oItem.material_description || "",
                plant: oItem.plant || "",
                storageLoc: oItem.storage_loc || "",
                unit: oItem.unit || "",
                quantity: String(fRemaining),
                orderedQuantity: oItem.ordered_quantity || "0",
                receivedQuantity: oItem.received_quantity || "0",
                remainingQuantity: oItem.remaining_quantity || "0",
                postingDate: sToday,
                documentDate: sToday,
                minimumPostingDate: oToday
            });

            this.byId("postGRDialog").open();
        },

        onPostBatchGR: async function (oEvent) {
            const oContext = oEvent.getSource().getBindingContext("poGroups");
            const oGroup = oContext && oContext.getObject();
            const aItems = oGroup && Array.isArray(oGroup.items)
                ? oGroup.items.filter(function (oItem) {
                    return Number(oItem.remaining_quantity || 0) > 0 && Boolean(oItem.purchase_order_item);
                })
                : [];

            if (!oGroup || !oGroup.purchaseOrder || !aItems.length) {
                MessageBox.information("This Purchase Order has no open item available for Goods Receipt.");
                return;
            }

            const bConfirmed = await new Promise(function (resolve) {
                MessageBox.confirm(
                    "Forecast Batch: " + (oGroup.batchCode || "MANUAL") + "\n" +
                    "Batch ID: " + (oGroup.batchId || "-") + "\n" +
                    "Purchase Order: " + oGroup.purchaseOrder + "\n" +
                    "Open items: " + aItems.length + "\n\n" +
                    aItems.map(function (oItem) {
                        return "• Item " + oItem.purchase_order_item + " — " +
                            oItem.material + " — " + oItem.remaining_quantity + " " + oItem.unit;
                    }).join("\n") +
                    "\n\nPost Goods Receipt for all open items?",
                    {
                        title: "Post GR for Entire PO",
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

            const oGroupsModel = this.getView().getModel("poGroups");
            const oModel = this.getOwnerComponent().getModel();
            const oToday = new Date();
            const sToday = this._formatDateForOData(oToday);
            oGroupsModel.setProperty("/busy", true);

            try {
                const oList = oModel.bindList(
                    "/GoodsReceiptRequests",
                    undefined,
                    undefined,
                    undefined,
                    { $$updateGroupId: "$direct" }
                );
                const aContexts = aItems.map(function (oItem) {
                    return oList.create({
                        batch_id: oItem.batch_id || "",
                        mrp_run_id: oItem.mrp_run_id || "",
                        mrp_run_item_no: oItem.mrp_run_item_no || "",
                        purchase_order: oItem.purchase_order,
                        purchase_order_item: oItem.purchase_order_item,
                        material: oItem.material,
                        plant: oItem.plant,
                        storage_loc: oItem.storage_loc,
                        gr_quantity: this._formatQuantity(oItem.remaining_quantity),
                        unit: oItem.unit,
                        movement_type: "101",
                        posting_date: sToday,
                        document_date: sToday
                    });
                }, this);

                await Promise.all(aContexts.map(function (oGRContext) {
                    return oGRContext.created();
                }));

                const sRequestIDs = aContexts.map(function (oGRContext) {
                    return oGRContext.getProperty("request_id") || "";
                }).filter(Boolean).join(",");

                if (!sRequestIDs) {
                    throw new Error("SAP did not return Goods Receipt Request IDs.");
                }

                const oCollectionContext = oList.getHeaderContext();
                if (!oCollectionContext) {
                    throw new Error("Could not bind the Goods Receipt Request collection.");
                }

                const oAction = oModel.bindContext(
                    "com.sap.gateway.srvd.zsd_g7_canteen.v0001.PostGoodsReceiptBatch(...)",
                    oCollectionContext
                );
                oAction.setParameter("RequestIDs", sRequestIDs);
                await oAction.execute("$direct");

                const oResultContext = oAction.getBoundContext();
                const oResult = oResultContext && oResultContext.getObject();
                const bSuccess = Boolean(oResult && (oResult.Success || oResult.success));
                const sMaterialDocument = oResult && (oResult.MaterialDocument || oResult.materialDocument) || "";
                const sDocumentYear = oResult && (oResult.DocumentYear || oResult.documentYear) || "";
                const sMessage = oResult && (oResult.Message || oResult.message) || "";

                oModel.refresh();
                await this._loadPOGroups("", "ALL");

                if (bSuccess && sMaterialDocument) {
                    MessageBox.success(
                        "Forecast Batch: " + (oGroup.batchCode || "MANUAL") + "\n" +
                        "Batch ID: " + (oGroup.batchId || "-") + "\n" +
                        "Purchase Order: " + oGroup.purchaseOrder + "\n\n" +
                        "Goods Receipt posted successfully.\n\nMaterial Document: " +
                        sMaterialDocument + (sDocumentYear ? "/" + sDocumentYear : "") +
                        "\nItems received: " + aItems.length,
                        { title: "Entire PO Received" }
                    );
                } else {
                    MessageBox.error(sMessage || "Batch Goods Receipt was not posted.");
                }
            } catch (oError) {
                MessageBox.error(oError.message || "Could not post Goods Receipt for the entire Purchase Order.");
            } finally {
                oGroupsModel.setProperty("/busy", false);
            }
        },

        /** Xử lý sự kiện Open GR Dialog từ giao diện người dùng. */
        onOpenGRDialog: async function () {
            const oPOContext = this.byId("poDetailsDialog").getBindingContext();
            const oPO = oPOContext && oPOContext.getObject();

            if (!oPO || !oPO.purchase_order) {
                MessageBox.warning("Please select a created Purchase Order first.");
                return;
            }

            const oToday = new Date();
            const sToday = this._formatDateForOData(oToday);
            const oGRModel = this.getView().getModel("gr");

            oGRModel.setData({
                busy: false,
                purchaseOrder: oPO.purchase_order,
                purchaseOrderItem: "00010",
                batchId: oPO.batch_id || "",
                mrpRunId: oPO.mrp_run_id || "",
                mrpRunItemNo: oPO.mrp_run_item_no || "",
                batchCode: oPO.batch_id
                    ? this._formatForecastBatchCode(
                        oPO.batch_id,
                        oPO.delivery_date || oPO.created_at
                    )
                    : (oPO.purchase_requisition ? "LEGACY · NO BATCH" : "MANUAL"),
                material: oPO.material || "",
                materialDescription: oPO.material_description || "",
                plant: oPO.plant || "",
                storageLoc: oPO.storage_loc || "",
                unit: oPO.unit || "",
                quantity: "",
                orderedQuantity: oPO.quantity || "0",
                receivedQuantity: "0",
                remainingQuantity: oPO.quantity || "0",
                postingDate: sToday,
                documentDate: sToday,
                minimumPostingDate: oToday
            });

            this.byId("postGRDialog").open();

            // Load authoritative quantities from the backend overview.
            try {
                const oOverviewBinding = this.getOwnerComponent().getModel().bindList(
                    "/POReceivingOverview",
                    undefined,
                    undefined,
                    [
                        new Filter("purchase_order", FilterOperator.EQ, oPO.purchase_order),
                        new Filter("material", FilterOperator.EQ, oPO.material || ""),
                        new Filter("plant", FilterOperator.EQ, oPO.plant || ""),
                        new Filter("storage_loc", FilterOperator.EQ, oPO.storage_loc || "")
                    ],
                    { $groupId: "$direct" }
                );
                const aOverviewContexts = await oOverviewBinding.requestContexts(0, 1);

                if (aOverviewContexts.length > 0) {
                    const oOverview = aOverviewContexts[0];
                    oGRModel.setProperty("/orderedQuantity", oOverview.getProperty("ordered_quantity") || "0");
                    oGRModel.setProperty("/receivedQuantity", oOverview.getProperty("received_quantity") || "0");
                    oGRModel.setProperty("/remainingQuantity", oOverview.getProperty("remaining_quantity") || "0");

                    if (Number(oOverview.getProperty("remaining_quantity") || 0) <= 0) {
                        this.byId("postGRDialog").close();
                        MessageBox.information("This Purchase Order item has already been received in full.");
                    }
                }
            } catch (oError) {
                console.warn("Unable to load PO receiving overview", oError);
            }
        },

        /** Xử lý sự kiện Close GR Dialog từ giao diện người dùng. */
        onCloseGRDialog: function () {
            this.byId("postGRDialog").close();
        },

        /** Xử lý sự kiện Post GR Confirm từ giao diện người dùng. */
        onPostGRConfirm: async function () {
            const oGRModel = this.getView().getModel("gr");
            const oGR = oGRModel.getData();
            const fQuantity = Number(String(oGR.quantity || "").trim().replace(",", "."));

            if (!Number.isFinite(fQuantity) || fQuantity <= 0) {
                MessageBox.warning("Please enter a valid received quantity greater than zero.");
                return;
            }

            const fRemaining = Number(String(oGR.remainingQuantity || "").replace(",", "."));
            if (Number.isFinite(fRemaining) && fRemaining >= 0 && fQuantity > fRemaining) {
                MessageBox.warning(
                    "Received quantity cannot exceed the remaining quantity of " +
                    fRemaining + " " + oGR.unit + "."
                );
                return;
            }

            if (!oGR.postingDate || !oGR.documentDate) {
                MessageBox.warning("Please select Posting Date and Document Date.");
                return;
            }

            oGRModel.setProperty("/busy", true);

            const oModel = this.getOwnerComponent().getModel();

            try {
                const oListBinding = oModel.bindList(
                    "/GoodsReceiptRequests",
                    undefined,
                    undefined,
                    undefined,
                    { $$updateGroupId: "$direct" }
                );

                const oGRContext = oListBinding.create({
                    batch_id: oGR.batchId || "",
                    mrp_run_id: oGR.mrpRunId || "",
                    mrp_run_item_no: oGR.mrpRunItemNo || "",
                    purchase_order: oGR.purchaseOrder,
                    purchase_order_item: oGR.purchaseOrderItem,
                    material: oGR.material,
                    plant: oGR.plant,
                    storage_loc: oGR.storageLoc,
                    gr_quantity: this._formatQuantity(fQuantity),
                    unit: oGR.unit,
                    movement_type: "101",
                    posting_date: oGR.postingDate,
                    document_date: oGR.documentDate
                });

                await oGRContext.created();

                const sRequestId = oGRContext.getProperty("request_id");
                if (!sRequestId) {
                    throw new Error("SAP did not return a GR Request ID.");
                }

                const oActionBinding = oModel.bindContext(
                    "com.sap.gateway.srvd.zsd_g7_canteen.v0001.PostGoodsReceipt(...)",
                    oGRContext
                );

                await oActionBinding.execute("$direct");

                const oPollBinding = oModel.bindList(
                    "/GoodsReceiptRequests",
                    undefined,
                    undefined,
                    [new Filter("request_id", FilterOperator.EQ, sRequestId)],
                    { $$groupId: "$direct" }
                );

                let sMaterialDocument = "";
                let sStatus = "";
                let sBapiMessage = "";

                for (let iAttempt = 0; iAttempt < 15; iAttempt += 1) {
                    await new Promise(function (resolve) {
                        setTimeout(resolve, 1000);
                    });

                    oPollBinding.refresh();
                    const aContexts = await oPollBinding.requestContexts(0, 1);

                    if (aContexts.length > 0) {
                        sMaterialDocument = aContexts[0].getProperty("material_document") || "";
                        sStatus = aContexts[0].getProperty("status") || "";
                        sBapiMessage = aContexts[0].getProperty("bapi_message") || "";
                    }

                    if (sMaterialDocument || sStatus === "ERROR") {
                        break;
                    }
                }

                if (sMaterialDocument) {
                    this.onCloseGRDialog();
                    this.onClosePODetails();
                    oModel.refresh();
                    this.onRefresh();

                    MessageBox.success(
                        "Forecast Batch: " + (oGR.batchCode || "MANUAL") + "\n" +
                        "Batch ID: " + (oGR.batchId || "-") + "\n" +
                        "Purchase Order: " + oGR.purchaseOrder + "\n" +
                        "PO Item: " + oGR.purchaseOrderItem + "\n" +
                        "Material: " + oGR.material + "\n" +
                        "Quantity Received: " + fQuantity + " " + oGR.unit + "\n\n" +
                        "Material Document: " + sMaterialDocument,
                        { title: "Goods Receipt Posted" }
                    );
                } else {
                    MessageBox.error(
                        sBapiMessage || "Goods Receipt was not posted. Check the GR Request log in SAP."
                    );
                }
            } catch (oError) {
                MessageBox.error(
                    "Unable to post Goods Receipt.\n\n" +
                    (oError && oError.message ? oError.message : "Please check SAP Gateway and BAPI logs.")
                );
            } finally {
                oGRModel.setProperty("/busy", false);
            }
        },

        /** Điều hướng về màn hình trước hoặc màn hình mặc định khi không có lịch sử. */
        onNavBack: function () {
            const sPreviousHash = History.getInstance().getPreviousHash();
            if (sPreviousHash !== undefined) {
                window.history.go(-1);
                return;
            }
            this.getOwnerComponent().getRouter().navTo("RouteMaterialStock", {}, true);
        },

        /** Xử lý sự kiện Open GR History từ giao diện người dùng. */
        onOpenGRHistory: function () {
            this.getOwnerComponent().getRouter().navTo("RouteGRHistory");
        }
    });
});
