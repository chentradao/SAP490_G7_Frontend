/*
 * Controller DailyFinishedGoodsIssueHistory.controller: điều phối trạng thái, sự kiện giao diện và các lời gọi backend của màn hình.
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

    return Controller.extend("sap490g7fioriapp.controller.DailyFinishedGoodsIssueHistory", {
        /** Khởi tạo model trạng thái và đăng ký các sự kiện điều hướng của màn hình. */
        onInit: function () {
            this.getOwnerComponent().getRouter()
                .getRoute("RouteDailyFinishedGoodsIssueHistory")
                .attachPatternMatched(this._onRouteMatched, this);
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
                MessageBox.warning("Only STAFF or ADMIN can access Daily FG Goods Issue History.");
                this.getOwnerComponent().getRouter().navTo("RouteLogin", {}, true);
                return;
            }

            this.onClear();
            this.onRefresh();
        },

        /** Xử lý sự kiện Filter từ giao diện người dùng. */
        onFilter: function () {
            const oBinding = this.byId("dailyGIHistoryTable").getBinding("items");
            if (!oBinding) {
                return;
            }

            const sQuery = String(this.byId("dailyGIHistorySearch").getValue() || "").trim();
            const sPostingDate = this.byId("dailyGIHistoryDate").getValue();
            const sSource = this.byId("dailyGIHistorySource").getSelectedKey();
            const aFilters = [];

            if (sQuery) {
                aFilters.push(new Filter({
                    filters: [
                        new Filter("MaterialDocument", FilterOperator.Contains, sQuery),
                        new Filter("Material", FilterOperator.Contains, sQuery.toUpperCase()),
                        new Filter("MaterialDescription", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                }));
            }
            if (sPostingDate) {
                aFilters.push(new Filter("PostingDate", FilterOperator.EQ, sPostingDate));
            }
            if (sSource === "DAILY") {
                aFilters.push(new Filter("ItemText", FilterOperator.StartsWith, "Daily canteen sales"));
            } else if (sSource === "MANUAL") {
                aFilters.push(new Filter("ItemText", FilterOperator.EQ, ""));
            }

            oBinding.filter(aFilters.length ? new Filter({ filters: aFilters, and: true }) : []);
        },

        /** Xử lý sự kiện Clear từ giao diện người dùng. */
        onClear: function () {
            this.byId("dailyGIHistorySearch").setValue("");
            this.byId("dailyGIHistoryDate").setValue("");
            this.byId("dailyGIHistorySource").setSelectedKey("ALL");
            const oBinding = this.byId("dailyGIHistoryTable").getBinding("items");
            if (oBinding) {
                oBinding.filter([]);
            }
        },

        /** Tải lại dữ liệu mới nhất cho các binding đang hiển thị. */
        onRefresh: function () {
            const oBinding = this.byId("dailyGIHistoryTable").getBinding("items");
            if (oBinding) {
                oBinding.refresh();
            }
        },

        /** Định dạng Date trước khi hiển thị trên giao diện. */
        formatDate: function (vDate) {
            if (!vDate) { return "-"; }
            const oDate = vDate instanceof Date ? vDate : new Date(String(vDate) + "T00:00:00");
            return Number.isNaN(oDate.getTime()) ? String(vDate) : oDate.toLocaleDateString("vi-VN");
        },

        /** Định dạng Quantity trước khi hiển thị trên giao diện. */
        formatQuantity: function (vQuantity) {
            return Number(vQuantity || 0).toLocaleString("vi-VN", {
                minimumFractionDigits: 3,
                maximumFractionDigits: 3
            });
        },

        /** Định dạng Source trước khi hiển thị trên giao diện. */
        formatSource: function (sItemText) {
            return String(sItemText || "").startsWith("Daily canteen sales")
                ? "Daily Sales"
                : "Manual / Legacy";
        },

        /** Định dạng Source State trước khi hiển thị trên giao diện. */
        formatSourceState: function (sItemText) {
            return String(sItemText || "").startsWith("Daily canteen sales")
                ? "Success"
                : "Information";
        },

        /** Điều hướng về màn hình trước hoặc màn hình mặc định khi không có lịch sử. */
        onNavBack: function () {
            const sPreviousHash = History.getInstance().getPreviousHash();
            if (sPreviousHash !== undefined) {
                window.history.go(-1);
            } else {
                this.getOwnerComponent().getRouter().navTo("RouteStaffDashboard", {}, true);
            }
        }
    });
});
