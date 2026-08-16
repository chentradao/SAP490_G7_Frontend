/*
 * Controller Login.controller: điều phối trạng thái, sự kiện giao diện và các lời gọi backend của màn hình.
 * Các hàm on... là event handler; các hàm bắt đầu bằng _ là helper chỉ dùng nội bộ controller.
 */
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap490g7fioriapp/model/cartUtils"
], function (Controller, JSONModel, MessageToast, cartUtils) {
    "use strict";

    var LOGIN_ACTION = "/Users/com.sap.gateway.srvd.zsd_g7_canteen.v0001.login(...)";

    /** Chuẩn hóa payload đăng nhập để hỗ trợ các dạng response khác nhau từ OData action. */
    function getLoginResult(oResult) {
        if (Array.isArray(oResult)) { return oResult[0] || {}; }
        if (oResult && Array.isArray(oResult.value)) { return oResult.value[0] || {}; }
        return oResult || {};
    }

    /** Đọc giá trị đầu tiên tồn tại trong danh sách tên field tương thích. */
    function getValue(oResult, aNames) {
        var sName = aNames.find(function (sCandidate) {
            return Object.prototype.hasOwnProperty.call(oResult, sCandidate);
        });
        return sName ? oResult[sName] : undefined;
    }

    return Controller.extend("sap490g7fioriapp.controller.Login", {

        /** Khởi tạo model trạng thái và đăng ký các sự kiện điều hướng của màn hình. */
        onInit: function () {
            var oLoginModel = new JSONModel({
                username: "",
                password: "",
                busy: false,
                errorVisible: false,
                errorMessage: ""
            });

            this.getView().setModel(oLoginModel, "loginModel");

            this.getOwnerComponent()
                .getRouter()
                .getRoute("RouteLogin")
                .attachPatternMatched(this._onLoginRouteMatched, this);
        },

        /** Xử lý sự kiện Login từ giao diện người dùng. */
        onLogin: function () {
            var oView = this.getView();
            var oLoginModel = oView.getModel("loginModel");
            var oI18n = this.getView().getModel("i18n").getResourceBundle();

            var sUsername = (oLoginModel.getProperty("/username") || "").trim();
            var sPassword = oLoginModel.getProperty("/password") || "";

            oLoginModel.setProperty("/errorVisible", false);

            if (!sUsername || !sPassword) {
                oLoginModel.setProperty("/errorVisible", true);
                oLoginModel.setProperty("/errorMessage", oI18n.getText("msgLoginEmpty"));
                return;
            }

            oLoginModel.setProperty("/busy", true);

            var oODataModel = this.getOwnerComponent().getModel();
            var oAction = oODataModel.bindContext(LOGIN_ACTION, undefined, {
                $$groupId: "$direct"
            });
            oAction.setParameter("Username", sUsername);
            oAction.setParameter("Password", sPassword);

            oAction.execute().then(function () {
                return oAction.requestObject();
            }).then(function (oResponse) {
                var oResult = getLoginResult(oResponse);
                var bSuccess = getValue(oResult, ["Success", "success"]);

                if (bSuccess === true || bSuccess === "true" || bSuccess === "X") {
                    var sUserId = getValue(oResult, ["Userid", "UserID", "userId", "userid"]);
                    var sRole = String(getValue(oResult, ["Roleid", "RoleID", "roleId", "roleid"]) || "").toUpperCase();
                    var oAppModel = this.getOwnerComponent().getModel("session") || new JSONModel();
                    oAppModel.setData({
                        userId: sUserId,
                        cartId: null,
                        cartItemCount: 0,
                        username: getValue(oResult, ["Username", "username"]) || sUsername,
                        fullName: getValue(oResult, ["Fullname", "FullName", "fullName", "fullname"]) || "",
                        role: sRole,
                        roleId: sRole,
                        status: getValue(oResult, ["Status", "status"]) || "",
                        isLoggedIn: true
                    });
                    this.getOwnerComponent().setModel(oAppModel, "session");

                    MessageToast.show(oI18n.getText("msgLoginSuccess"));

                    var sTargetRoute = "RouteFoodList";
                    if (sRole === "ADMIN") {
                        sTargetRoute = "RouteStaffDashboard";
                    } else if (sRole === "STAFF") {
                        sTargetRoute = "RouteCashierOrders";
                    } else if (sRole === "EMPLOYEE") {
                        sTargetRoute = "RouteFoodList";
                    }

                    if (sRole === "EMPLOYEE") {
                        cartUtils.ensureCartForUser(oODataModel, oAppModel, sUserId).then(function (sCartId) {
                            return cartUtils.refreshCartCount(oODataModel, oAppModel, sCartId);
                        }).catch(function (oError) {
                            console.error("Could not initialize cart:", oError);
                        });
                    }

                    this.getOwnerComponent().getRouter().navTo(sTargetRoute);
                } else {
                    oLoginModel.setProperty("/errorVisible", true);
                    oLoginModel.setProperty("/errorMessage",
                        getValue(oResult, ["Message", "message"]) || oI18n.getText("msgLoginFailed"));
                }
            }.bind(this)).catch(function (oError) {
                oLoginModel.setProperty("/errorVisible", true);
                oLoginModel.setProperty("/errorMessage", oI18n.getText("msgLoginError"));
                console.error("Could not execute login action:", oError);
            }).finally(function () {
                oLoginModel.setProperty("/busy", false);
            });
        }
    });
});
