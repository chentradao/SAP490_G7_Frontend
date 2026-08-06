/**
 * eslint-disable @sap/ui5-jsdocs/no-jsdoc
 */

sap.ui.define([
        "sap/ui/core/UIComponent",
        "sap/ui/Device",
        "sap/ui/model/json/JSONModel",
        "sap490g7fioriapp/model/models",
        "sap490g7fioriapp/model/cartUtils"
    ],
    function (UIComponent, Device, JSONModel, models, cartUtils) {
        "use strict";

        return UIComponent.extend("sap490g7fioriapp.Component", {
            metadata: {
                manifest: "json"
            },

            /**
             * The component is initialized by UI5 automatically during the startup of the app and calls the init method once.
             * @public
             * @override
             */
            init: function () {
                // call the base component's init function
                UIComponent.prototype.init.apply(this, arguments);

                // enable routing
                this.getRouter().initialize();

                var oCartModel = new JSONModel({
                    carts: {},
                    currentUserId: null,
                    currentCartId: null,
                    items: []
                });
                this.setModel(oCartModel, "cart");

                var oSessionModel = new JSONModel({
                    userId: null,
                    cartId: null,
                    username: "",
                    fullName: "",
                    roleId: "",
                    role: "",
                    isLoggedIn: false
                });
                this.setModel(oSessionModel, "session");

                this.getModel("session").attachPropertyChange(function (oEvent) {
                    var sPath = oEvent.getParameter("path");
                    if (sPath === "/userId" || sPath === "/cartId" || sPath === "/isLoggedIn") {
                        var oSession = this.getModel("session");
                        var sUserId = oSession.getProperty("/userId");
                        var sCartId = oSession.getProperty("/cartId");
                        cartUtils.syncActiveCart(this.getModel("cart"), sUserId, sCartId);
                    }
                }.bind(this));

                // set the device model
                this.setModel(models.createDeviceModel(), "device");
            }
        });
    }
);