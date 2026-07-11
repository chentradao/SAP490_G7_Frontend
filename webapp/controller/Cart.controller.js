sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap490g7fioriapp/model/cartUtils"
], function (Controller, Filter, FilterOperator, cartUtils) {
    "use strict";

    // LUU Y: doi cho khop dung ten Entity Set that (xem $metadata.xml)
    var CART_ENTITY_SET = "/Carts";

    return Controller.extend("sap490g7fioriapp.controller.Cart", {

        onInit: function () {
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("RouteCart").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            var oCartModel = this.getOwnerComponent().getModel("cart");
            var oSession = this.getOwnerComponent().getModel("session");
            var sUserId = oSession && oSession.getProperty("/userId");
            var sCartId = oSession && oSession.getProperty("/cartId");

            cartUtils.syncActiveCart(oCartModel, sUserId, sCartId);

            this._loadCartItems(sUserId, sCartId);
        },

        _loadCartItems: function (sUserId, sCartId) {
            var oList = this.getView().byId("cartList");
            if (!oList) {
                return;
            }

            var oListBinding = oList.getBinding("items");
            if (!oListBinding) {
                return;
            }

            if (!sCartId && sUserId) {
                var oODataModel = this.getOwnerComponent().getModel();
                oODataModel.bindList(CART_ENTITY_SET, undefined, undefined, [
                    new Filter("UserID", FilterOperator.EQ, sUserId)
                ], {
                    $$groupId: "$auto"
                }).requestContexts(0, 1).then(function (aContexts) {
                    if (aContexts && aContexts.length > 0) {
                        var oCart = aContexts[0].getObject();
                        this._loadCartItems(sUserId, oCart.CartID);
                    } else {
                        // Chua co cart nao cho user nay - hien danh sach rong
                        oListBinding.filter([
                            new Filter("CartID", FilterOperator.EQ, "___NO_CART___")
                        ]);
                        oListBinding.refresh();
                    }
                }.bind(this));
                return;
            }

            var aFilters = [];
            if (sCartId) {
                aFilters.push(new Filter("CartID", FilterOperator.EQ, sCartId));
            }

            oListBinding.filter(aFilters);
            oListBinding.refresh();
        },

        onBack: function () {
            this.getOwnerComponent().getRouter().navTo("RouteFoodList");
        }
    });
});
