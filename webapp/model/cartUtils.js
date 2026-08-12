sap.ui.define([
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], function (Filter, FilterOperator) {
    "use strict";

    var CART_ENTITY_SET = "/Carts";
    var CART_ITEM_ENTITY_SET = "/CartItems";

    function getCartUnitPrice(vMaterialPrice) {
        return Number(vMaterialPrice) || 0;
    }

    // ------------------------------------------------------------
    // Tim ItemNo ke tiep cho 1 cart: doc toan bo item hien co,
    // lay so lon nhat + 1, dinh dang du 6 chu so (numc(6)).
    // ------------------------------------------------------------
    function getNextItemNo(oODataModel, sCartId) {
        var oListBinding = oODataModel.bindList(CART_ITEM_ENTITY_SET, undefined, undefined, [
            new Filter("CartID", FilterOperator.EQ, sCartId)
        ], {
            $$groupId: "$auto"
        });

        return oListBinding.requestContexts().then(function (aContexts) {
            var iMax = 0;
            (aContexts || []).forEach(function (oContext) {
                var iNo = parseInt(oContext.getObject().ItemNo, 10);
                if (!isNaN(iNo) && iNo > iMax) {
                    iMax = iNo;
                }
            });
            var iNext = iMax + 1;
            return String(iNext).padStart(6, "0");
        });
    }

    return {
        syncActiveCart: function (oCartModel, sUserId, sCartId) {
            var oCartState = oCartModel.getProperty("/carts") || {};
            var sActiveCartId = sCartId || (sUserId ? "CART-" + sUserId : null);

            if (!sActiveCartId) {
                oCartModel.setProperty("/currentUserId", null);
                oCartModel.setProperty("/currentCartId", null);
                oCartModel.setProperty("/items", []);
                return { items: [] };
            }

            if (!oCartState[sActiveCartId]) {
                oCartState[sActiveCartId] = {
                    cartId: sActiveCartId,
                    userId: sUserId,
                    items: []
                };
            }

            var oUserCart = oCartState[sActiveCartId];
            oCartModel.setProperty("/carts", oCartState);
            oCartModel.setProperty("/currentUserId", sUserId);
            oCartModel.setProperty("/currentCartId", sActiveCartId);
            oCartModel.setProperty("/items", (oUserCart.items || []).slice());

            return oUserCart;
        },

        addItemToUserCart: function (oCartModel, sUserId, sCartId, oMaterial) {
            var oUserCart = this.syncActiveCart(oCartModel, sUserId, sCartId);
            var aItems = (oUserCart.items || []).slice();
            var iIndex = -1;

            aItems.forEach(function (oItem, index) {
                if (oItem.FoodID === oMaterial.MaterialNumber) {
                    iIndex = index;
                }
            });

            if (iIndex >= 0) {
                aItems[iIndex].Quantity += 1;
            } else {
                aItems.push({
                    FoodID: oMaterial.MaterialNumber,
                    MaterialDescription: oMaterial.MaterialDescription,
                    Price: oMaterial.Price,
                    Currency: oMaterial.Currency || "VND",
                    Quantity: 1
                });
            }

            oUserCart.items = aItems;
            oCartModel.setProperty("/items", aItems.slice());
            return aItems;
        },

        ensureCartForUser: function (oODataModel, oSessionModel, sUserId) {
            if (!oODataModel || !oSessionModel || !sUserId) {
                return Promise.resolve(null);
            }

            var sExistingCartId = oSessionModel.getProperty("/cartId");
            if (sExistingCartId) {
                return Promise.resolve(sExistingCartId);
            }

            var oReadBinding = oODataModel.bindList(CART_ENTITY_SET, undefined, undefined, [
                new Filter("UserID", FilterOperator.EQ, sUserId)
            ], {
                $$groupId: "$auto"
            });

            return oReadBinding.requestContexts(0, 1).then(function (aContexts) {
                if (aContexts && aContexts.length > 0) {
                    var oCart = aContexts[0].getObject();
                    var sCartId = oCart.CartID;
                    oSessionModel.setProperty("/cartId", sCartId);
                    return sCartId;
                }

                var sCartId = "CART-" + sUserId + "-" + Date.now().toString().slice(-6);

                var oCreateBinding = oODataModel.bindList(CART_ENTITY_SET);
                var oNewContext = oCreateBinding.create({
                    CartID: sCartId,
                    UserID: sUserId,
                    Status: "ACTIVE"
                });

                return oNewContext.created().then(function () {
                    oSessionModel.setProperty("/cartId", sCartId);
                    return sCartId;
                }).catch(function (oError) {
                    return Promise.reject(oError);
                });
            });
        },

        addMaterialToCart: function (oODataModel, oSessionModel, sUserId, oMaterial, iQuantity) {
            var iQtyToAdd = Number(iQuantity) > 0 ? Number(iQuantity) : 1;

            return this.ensureCartForUser(oODataModel, oSessionModel, sUserId).then(function (sCartId) {
                if (!sCartId) {
                    return Promise.reject(new Error("Khong xac dinh duoc cart cua user"));
                }

                var oReadBinding = oODataModel.bindList(CART_ITEM_ENTITY_SET, undefined, undefined, [
                    new Filter("CartID", FilterOperator.EQ, sCartId),
                    new Filter("FoodID", FilterOperator.EQ, oMaterial.MaterialNumber)
                ], {
                    $$groupId: "$auto"
                });

                return oReadBinding.requestContexts(0, 1).then(function (aContexts) {
                    var fUnitPrice = getCartUnitPrice(oMaterial.Price);
                    var sUnitPriceStr = fUnitPrice.toFixed(2);

                    if (aContexts && aContexts.length > 0) {
                        var oExistingItem = aContexts[0];
                        var iNewQuantity = (Number(oExistingItem.getObject().Quantity) || 0) + iQtyToAdd;
                        var sLineAmountStr = (fUnitPrice * iNewQuantity).toFixed(2);

                        oExistingItem.setProperty("Quantity", iNewQuantity);
                        oExistingItem.setProperty("UnitPrice", sUnitPriceStr);
                        oExistingItem.setProperty("Currency", oMaterial.Currency || "VND");
                        oExistingItem.setProperty("LineAmount", sLineAmountStr);
                        oExistingItem.setProperty("Status", "ACTIVE");

                        return oODataModel.submitBatch("$auto").then(function () {
                            return sCartId;
                        });
                    }

                    // Chua co dong nay trong cart - tinh ItemNo ke tiep truoc khi tao
                    return getNextItemNo(oODataModel, sCartId).then(function (sItemNo) {
                        var sLineAmountStr = (fUnitPrice * iQtyToAdd).toFixed(2);

                        var oCreateBinding = oODataModel.bindList(CART_ITEM_ENTITY_SET);
                        var oNewContext = oCreateBinding.create({
                            CartID: sCartId,
                            ItemNo: sItemNo,
                            FoodID: oMaterial.MaterialNumber,
                            Quantity: iQtyToAdd,
                            UnitPrice: sUnitPriceStr,
                            Currency: oMaterial.Currency || "VND",
                            LineAmount: sLineAmountStr,
                            Status: "ACTIVE"
                        });

                        return oNewContext.created().then(function () {
                            return sCartId;
                        });
                    });
                });
            });
        },

        clearCartItems: function (oODataModel, oSessionModel, sCartId) {
            if (!oODataModel || !sCartId) {
                return Promise.resolve(0);
            }

            var oListBinding = oODataModel.bindList(CART_ITEM_ENTITY_SET, undefined, undefined, [
                new Filter("CartID", FilterOperator.EQ, sCartId)
            ], {
                $$groupId: "$auto"
            });

            return oListBinding.requestContexts().then(function (aContexts) {
                var aCartItems = aContexts || [];
                return Promise.all(aCartItems.map(function (oContext) {
                    return oContext.delete();
                })).then(function () {
                    if (oSessionModel) {
                        oSessionModel.setProperty("/cartItemCount", 0);
                    }
                    return aCartItems.length;
                });
            });
        },

        refreshCartCount: function (oODataModel, oSessionModel, sCartId) {
    if (!oODataModel || !oSessionModel || !sCartId) {
        if (oSessionModel) {
            oSessionModel.setProperty("/cartItemCount", 0);
        }
        return Promise.resolve(0);
    }

    var oListBinding = oODataModel.bindList(CART_ITEM_ENTITY_SET, undefined, undefined, [
        new Filter("CartID", FilterOperator.EQ, sCartId)
    ], {
        $$groupId: "$auto"
    });

    return oListBinding.requestContexts().then(function (aContexts) {
        var iCount = 0;
        (aContexts || []).forEach(function (oContext) {
            iCount += Number(oContext.getObject().Quantity || 0);
        });
        oSessionModel.setProperty("/cartItemCount", iCount);
        return iCount;
    }).catch(function () {
        oSessionModel.setProperty("/cartItemCount", 0);
        return 0;
    });
}
    };
});
