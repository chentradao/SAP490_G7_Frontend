sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap490g7fioriapp/model/cartUtils"
], function (Controller, Filter, FilterOperator, MessageToast, cartUtils) {
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
                var iCount = 0;
                (aContexts || []).forEach(function (oContext) {
                    var oItem = oContext.getObject();
                    iCount += Number(oItem.Quantity || 0);
                });

                if (oCartButton) {
                    oCartButton.setText(iCount > 0 ? "Cart (" + iCount + ")" : "Cart");
                }
            }.bind(this));
        },

        _onRouteMatched: function () {
            var oSession = this.getOwnerComponent().getModel("session");
            if (!oSession || !oSession.getProperty("/isLoggedIn")) {
                // this.getOwnerComponent().getRouter().navTo("RouteLogin");
            }
            this._updateCartBadge();
        },

        onSearchFood: function (oEvent) {
            var sQuery = oEvent.getParameter("newValue") || oEvent.getParameter("query") || this.byId("foodSearchField").getValue() || "";
            this._applyFilters(sQuery);
        },

        onCategoryChange: function () {
            this._applyFilters();
        },

        onStatusChange: function () {
            this._applyFilters();
        },

        _applyFilters: function (sQuery) {
            var oTable = this.byId("foodTable");
            var oBinding = oTable.getBinding("items");
            var aFilters = [];
            var sSearchQuery = sQuery || this.byId("foodSearchField").getValue() || "";
            var sCategory = this.byId("categoryFilter").getSelectedKey();
            var sStatus = this.byId("statusFilter").getSelectedKey();

            if (sSearchQuery) {
                aFilters.push(new Filter({
                    filters: [
                        new Filter("FoodName", FilterOperator.Contains, sSearchQuery),
                        new Filter("Description", FilterOperator.Contains, sSearchQuery)
                    ],
                    and: false
                }));
            }

            if (sCategory) {
                aFilters.push(new Filter("CategoryID", FilterOperator.EQ, sCategory));
            }

            if (sStatus && sStatus !== "All") {
                aFilters.push(new Filter("Status", FilterOperator.EQ, sStatus));
            }

            if (oBinding) {
                oBinding.filter(aFilters);
            }
        },

        onFoodPress: function (oEvent) {
            var oItem = oEvent.getSource();
            var oContext = oItem.getBindingContext();
            var sFoodId = oContext.getProperty("FoodID");

            this.getOwnerComponent().getRouter().navTo("RouteFoodDetail", {
                foodId: sFoodId
            });
        },

        onAddToCart: function (oEvent) {
            if (oEvent && typeof oEvent.stopPropagation === "function") {
                oEvent.stopPropagation();
            }

            var oSource = oEvent && typeof oEvent.getSource === "function" ? oEvent.getSource() : null;
            var oContext = oSource && typeof oSource.getBindingContext === "function" ? oSource.getBindingContext() : null;
            var oFood = oContext && typeof oContext.getObject === "function" ? oContext.getObject() : null;

            if (!oFood) {
                return;
            }

            var oSession = this.getOwnerComponent().getModel("session");
            var sUserId = oSession && oSession.getProperty("/userId");
            console.log("session model:", oSession ? oSession.getData() : null);
    console.log("sUserId:", sUserId);
            var oODataModel = this.getOwnerComponent().getModel();

            cartUtils.addFoodToCart(oODataModel, oSession, sUserId, oFood).then(function () {
    this._updateCartBadge();
    MessageToast.show(oFood.FoodName + " added to cart");
}.bind(this)).catch(function (oError) {
    console.error("Add to cart error:", oError);   // THEM DONG NAY
    MessageToast.show("Unable to add item to cart");
});
        },

        onViewCart: function () {
            this.getOwnerComponent().getRouter().navTo("RouteCart");
        },

        onLogout: function () {
            var oSessionModel = this.getOwnerComponent().getModel("session");
            if (oSessionModel) {
                oSessionModel.setData({
                    userId: null,
                    cartId: null,
                    username: "",
                    fullName: "",
                    role: "",
                    isLoggedIn: false
                });
            }
            this.getOwnerComponent().getRouter().navTo("RouteLogin");
        }
    });
});
