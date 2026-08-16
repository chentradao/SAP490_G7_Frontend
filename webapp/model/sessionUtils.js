/*
 * Module sessionUtils: tập trung logic model/tiện ích dùng lại để controller không lặp nghiệp vụ.
 */
sap.ui.define([], function () {
    "use strict";

    /** Tạo trạng thái phiên đăng nhập rỗng dùng khi khởi động hoặc đăng xuất. */
    function getInitialSessionData() {
        return {
            userId: null,
            cartId: null,
            cartItemCount: 0,
            username: "",
            fullName: "",
            role: "",
            roleId: "",
            status: "",
            isLoggedIn: false
        };
    }

    /** Chuẩn hóa role hiện tại về chữ hoa để các bước kiểm tra quyền dùng chung một format. */
    function getCurrentRole(oSessionModel) {
        return String(
            oSessionModel && (oSessionModel.getProperty("/roleId") || oSessionModel.getProperty("/role")) || ""
        ).toUpperCase();
    }

    /** Kiểm tra model session đã đại diện cho người dùng đăng nhập hay chưa. */
    function isLoggedIn(oSessionModel) {
        return Boolean(oSessionModel && oSessionModel.getProperty("/isLoggedIn"));
    }

    return {
        getInitialSessionData: getInitialSessionData,
        getCurrentRole: getCurrentRole,
        isLoggedIn: isLoggedIn,

        /** Thực hiện xử lý is Customer. */
        isCustomer: function (oSessionModel) {
            return ["EMPLOYEE", "CUSTOMER"].indexOf(getCurrentRole(oSessionModel)) !== -1;
        },

        /** Thực hiện xử lý is Staff Or Manager. */
        isStaffOrManager: function (oSessionModel) {
            return ["STAFF", "ADMIN", "MANAGER"].indexOf(getCurrentRole(oSessionModel)) !== -1;
        },

        /** Thực hiện xử lý reset Session. */
        resetSession: function (oSessionModel) {
            if (oSessionModel) {
                oSessionModel.setData(getInitialSessionData());
            }
        }
    };
});
