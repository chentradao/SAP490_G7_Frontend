/*
 * Controller GRHistory.controller: điều phối trạng thái, sự kiện giao diện và các lời gọi backend của màn hình.
 * Các hàm on... là event handler; các hàm bắt đầu bằng _ là helper chỉ dùng nội bộ controller.
 */
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageBox"
], function (Controller, History, Filter, FilterOperator, MessageBox) {
    "use strict";

    return Controller.extend("sap490g7fioriapp.controller.GRHistory", {
        /** Khởi tạo model trạng thái và đăng ký các sự kiện điều hướng của màn hình. */
        onInit: function () {
            this.getOwnerComponent().getRouter().getRoute("RouteGRHistory")
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
                MessageBox.warning("Only STAFF or ADMIN can access Goods Receipt History.");
                this.getOwnerComponent().getRouter().navTo("RouteLogin", {}, true);
                return;
            }

            this.onClearFilters();
            this.onRefresh();
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
            const oSearch = this.byId("grHistorySearch");
            this._applyFilters(oSearch ? oSearch.getValue().trim() : "");
        },

        /** Hàm nội bộ thực hiện apply Filters. */
        _applyFilters: function (sQuery) {
            const oTable = this.byId("grHistoryTable");
            const oBinding = oTable && oTable.getBinding("items");
            if (!oBinding) {
                return;
            }

            const aFilters = [];
            const oStatus = this.byId("grStatusFilter");
            const sStatus = oStatus ? oStatus.getSelectedKey() : "ALL";

            if (sStatus !== "ALL") {
                aFilters.push(new Filter("status", FilterOperator.EQ, sStatus));
            }

            if (sQuery) {
                aFilters.push(new Filter({
                    filters: [
                        new Filter("material_document", FilterOperator.EQ, sQuery),
                        new Filter("purchase_order", FilterOperator.EQ, sQuery),
                        new Filter("material", FilterOperator.EQ, sQuery.toUpperCase()),
                        new Filter("plant", FilterOperator.EQ, sQuery.toUpperCase()),
                        new Filter("storage_loc", FilterOperator.EQ, sQuery.toUpperCase())
                    ],
                    and: false
                }));
            }

            oBinding.filter(aFilters.length > 0
                ? new Filter({ filters: aFilters, and: true })
                : []);
        },

        /** Xử lý sự kiện Clear Filters từ giao diện người dùng. */
        onClearFilters: function () {
            const oSearch = this.byId("grHistorySearch");
            const oStatus = this.byId("grStatusFilter");

            if (oSearch) {
                oSearch.setValue("");
            }
            if (oStatus) {
                oStatus.setSelectedKey("ALL");
            }

            this._applyFilters("");
        },

        /** Tải lại dữ liệu mới nhất cho các binding đang hiển thị. */
        onRefresh: function () {
            const oTable = this.byId("grHistoryTable");
            const oBinding = oTable && oTable.getBinding("items");
            if (oBinding) {
                oBinding.refresh();
            }
        },

        /** Xử lý sự kiện Retry Goods Receipt từ giao diện người dùng. */
        onRetryGoodsReceipt: async function (oEvent) {
            const oButton = oEvent.getSource();
            const oContext = oButton.getBindingContext();
            const sRequestId = oContext && oContext.getProperty("request_id");

            if (!oContext || !sRequestId) {
                MessageBox.error("Goods Receipt Request context is missing.");
                return;
            }

            const bConfirmed = await new Promise(function (resolve) {
                MessageBox.confirm(
                    "Retry Goods Receipt Request " + sRequestId + "?",
                    {
                        title: "Retry Goods Receipt",
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
                const oAction = this.getOwnerComponent().getModel().bindContext(
                    "com.sap.gateway.srvd.zsd_g7_canteen.v0001.PostGoodsReceipt(...)",
                    oContext,
                    { $$groupId: "$direct" }
                );
                await oAction.execute("$direct");
                await oContext.refresh();
                this.onRefresh();

                const sStatus = String(oContext.getProperty("status") || "").toUpperCase();
                const sMessage = oContext.getProperty("bapi_message") || "";
                if (sStatus === "POSTED") {
                    MessageBox.success("Goods Receipt was posted successfully.");
                } else if (sStatus === "ERROR") {
                    MessageBox.error(sMessage || "Goods Receipt retry failed.");
                } else {
                    MessageBox.information("Goods Receipt is being processed. Refresh the history shortly.");
                }
            } catch (oError) {
                MessageBox.error(oError.message || "Could not retry the Goods Receipt.");
            } finally {
                oButton.setBusy(false);
            }
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

        /** Định dạng State trước khi hiển thị trên giao diện. */
        formatState: function (sStatus) {
            if (sStatus === "POSTED") {
                return "Success";
            }
            if (sStatus === "ERROR") {
                return "Error";
            }
            return "Warning";
        },

        /** Định dạng Status Text trước khi hiển thị trên giao diện. */
        formatStatusText: function (sStatus) {
            const sValue = String(sStatus || "").trim().toUpperCase();
            const mText = {
                POSTED: "Successfully Posted",
                ERROR: "Posting Failed",
                PENDING: "Waiting for SAP"
            };
            return mText[sValue] || sStatus || "Waiting for SAP";
        },

        /** Định dạng Highlight trước khi hiển thị trên giao diện. */
        formatHighlight: function (sStatus) {
            return this.formatState(sStatus);
        },

        /** Điều hướng về màn hình trước hoặc màn hình mặc định khi không có lịch sử. */
        onNavBack: function () {
            const sPreviousHash = History.getInstance().getPreviousHash();
            if (sPreviousHash !== undefined) {
                window.history.go(-1);
                return;
            }
            this.getOwnerComponent().getRouter().navTo("RoutePOHistory", {}, true);
        }
    });
});
