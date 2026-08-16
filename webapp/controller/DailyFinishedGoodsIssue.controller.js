/*
 * Controller DailyFinishedGoodsIssue.controller: điều phối trạng thái, sự kiện giao diện và các lời gọi backend của màn hình.
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

    return Controller.extend("sap490g7fioriapp.controller.DailyFinishedGoodsIssue", {
        /** Khởi tạo model trạng thái và đăng ký các sự kiện điều hướng của màn hình. */
        onInit: function () {
            const oToday = new Date();
            const sToday = this._formatDate(oToday);

            this.getView().setModel(new JSONModel({
                salesDate: sToday,
                postingDate: sToday,
                minimumPostingDate: oToday,
                busy: false,
                items: [],
                orderCount: 0,
                materialCount: 0,
                selectedCount: 0,
                issuedItemCount: 0,
                resultVisible: false,
                resultState: "None",
                resultText: "",
                materialDocument: "",
                materialDocumentYear: ""
            }), "dailyGI");

            this.getOwnerComponent().getRouter()
                .getRoute("RouteDailyFinishedGoodsIssue")
                .attachPatternMatched(this._onRouteMatched, this);
        },

        /** Định dạng Date trước khi hiển thị trên giao diện. */
        _formatDate: function (oDate) {
            return [
                oDate.getFullYear(),
                String(oDate.getMonth() + 1).padStart(2, "0"),
                String(oDate.getDate()).padStart(2, "0")
            ].join("-");
        },

        /** Hàm nội bộ thực hiện compact Date. */
        _compactDate: function (sDate) {
            return String(sDate || "").replaceAll("-", "");
        },

        /** Kiểm tra quyền truy cập và chuẩn bị dữ liệu mỗi khi route được mở. */
        _onRouteMatched: function () {
            const oSession = this.getOwnerComponent().getModel("session");
            const sRole = String(oSession && oSession.getProperty("/role") || "").toUpperCase();
            const bAllowed = Boolean(
                oSession && oSession.getProperty("/isLoggedIn") &&
                (sRole === "STAFF" || sRole === "ADMIN")
            );

            if (!bAllowed) {
                MessageBox.warning("Only STAFF or ADMIN can post daily finished goods issue.");
                this.getOwnerComponent().getRouter().navTo("RouteLogin", {}, true);
                return;
            }

            this.onPreview();
        },

        /** Đọc Objects từ backend. */
        _requestObjects: async function (sPath, mParameters, aFilters) {
            const oModel = this.getOwnerComponent().getModel();
            const oBinding = oModel.bindList(
                sPath,
                undefined,
                undefined,
                aFilters || [],
                Object.assign({ $$groupId: "$direct" }, mParameters || {})
            );
            const aContexts = await oBinding.requestContexts(0, 1000);
            return aContexts.map(function (oContext) {
                return oContext.getObject();
            });
        },

        /** Xử lý sự kiện Preview từ giao diện người dùng. */
        onPreview: async function () {
            const oState = this.getView().getModel("dailyGI");
            const sSalesDate = oState.getProperty("/salesDate");

            if (!sSalesDate) {
                MessageBox.warning("Select a sales date.");
                return;
            }

            oState.setProperty("/busy", true);
            oState.setProperty("/resultVisible", false);

            try {
                const aResults = await Promise.all([
                    this._requestObjects(
                        "/Orders",
                        {
                            $select: "OrderID,OrderDate,OrderStatus,PaymentStatus",
                            $expand: "_Items($select=OrderID,ItemNo,FoodID,FoodName,Quantity,ItemStatus)"
                        },
                        [
                            new Filter("OrderDate", FilterOperator.EQ, this._compactDate(sSalesDate)),
                            new Filter("PaymentStatus", FilterOperator.EQ, "PAID")
                        ]
                    ),
                    this._requestObjects(
                        "/FinishedGoodsStock",
                        {
                            $select: "Material,MaterialDescription,MaterialBaseUnit,StockQuantity"
                        }
                    )
                ]);

                const aOrders = aResults[0].filter(function (oOrder) {
                    return ["CONFIRMED", "COMPLETED"].includes(
                        String(oOrder.OrderStatus || "").toUpperCase()
                    );
                });
                const mStock = new Map(aResults[1].map(function (oStock) {
                    return [String(oStock.Material || ""), oStock];
                }));
                const mSold = new Map();
                let iIssuedItemCount = 0;

                aOrders.forEach(function (oOrder) {
                    (oOrder._Items || []).forEach(function (oItem) {
                        if (String(oItem.ItemStatus || "").toUpperCase() === "GI_POSTED") {
                            iIssuedItemCount += 1;
                            return;
                        }

                        const sMaterial = String(oItem.FoodID || "");
                        const iQuantity = Number(oItem.Quantity || 0);
                        if (!sMaterial || sMaterial < "FG00009" || iQuantity <= 0) {
                            return;
                        }

                        const oCurrent = mSold.get(sMaterial) || {
                            material: sMaterial,
                            description: oItem.FoodName || sMaterial,
                            soldQuantity: 0
                        };
                        oCurrent.soldQuantity += iQuantity;
                        mSold.set(sMaterial, oCurrent);
                    });
                });

                const aItems = Array.from(mSold.values()).map(function (oSold) {
                    const oStock = mStock.get(oSold.material) || {};
                    const fStock = Number(oStock.StockQuantity || 0);
                    const fAfter = fStock - oSold.soldQuantity;
                    return Object.assign(oSold, {
                        description: oStock.MaterialDescription || oSold.description,
                        unit: oStock.MaterialBaseUnit || "EA",
                        currentStock: fStock,
                        remainingStock: fAfter,
                        shortage: fAfter < 0
                    });
                }).sort(function (a, b) {
                    return a.material.localeCompare(b.material);
                });

                oState.setProperty("/items", aItems);
                oState.setProperty("/orderCount", aOrders.length);
                oState.setProperty("/materialCount", aItems.length);
                oState.setProperty("/selectedCount", 0);
                oState.setProperty("/issuedItemCount", iIssuedItemCount);
                this.byId("dailyFinishedGoodsIssueTable").removeSelections(true);
            } catch (oError) {
                console.error("Daily FG goods issue preview failed:", oError);
                MessageBox.error(oError.message || "Could not prepare the daily goods issue preview.");
            } finally {
                oState.setProperty("/busy", false);
            }
        },

        /** Xử lý sự kiện Post Goods Issue từ giao diện người dùng. */
        onPostGoodsIssue: async function () {
            const oState = this.getView().getModel("dailyGI");
            const aItems = oState.getProperty("/items") || [];
            const aSelectedItems = this.byId("dailyFinishedGoodsIssueTable")
                .getSelectedItems()
                .map(function (oListItem) {
                    return oListItem.getBindingContext("dailyGI").getObject();
                });
            const sSalesDate = oState.getProperty("/salesDate");
            const sPostingDate = oState.getProperty("/postingDate");

            if (!sSalesDate || !sPostingDate) {
                MessageBox.warning("Sales date and posting date are required.");
                return;
            }
            if (aItems.length === 0) {
                MessageBox.information("No unissued paid and confirmed sales remain for this date.");
                return;
            }
            if (aSelectedItems.length === 0) {
                MessageBox.warning("Select at least one finished good to issue.");
                return;
            }
            if (aSelectedItems.some(function (oItem) { return oItem.shortage; })) {
                MessageBox.error("FG01 stock is insufficient for one or more selected materials.");
                return;
            }

            const bConfirmed = await new Promise(function (resolve) {
                MessageBox.confirm(
                    "Post movement 201 from P001/FG01 for " +
                    aSelectedItems.length + " selected finished goods?\n\n" +
                    "Sales date: " + sSalesDate + "\n" +
                    "Posting date: " + sPostingDate + "\n" +
                    "Cost center: ZCAN001\n\n" +
                    "This creates a real SAP Material Document.",
                    {
                        title: "Post Daily Finished Goods Issue",
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

            oState.setProperty("/busy", true);

            try {
                const oModel = this.getOwnerComponent().getModel();
                const oAction = oModel.bindContext(
                    "/Orders/com.sap.gateway.srvd.zsd_g7_canteen.v0001.postDailyFGGoodsIssue(...)",
                    undefined,
                    { $$groupId: "$direct" }
                );
                oAction.setParameter("SalesDate", sSalesDate);
                oAction.setParameter("PostingDate", sPostingDate);
                oAction.setParameter("Materials", aSelectedItems.map(function (oItem) {
                    return oItem.material;
                }).join(","));

                await oAction.execute();

                const oResultContext = oAction.getBoundContext();
                const oResult = oResultContext ? oResultContext.getObject() : {};
                const bSuccess = String(oResult.Success || "").toUpperCase() === "X";

                oState.setProperty("/resultVisible", true);
                oState.setProperty("/resultState", bSuccess ? "Success" : "Error");
                oState.setProperty("/resultText", oResult.Message || "SAP returned no message.");
                oState.setProperty("/materialDocument", oResult.MaterialDocument || "");
                oState.setProperty("/materialDocumentYear", oResult.MaterialDocumentYear || "");

                if (bSuccess) {
                    oModel.refresh();
                    MessageBox.success(
                        "Daily FG Goods Issue posted successfully.\n\n" +
                        "Material Document: " + oResult.MaterialDocument +
                        "\nYear: " + oResult.MaterialDocumentYear
                    );
                    await this.onPreview();
                } else {
                    MessageBox.error(oResult.Message || "SAP did not post the goods issue.");
                }
            } catch (oError) {
                console.error("Daily FG goods issue failed:", oError);
                MessageBox.error(oError.message || "Could not post daily finished goods issue.");
            } finally {
                oState.setProperty("/busy", false);
            }
        },

        /** Xử lý sự kiện Material Selection Change từ giao diện người dùng. */
        onMaterialSelectionChange: function () {
            const iSelectedCount = this.byId("dailyFinishedGoodsIssueTable")
                .getSelectedItems().length;
            this.getView().getModel("dailyGI").setProperty("/selectedCount", iSelectedCount);
        },

        /** Định dạng Quantity trước khi hiển thị trên giao diện. */
        formatQuantity: function (vQuantity) {
            const fQuantity = Number(vQuantity || 0);
            return fQuantity.toLocaleString("vi-VN", {
                minimumFractionDigits: 3,
                maximumFractionDigits: 3
            });
        },

        /** Định dạng Remaining State trước khi hiển thị trên giao diện. */
        formatRemainingState: function (vRemaining) {
            return Number(vRemaining || 0) < 0 ? "Error" : "Success";
        },

        /** Điều hướng về màn hình trước hoặc màn hình mặc định khi không có lịch sử. */
        onNavBack: function () {
            this.getOwnerComponent().getRouter().navTo("RouteStaffDashboard", {}, true);
        }
    });
});
