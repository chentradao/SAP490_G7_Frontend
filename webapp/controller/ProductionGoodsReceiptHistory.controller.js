/*
 * Controller ProductionGoodsReceiptHistory.controller: điều phối trạng thái, sự kiện giao diện và các lời gọi backend của màn hình.
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

    return Controller.extend("sap490g7fioriapp.controller.ProductionGoodsReceiptHistory", {
        /** Khởi tạo model trạng thái và đăng ký các sự kiện điều hướng của màn hình. */
        onInit: function () {
            this.getOwnerComponent().getRouter().getRoute("RouteProductionGoodsReceiptHistory")
                .attachPatternMatched(this._onRouteMatched, this);
        },

        /** Kiểm tra quyền truy cập và chuẩn bị dữ liệu mỗi khi route được mở. */
        _onRouteMatched: function () {
            const oSession = this.getOwnerComponent().getModel("session");
            const sRole = String(oSession && oSession.getProperty("/role") || "").toUpperCase();
            const bCanAccess = Boolean(oSession && oSession.getProperty("/isLoggedIn") &&
                (sRole === "STAFF" || sRole === "ADMIN"));
            if (!bCanAccess) {
                MessageBox.warning("Only STAFF or ADMIN can access Production Goods Receipt History.");
                this.getOwnerComponent().getRouter().navTo("RouteLogin", {}, true);
                return;
            }
            this._applyFilters("");
            this.onRefresh();
        },

        /** Xử lý sự kiện Search từ giao diện người dùng. */
        onSearch: function (oEvent) {
            this._applyFilters((oEvent.getParameter("query") || oEvent.getParameter("newValue") || "").trim());
        },

        /** Hàm nội bộ thực hiện apply Filters. */
        _applyFilters: function (sQuery) {
            const oBinding = this.byId("productionGoodsReceiptHistoryTable").getBinding("items");
            if (!oBinding) {
                return;
            }
            const aFilters = [new Filter("goods_receipt_status", FilterOperator.EQ, "POSTED")];
            if (sQuery) {
                aFilters.push(new Filter({
                    filters: [
                        new Filter("gr_material_document", FilterOperator.EQ, sQuery),
                        new Filter("production_order", FilterOperator.EQ, sQuery),
                        new Filter("material", FilterOperator.EQ, sQuery.toUpperCase())
                    ],
                    and: false
                }));
            }
            oBinding.filter(new Filter({ filters: aFilters, and: true }));
        },

        /** Xử lý sự kiện Clear từ giao diện người dùng. */
        onClear: function () {
            this.byId("productionGRSearch").setValue("");
            this._applyFilters("");
        },

        /** Tải lại dữ liệu mới nhất cho các binding đang hiển thị. */
        onRefresh: function () {
            const oBinding = this.byId("productionGoodsReceiptHistoryTable").getBinding("items");
            if (oBinding) {
                oBinding.refresh();
            }
        },

        /** Định dạng Date Time trước khi hiển thị trên giao diện. */
        formatDateTime: function (vDate) {
            if (!vDate) {
                return "-";
            }
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
