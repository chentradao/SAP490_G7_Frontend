sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap490g7fioriapp/model/cartUtils"
], function (Controller, JSONModel, Filter, FilterOperator, MessageToast, cartUtils) {
    "use strict";

    return Controller.extend("sap490g7fioriapp.controller.Login", {

        onInit: function () {
            var oLoginModel = new JSONModel({
                username: "",
                password: "",
                busy: false,
                errorVisible: false,
                errorMessage: ""
            });
            this.getView().setModel(oLoginModel, "loginModel");
        },

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

            // Doi voi cach lam nay, mat khau dang duoc so sanh truc tiep qua OData (plain text).
            // Trong thuc te nen goi mot action/function import server-side de kiem tra
            // va bam (hash) mat khau, khong nen so sanh plain text tren client.
            var oODataModel = this.getOwnerComponent().getModel();

            var aFilters = [
                new Filter("Username", FilterOperator.EQ, sUsername)
            ];

            var oListBinding = oODataModel.bindList("/Users", undefined, undefined, aFilters, {
                $$groupId: "$auto"
            });

            oListBinding.requestContexts(0, 2).then(function (aContexts) {
                oLoginModel.setProperty("/busy", false);

                if (aContexts && aContexts.length > 0) {
                    var oUser = aContexts[0].getObject();

                    var sStatus = oUser.Status || "";
                    if (sStatus !== "1" && sStatus.toUpperCase() !== "A") {
                        oLoginModel.setProperty("/errorVisible", true);
                        oLoginModel.setProperty("/errorMessage", oI18n.getText("msgLoginFailed"));
                        return;
                    }

                    var sRoleId = (oUser.RoleID || oUser.role_id || oUser.Role || "").toString().toUpperCase();
                    var sRole = (oUser.Role || oUser.RoleID || "").toString();
                    var oAppModel = this.getOwnerComponent().getModel("session") || new JSONModel();
                    oAppModel.setData({
userId: oUser.UserID,
                        // KHONG gan cung cartId - cartUtils.ensureCartForUser() se tu
                        // kiem tra cart that trong bang Carts theo UserID, hoac tao moi.
                        cartId: null,
                        cartItemCount: 0,
                        username: oUser.Username,
                        fullName: oUser.FullName,
                        roleId: sRoleId,
                        role: sRole,
                        isLoggedIn: true
                    });
                    this.getOwnerComponent().setModel(oAppModel, "session");

                    // Load cart 1 lan de tinh badge so luong, chay ngam khong can
                    // cho ket qua truoc khi dieu huong.
                    cartUtils.ensureCartForUser(oODataModel, oAppModel, oUser.UserID).then(function (sCartId) {
                        return cartUtils.refreshCartCount(oODataModel, oAppModel, sCartId);
                    });

                    MessageToast.show(oI18n.getText("msgLoginSuccess"));

                    var sTargetRoute = "RouteFoodList";
                    if (sRoleId === "ADMIN" || sRole === "ADMIN") {
                        sTargetRoute = "RouteUserList";
                    } else if (sRoleId === "STAFF" || sRole === "STAFF") {
                        sTargetRoute = "RouteCashierOrders";
                    } else if (sRoleId === "EMPLOYEE" || sRole === "EMPLOYEE") {
                        sTargetRoute = "RouteCart";
                    }

                    this.getOwnerComponent().getRouter().navTo(sTargetRoute);
                } else {
                    oLoginModel.setProperty("/errorVisible", true);
                    oLoginModel.setProperty("/errorMessage", oI18n.getText("msgLoginFailed"));
                }
            }.bind(this)).catch(function (oError) {
                oLoginModel.setProperty("/busy", false);
                oLoginModel.setProperty("/errorVisible", true);
                oLoginModel.setProperty("/errorMessage", oI18n.getText("msgLoginError"));
            });
        }
    });
});