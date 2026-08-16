/*
 * Controller UserList.controller: điều phối trạng thái, sự kiện giao diện và các lời gọi backend của màn hình.
 * Các hàm on... là event handler; các hàm bắt đầu bằng _ là helper chỉ dùng nội bộ controller.
 */
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap490g7fioriapp/model/sessionUtils"
], function (Controller, sessionUtils) {
    "use strict";

    return Controller.extend("sap490g7fioriapp.controller.UserList", {

        /** Khởi tạo model trạng thái và đăng ký các sự kiện điều hướng của màn hình. */
        onInit: function () {
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("RouteUserList").attachPatternMatched(this._onRouteMatched, this);
        },

        /** Kiểm tra quyền truy cập và chuẩn bị dữ liệu mỗi khi route được mở. */
        _onRouteMatched: function () {
            var oSession = this.getOwnerComponent().getModel("session");
            if (!oSession || !oSession.getProperty("/isLoggedIn")) {
                // this.getOwnerComponent().getRouter().navTo("RouteLogin");
            }
        },

        /** Xử lý sự kiện Logout từ giao diện người dùng. */
        onLogout: function () {
            var oSession = this.getOwnerComponent().getModel("session");
            sessionUtils.resetSession(oSession);
            this.getOwnerComponent().getRouter().navTo("RouteLogin", {}, true);
        }
    });
});
