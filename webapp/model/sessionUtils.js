sap.ui.define([], function () {
    "use strict";

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

    function getCurrentRole(oSessionModel) {
        return String(
            oSessionModel && (oSessionModel.getProperty("/roleId") || oSessionModel.getProperty("/role")) || ""
        ).toUpperCase();
    }

    function isLoggedIn(oSessionModel) {
        return Boolean(oSessionModel && oSessionModel.getProperty("/isLoggedIn"));
    }

    return {
        getInitialSessionData: getInitialSessionData,
        getCurrentRole: getCurrentRole,
        isLoggedIn: isLoggedIn,

        isCustomer: function (oSessionModel) {
            return ["EMPLOYEE", "CUSTOMER"].indexOf(getCurrentRole(oSessionModel)) !== -1;
        },

        isStaffOrManager: function (oSessionModel) {
            return ["STAFF", "ADMIN", "MANAGER"].indexOf(getCurrentRole(oSessionModel)) !== -1;
        },

        resetSession: function (oSessionModel) {
            if (oSessionModel) {
                oSessionModel.setData(getInitialSessionData());
            }
        }
    };
});
