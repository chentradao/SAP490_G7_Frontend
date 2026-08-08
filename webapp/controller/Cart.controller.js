sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap490g7fioriapp/model/cartUtils"
], function (Controller, JSONModel, Filter, FilterOperator, MessageToast, cartUtils) {
    "use strict";

    var PRICE_SCALE = 1;

    function toDisplayPrice(vPrice) {
        return (parseFloat(vPrice) || 0) * PRICE_SCALE;
    }

    function formatVnd(vPrice, sCurrency) {
        return Number(vPrice).toLocaleString("en-US", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }) + (sCurrency ? " " + sCurrency : "");
    }

    return Controller.extend("sap490g7fioriapp.controller.Cart", {

        onInit: function () {
            var oViewModel = new JSONModel({
                totalPrice: 0,
                totalPriceFormatted: "0.00",
                currency: "",
                checkoutEnabled: false,
                checkoutBusy: false
            });
            this.getView().setModel(oViewModel, "cartView");
            this.getView().setModel(new JSONModel({}), "cartNames");
        },

        onBack: function () {
            this.getOwnerComponent().getRouter().navTo("RouteFoodList", {}, true);
        },

        onQuantityChange: function (oEvent) {
            var oStepInput = oEvent.getSource();
            var oContext = oStepInput.getBindingContext();
            var iQuantity = Math.max(1, parseInt(oStepInput.getValue(), 10) || 1);

            if (!oContext) {
                return;
            }

            var oItem = oContext.getObject();
            var fUnitPrice = parseFloat(oItem.UnitPrice) || 0;
            var oModel = oContext.getModel();

            oStepInput.setValue(iQuantity);
            oContext.setProperty("Quantity", iQuantity);
            oContext.setProperty("LineAmount", (fUnitPrice * iQuantity).toFixed(2));

            oModel.submitBatch("$auto").then(function () {
                var oSession = this.getOwnerComponent().getModel("session");
                var sCartId = oSession && oSession.getProperty("/cartId");

                if (oSession && sCartId) {
                    cartUtils.refreshCartCount(oModel, oSession, sCartId);
                }

                this.onCartListUpdateFinished();
            }.bind(this)).catch(function () {
                MessageToast.show("Could not update quantity.");
            });
        },

        // DA SUA: dung oContext.delete() (API dung cho ODataModel v4),
        // thay vi oModel.remove() (API cua v2, khong ton tai trong v4).
        onRemoveCartItem: function (oEvent) {
            var oSource = oEvent.getSource();
            var oContext = oSource.getBindingContext();
            if (!oContext) {
                return;
            }

            oContext.delete().then(function () {
                MessageToast.show("Item removed from cart.");

                // Cap nhat lai tong tien hien thi tren view
                this.onCartListUpdateFinished();

                // Cap nhat lai badge so luong tren FoodList (session/cartItemCount)
                var oSession = this.getOwnerComponent().getModel("session");
                var sCartId = oSession && oSession.getProperty("/cartId");
                var oODataModel = oContext.getModel();

                if (cartUtils && oSession && sCartId) {
                    cartUtils.refreshCartCount(oODataModel, oSession, sCartId);
                }
            }.bind(this)).catch(function () {
                MessageToast.show("Could not remove the item from cart.");
            });
        },

        formatUnitPrice: function (fUnitPrice, sCurrency) {
            var fValue = parseFloat(fUnitPrice);
            if (isNaN(fValue)) {
                return "";
            }
            return formatVnd(toDisplayPrice(fValue) * 1000, sCurrency);
        },

        formatLineAmount: function (fUnitPrice, iQuantity, sCurrency) {
            var fValue = toDisplayPrice(fUnitPrice) * (parseInt(iQuantity, 10) || 0) * 1000;
            return formatVnd(fValue, sCurrency);
        },

        formatFoodName: function (sFoodId, mFoodNames) {
            return (mFoodNames && mFoodNames[sFoodId]) || sFoodId || "";
        },

        _loadFoodNames: function (aContexts) {
            var oNamesModel = this.getView().getModel("cartNames");
            var mFoodNames = oNamesModel.getData() || {};
            var oModel = this.getOwnerComponent().getModel();
            var aFoodIds = (aContexts || []).map(function (oContext) {
                return oContext.getObject().FoodID;
            }).filter(function (sFoodId) {
                return sFoodId && !mFoodNames[sFoodId];
            });

            if (!aFoodIds.length) {
                return;
            }

            Promise.all(aFoodIds.map(function (sFoodId) {
                return oModel.bindList("/Food2", undefined, undefined, [
                    new Filter("MaterialNumber", FilterOperator.EQ, sFoodId)
                ], { $$groupId: "$auto" }).requestContexts(0, 1).then(function (aFoodContexts) {
                    var oFood = aFoodContexts && aFoodContexts.length ? aFoodContexts[0].getObject() : null;
                    return { foodId: sFoodId, foodName: oFood && oFood.MaterialDescription };
                });
            })).then(function (aNames) {
                aNames.forEach(function (oName) {
                    if (oName.foodName) {
                        mFoodNames[oName.foodId] = oName.foodName;
                    }
                });
                oNamesModel.setData(mFoodNames);
            });
        },

        onCartListUpdateFinished: function (oEvent) {
            var oList = this.byId("cartList");
            var oBinding = oList.getBinding("items");
            var aContexts = oBinding ? oBinding.getCurrentContexts() : [];

            this._loadFoodNames(aContexts);

            var fTotal = 0;
            var sCurrency = "";

            aContexts.forEach(function (oCtx) {
                if (!oCtx) { return; }
                var oData = oCtx.getObject();
                var fUnitPrice = toDisplayPrice(oData.UnitPrice);
                var iQty = parseInt(oData.Quantity, 10) || 0;
                fTotal += fUnitPrice * iQty;
                if (!sCurrency && oData.Currency) {
                    sCurrency = oData.Currency;
                }
            });

            var oViewModel = this.getView().getModel("cartView");
            oViewModel.setProperty("/totalPrice", fTotal);
            oViewModel.setProperty("/totalPriceFormatted", formatVnd(fTotal, sCurrency));
            oViewModel.setProperty("/currency", sCurrency);
            oViewModel.setProperty("/checkoutEnabled", aContexts.length > 0);
        },

        _validateCartStock: function (aItems) {
            var oModel = this.getOwnerComponent().getModel();
            return Promise.all(aItems.map(function (oItem) {
                return oModel.bindList("/Food2", undefined, undefined, [
                    new Filter("MaterialNumber", FilterOperator.EQ, oItem.MaterialNumber)
                ], { $$groupId: "$auto" }).requestContexts(0, 1).then(function (aContexts) {
                    var oFood = aContexts && aContexts.length ? aContexts[0].getObject() : null;
                    return {
                        materialNumber: oItem.MaterialNumber,
                        materialDescription: (oFood && oFood.MaterialDescription) || oItem.MaterialDescription || oItem.MaterialNumber,
                        requestedQuantity: Number(oItem.Quantity) || 0,
                        availableStock: oFood ? (Number(oFood.AvailableStock) || 0) : 0,
                        found: !!oFood
                    };
                });
            })).then(function (aStockChecks) {
                return aStockChecks.filter(function (oCheck) {
                    return !oCheck.found || oCheck.requestedQuantity > oCheck.availableStock;
                });
            });
        },

        onCheckout: function () {
            var oList = this.byId("cartList");
            var oBinding = oList.getBinding("items");
            var aContexts = oBinding ? oBinding.getCurrentContexts() : [];

            var oViewModel = this.getView().getModel("cartView");

            var aItems = aContexts.map(function (oCtx) {
                var d = oCtx.getObject();
                return {
                    MaterialNumber: d._Food ? d._Food.MaterialNumber : d.FoodID,
                    MaterialDescription: d._Food ? d._Food.MaterialDescription : "",
                    Quantity: d.Quantity,
                    UnitPrice: toDisplayPrice(d.UnitPrice),
                    Currency: d.Currency,
                    LineAmount: toDisplayPrice(d.UnitPrice) * (parseInt(d.Quantity, 10) || 0)
                };
            });

            oViewModel.setProperty("/checkoutBusy", true);
            this._validateCartStock(aItems).then(function (aInsufficientItems) {
                if (aInsufficientItems.length) {
                    var sItems = aInsufficientItems.map(function (oItem) {
                        return oItem.materialDescription + " (còn " + oItem.availableStock + ", chọn " + oItem.requestedQuantity + ")";
                    }).join(", ");
                    MessageToast.show("Không đủ tồn kho để checkout: " + sItems);
                    return;
                }

                var fTotalAmount = aItems.reduce(function (sum, item) {
                    return sum + ((parseFloat(item.UnitPrice) || 0) * (parseInt(item.Quantity, 10) || 0));
                }, 0);
                this.getOwnerComponent().setModel(new JSONModel({
                    items: aItems,
                    totalAmount: fTotalAmount,
                    currency: oViewModel.getProperty("/currency"),
                    note: ""
                }), "checkoutData");
                this.getOwnerComponent().getRouter().navTo("RouteCheckout");
            }.bind(this)).catch(function (oError) {
                console.error("Could not validate cart stock:", oError);
                MessageToast.show("Không thể kiểm tra tồn kho. Vui lòng thử lại.");
            }).finally(function () {
                oViewModel.setProperty("/checkoutBusy", false);
            });
        }
    });
});
