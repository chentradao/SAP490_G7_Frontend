sap.ui.define([
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], function (Filter, FilterOperator) {
    "use strict";

    // ==================================================================
    // LUU Y QUAN TRONG: doi 2 hang so duoi day cho khop dung ten
    // Entity Set thuc te trong Service Definition cua ban (kiem tra
    // trong $metadata.xml hoac tab Preview cua Service Binding).
    // ==================================================================
    var CART_ENTITY_SET = "/Carts";
    var CART_ITEM_ENTITY_SET = "/CartItems";

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

        addItemToUserCart: function (oCartModel, sUserId, sCartId, oFood) {
            var oUserCart = this.syncActiveCart(oCartModel, sUserId, sCartId);
            var aItems = (oUserCart.items || []).slice();
            var iIndex = -1;

            aItems.forEach(function (oItem, index) {
                if (oItem.FoodID === oFood.FoodID) {
                    iIndex = index;
                }
            });

            if (iIndex >= 0) {
                aItems[iIndex].Quantity += 1;
            } else {
                aItems.push({
                    FoodID: oFood.FoodID,
                    FoodName: oFood.FoodName,
                    Description: oFood.Description,
                    Price: oFood.Price,
                    Currency: oFood.Currency || "VND",
                    Quantity: 1
                });
            }

            oUserCart.items = aItems;
            oCartModel.setProperty("/items", aItems.slice());
            return aItems;
        },

        // ------------------------------------------------------------
        // Dam bao user co 1 cart dang active - neu chua co thi tao moi.
        // ------------------------------------------------------------
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

        // ------------------------------------------------------------
        // Them mon an vao cart - ho tro tham so iQuantity (so luong
        // duoc chon o FoodDetail thong qua StepInput).
        // ------------------------------------------------------------
        addFoodToCart: function (oODataModel, oSessionModel, sUserId, oFood, iQuantity) {
            var iQtyToAdd = Number(iQuantity) > 0 ? Number(iQuantity) : 1;

            return this.ensureCartForUser(oODataModel, oSessionModel, sUserId).then(function (sCartId) {
                if (!sCartId) {
                    return Promise.reject(new Error("Khong xac dinh duoc cart cua user"));
                }

                var oReadBinding = oODataModel.bindList(CART_ITEM_ENTITY_SET, undefined, undefined, [
                    new Filter("CartID", FilterOperator.EQ, sCartId),
                    new Filter("FoodID", FilterOperator.EQ, oFood.FoodID)
                ], {
                    $$groupId: "$auto"
                });

                return oReadBinding.requestContexts(0, 1).then(function (aContexts) {
                    var fUnitPrice = parseFloat(oFood.Price || 0);
                    var sUnitPriceStr = fUnitPrice.toFixed(2);

                    if (aContexts && aContexts.length > 0) {
                        var oExistingItem = aContexts[0];
                        var iNewQuantity = (Number(oExistingItem.getObject().Quantity) || 0) + iQtyToAdd;
                        var sLineAmountStr = (fUnitPrice * iNewQuantity).toFixed(2);

                        oExistingItem.setProperty("Quantity", iNewQuantity);
                        oExistingItem.setProperty("UnitPrice", sUnitPriceStr);
                        oExistingItem.setProperty("Currency", oFood.Currency || "VND");
                        oExistingItem.setProperty("LineAmount", sLineAmountStr);
                        oExistingItem.setProperty("Status", "ACTIVE");

                        return oODataModel.submitBatch("$auto").then(function () {
                            return sCartId;
                        });
                    }

                    var sItemNo = Date.now().toString().slice(-6);
                    var sLineAmountStr = (fUnitPrice * iQtyToAdd).toFixed(2);

                    var oCreateBinding = oODataModel.bindList(CART_ITEM_ENTITY_SET);
                    var oNewContext = oCreateBinding.create({
                        CartID: sCartId,
                        ItemNo: sItemNo,
                        FoodID: oFood.FoodID,
                        Quantity: iQtyToAdd,
                        UnitPrice: sUnitPriceStr,
                        Currency: oFood.Currency || "VND",
                        LineAmount: sLineAmountStr,
                        // DA SUA: "A" -> "ACTIVE" cho dong nhat voi cac cho khac
                        Status: "ACTIVE"
                    });

                    return oNewContext.created().then(function () {
                        return sCartId;
                    });
                });
            });
        }
    };
});