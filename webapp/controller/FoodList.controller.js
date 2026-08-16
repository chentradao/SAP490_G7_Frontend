sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/Sorter",
    "sap/m/MessageToast",
    "sap490g7fioriapp/model/cartUtils",
    "sap490g7fioriapp/model/sessionUtils"
], function (Controller, Filter, FilterOperator, Sorter, MessageToast, cartUtils, sessionUtils) {
    "use strict";

    return Controller.extend("sap490g7fioriapp.controller.FoodList", {

        onInit: function () {
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("RouteFoodList").attachPatternMatched(this._onRouteMatched, this);

            var oCartModel = this.getOwnerComponent().getModel("cart");
            if (oCartModel) {
                oCartModel.attachPropertyChange(this._onCartModelChanged, this);
            }
        },

        _onCartModelChanged: function (oEvent) {
            if (oEvent.getParameter("path") === "/items") {
                this._updateCartBadge();
            }
        },

        _updateCartBadge: function () {
            var oSession = this.getOwnerComponent().getModel("session");
            var sCartId = oSession && oSession.getProperty("/cartId");
            var oCartButton = this.byId("cartButton");

            if (!sCartId) {
                if (oCartButton) {
                    oCartButton.setText("Cart");
                }
                return;
            }

            var oODataModel = this.getOwnerComponent().getModel();
            // DA SUA: "/ZC_G7_CART_ITEM" -> "/CartItems" (dung ten Entity Set
            // theo Service Definition ZSD_G7_CANTEEN: expose ZC_G7_CART_ITEM as CartItems)
            oODataModel.bindList("/CartItems", undefined, undefined, [
                new Filter("CartID", FilterOperator.EQ, sCartId)
            ], {
                $$groupId: "$auto"
            }).requestContexts(0, 100).then(function (aContexts) {
                var iCount = (aContexts || []).length;

                if (oCartButton) {
                    oCartButton.setText(iCount > 0 ? "Cart (" + iCount + ")" : "Cart");
                }
            }.bind(this));
        },

        _updateOrdersBadge: function () {
            var oSession = this.getOwnerComponent().getModel("session");
            var sUserId = oSession && oSession.getProperty("/userId");
            var oOrdersButton = this.byId("ordersButton");

            if (!sUserId || !oOrdersButton) {
                return;
            }

            this.getOwnerComponent().getModel().bindList("/Orders", undefined, undefined, [
                new Filter("UserID", FilterOperator.EQ, sUserId)
            ], { $$groupId: "$auto" }).requestContexts(0, 100).then(function (aContexts) {
                var iCount = (aContexts || []).length;
                oOrdersButton.setText(iCount > 0 ? "My Orders (" + iCount + ")" : "My Orders");
            });
        },

        _onRouteMatched: function () {
            var oSession = this.getOwnerComponent().getModel("session");
            if (!oSession || !oSession.getProperty("/isLoggedIn")) {
                this.getOwnerComponent().getRouter().navTo("RouteLogin");
                return;
            }
            this._updateCartBadge();
            this._updateOrdersBadge();
        },

        onSearchFood: function (oEvent) {
            var sQuery = oEvent.getParameter("newValue") || oEvent.getParameter("query") || this.byId("foodSearchField").getValue() || "";
            this._applyFilters(sQuery);
        },

        onQuantitySortChange: function () {
            this._applyFilters();
        },

        _applyFilters: function (sQuery) {
            var oTable = this.byId("foodTable");
            var oBinding = oTable.getBinding("items");
            var aFilters = [];
            var sSearchQuery = sQuery || this.byId("foodSearchField").getValue() || "";
            var sQuantitySort = this.byId("quantitySort").getSelectedKey();

            if (sSearchQuery) {
                aFilters.push(new Filter({
                    filters: [
                        new Filter("MaterialNumber", FilterOperator.Contains, sSearchQuery),
                        new Filter("MaterialDescription", FilterOperator.Contains, sSearchQuery)
                    ],
                    and: false
                }));
            }

            if (oBinding) {
                oBinding.filter(aFilters);
                oBinding.sort(sQuantitySort === "None" ?
                    [new Sorter("MaterialDescription", false)] :
                    [new Sorter("AvailableStock", sQuantitySort === "Desc")]);
            }
        },

        onFoodPress: function (oEvent) {
            var oItem = oEvent.getSource();
            var oContext = oItem.getBindingContext();
            var sMaterialNumber = oContext.getProperty("MaterialNumber");

            this.getOwnerComponent().getRouter().navTo("RouteFoodDetail", {
                materialNumber: sMaterialNumber
            });
        },

        onAddToCart: function (oEvent) {
            if (oEvent && typeof oEvent.stopPropagation === "function") {
                oEvent.stopPropagation();
            }

            var oSource = oEvent && typeof oEvent.getSource === "function" ? oEvent.getSource() : null;
            var oContext = oSource && typeof oSource.getBindingContext === "function" ? oSource.getBindingContext() : null;
            var oMaterial = oContext && typeof oContext.getObject === "function" ? oContext.getObject() : null;

            if (!oMaterial) {
                return;
            }

            if (Number(oMaterial.AvailableStock || 0) <= 0) {
                MessageToast.show("This item is out of stock.");
                return;
            }

            var oSession = this.getOwnerComponent().getModel("session");
            var sUserId = oSession && oSession.getProperty("/userId");
            console.log("session model:", oSession ? oSession.getData() : null);
    console.log("sUserId:", sUserId);
            var oODataModel = this.getOwnerComponent().getModel();

            cartUtils.addMaterialToCart(oODataModel, oSession, sUserId, oMaterial).then(function () {
    this._updateCartBadge();
    MessageToast.show(oMaterial.MaterialDescription + " added to cart");
}.bind(this)).catch(function (oError) {
    console.error("Add to cart error:", oError);   // THEM DONG NAY
    MessageToast.show("Unable to add item to cart");
});
        },

        onViewCart: function () {
            var oSession = this.getOwnerComponent().getModel("session");
            if (oSession) {
                oSession.setProperty("/cartReturnRoute", "RouteFoodList");
                oSession.setProperty("/cartReturnMaterialNumber", "");
            }
            this.getOwnerComponent().getRouter().navTo("RouteCart");
        },

        onViewMyOrders: function () {
            this.getOwnerComponent().getRouter().navTo("RouteMyOrders");
        },

        onLogout: function () {
            var oSessionModel = this.getOwnerComponent().getModel("session");
            sessionUtils.resetSession(oSessionModel);
            this.getOwnerComponent().getRouter().navTo("RouteLogin", {}, true);
        }
    });
});
