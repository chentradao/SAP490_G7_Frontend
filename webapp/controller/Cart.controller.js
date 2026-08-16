/*
 * Controller Cart.controller: điều phối trạng thái, sự kiện giao diện và các lời gọi backend của màn hình.
 * Các hàm on... là event handler; các hàm bắt đầu bằng _ là helper chỉ dùng nội bộ controller.
 */
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap490g7fioriapp/model/cartUtils",
    "sap490g7fioriapp/model/sessionUtils"
], function (Controller, JSONModel, Filter, FilterOperator, MessageToast, cartUtils, sessionUtils) {
    "use strict";

    /** Chuyển giá trị tiền sang number an toàn trước khi tính tổng. */
    function toAmount(vPrice) {
        if (typeof vPrice === "number") {
            return Number.isFinite(vPrice) ? vPrice : 0;
        }

        var sValue = String(vPrice === null || vPrice === undefined ? "" : vPrice)
            .trim()
            .replace(/\s/g, "");

        if (sValue.indexOf(",") !== -1 && sValue.indexOf(".") !== -1) {
            sValue = sValue.lastIndexOf(",") > sValue.lastIndexOf(".") ?
                sValue.replace(/\./g, "").replace(",", ".") :
                sValue.replace(/,/g, "");
        } else if (/^-?\d{1,3}(,\d{3})+$/.test(sValue)) {
            sValue = sValue.replace(/,/g, "");
        } else {
            sValue = sValue.replace(",", ".");
        }

        return Number(sValue) || 0;
    }

    /** Định dạng số tiền kèm mã tiền tệ để hiển thị trong giỏ hàng. */
    function getAmountText(vAmount, sCurrency) {
        var fAmount = toAmount(vAmount);
        var sAmount = fAmount.toLocaleString("en-US", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        });
        return sAmount + (sCurrency ? " " + sCurrency : "");
    }

    return Controller.extend("sap490g7fioriapp.controller.Cart", {

        /** Khởi tạo model trạng thái và đăng ký các sự kiện điều hướng của màn hình. */
        onInit: function () {
            var oViewModel = new JSONModel({
                totalPrice: 0,
                totalPriceFormatted: "0",
                currency: "",
                checkoutEnabled: false,
                checkoutBusy: false
            });
            this.getView().setModel(oViewModel, "cartView");
            this.getOwnerComponent().getRouter().getRoute("RouteCart")
                .attachPatternMatched(this._onRouteMatched, this);
        },

        /** Kiểm tra quyền truy cập và chuẩn bị dữ liệu mỗi khi route được mở. */
        _onRouteMatched: function () {
            var oSession = this.getOwnerComponent().getModel("session");
            var oBinding = this.byId("cartList").getBinding("items");

            if (!sessionUtils.isLoggedIn(oSession) || !sessionUtils.isCustomer(oSession)) {
                if (oBinding) {
                    oBinding.filter([
                        new Filter("CartID", FilterOperator.EQ, "__NO_ACTIVE_CART__")
                    ]);
                }
                var oViewModel = this.getView().getModel("cartView");
                if (oViewModel) {
                    oViewModel.setProperty("/totalPrice", 0);
                    oViewModel.setProperty("/totalPriceFormatted", "0");
                    oViewModel.setProperty("/currency", "");
                    oViewModel.setProperty("/checkoutEnabled", false);
                    oViewModel.setProperty("/checkoutBusy", false);
                }
                this.getOwnerComponent().getRouter().navTo("RouteLogin", {}, true);
                return;
            }

            var sCartId = oSession && oSession.getProperty("/cartId");

            if (oBinding) {
                oBinding.filter([
                    new Filter("CartID", FilterOperator.EQ, sCartId || "__NO_ACTIVE_CART__")
                ]);
                // CartItems are created through a separate list binding. Refresh
                // this table binding on every entry so the new row is visible now.
                oBinding.refresh();
            }
        },

        /** Xử lý sự kiện Back từ giao diện người dùng. */
        onBack: function () {
            var oSession = this.getOwnerComponent().getModel("session");
            var sReturnRoute = oSession && oSession.getProperty("/cartReturnRoute");
            var sMaterialNumber = oSession && oSession.getProperty("/cartReturnMaterialNumber");

            if (sReturnRoute === "RouteFoodDetail" && sMaterialNumber) {
                this.getOwnerComponent().getRouter().navTo("RouteFoodDetail", {
                    materialNumber: sMaterialNumber
                }, true);
                return;
            }
            this.getOwnerComponent().getRouter().navTo("RouteFoodList", {}, true);
        },

        /** Xử lý sự kiện Quantity Change từ giao diện người dùng. */
        onQuantityChange: function (oEvent) {
            var oStepInput = oEvent.getSource();
            var oContext = oStepInput.getBindingContext();
            var iQuantity = Math.max(1, parseInt(oStepInput.getValue(), 10) || 1);

            if (!oContext) {
                return;
            }

            var oItem = oContext.getObject();
            var fUnitPrice = toAmount(oItem.UnitPrice);
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

        // Use the OData V4 context deletion API.
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

        /** Định dạng Food Name trước khi hiển thị trên giao diện. */
        formatFoodName: function (sFoodName, sFoodId) {
            return sFoodName || sFoodId || "";
        },

        /** Định dạng Cart Amount trước khi hiển thị trên giao diện. */
        formatCartAmount: function (vAmount, sCurrency) {
            return getAmountText(vAmount, sCurrency);
        },

        /** Xử lý sự kiện Cart List Update Finished từ giao diện người dùng. */
        onCartListUpdateFinished: function (oEvent) {
            var oList = this.byId("cartList");
            var oBinding = oList.getBinding("items");
            var aContexts = oBinding ? oBinding.getCurrentContexts() : [];

            var fTotal = 0;
            var sCurrency = "";

            aContexts.forEach(function (oCtx) {
                if (!oCtx) { return; }
                var oData = oCtx.getObject();
                if (!sCurrency && oData.Currency) {
                    sCurrency = oData.Currency;
                }
            });

            aContexts.forEach(function (oCtx) {
                if (!oCtx) { return; }
                var oData = oCtx.getObject();
                fTotal += toAmount(oData.LineAmount) || (toAmount(oData.UnitPrice) * (parseInt(oData.Quantity, 10) || 0));
            });

            var oViewModel = this.getView().getModel("cartView");
            oViewModel.setProperty("/totalPrice", fTotal);
            oViewModel.setProperty("/totalPriceFormatted", getAmountText(fTotal, sCurrency));
            oViewModel.setProperty("/currency", sCurrency);
            oViewModel.setProperty("/checkoutEnabled", aContexts.length > 0);
        },

        /** Hàm nội bộ thực hiện validate Cart Stock. */
        _validateCartStock: function (aItems) {
            var oModel = this.getOwnerComponent().getModel();
            return Promise.all(aItems.map(function (oItem) {
                var sMaterialNumber = oItem.materialNumber || oItem.MaterialNumber;
                var sMaterialDescription = oItem.materialDescription || oItem.MaterialDescription;
                return oModel.bindList("/Food2", undefined, undefined, [
                    new Filter("MaterialNumber", FilterOperator.EQ, sMaterialNumber)
                ], { $$groupId: "$auto" }).requestContexts(0, 1).then(function (aContexts) {
                    var oFood = aContexts && aContexts.length ? aContexts[0].getObject() : null;
                    return {
                        materialNumber: sMaterialNumber,
                        materialDescription: (oFood && oFood.MaterialDescription) || sMaterialDescription || sMaterialNumber,
                        requestedQuantity: Number(oItem.quantity || oItem.Quantity) || 0,
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

        /** Xử lý sự kiện Checkout từ giao diện người dùng. */
        onCheckout: function () {
            var oList = this.byId("cartList");
            var oBinding = oList.getBinding("items");
            var aContexts = oBinding ? oBinding.getCurrentContexts() : [];

            var oViewModel = this.getView().getModel("cartView");

            var aItems = aContexts.map(function (oCtx) {
                var d = oCtx.getObject();
                var oFood = d._Food || {};
                var fUnitPrice = toAmount(d.UnitPrice);
                var iQuantity = parseInt(d.Quantity, 10) || 0;
                var fLineAmount = fUnitPrice * iQuantity;
                return {
                    materialNumber: oFood.MaterialNumber || d.FoodID,
                    materialDescription: oFood.MaterialDescription || d.FoodID,
                    foodId: d.FoodID,
                    foodName: oFood.MaterialDescription || d.FoodID,
                    imageUrl: oFood.ImageUrl || "",
                    quantity: iQuantity,
                    unitPrice: fUnitPrice,
                    unitPriceText: getAmountText(fUnitPrice, ""),
                    currency: d.Currency || "VND",
                    lineAmount: fLineAmount,
                    lineAmountText: getAmountText(fLineAmount, "")
                };
            });

            oViewModel.setProperty("/checkoutBusy", true);
            this._validateCartStock(aItems).then(function (aInsufficientItems) {
                if (aInsufficientItems.length) {
                    var sItems = aInsufficientItems.map(function (oItem) {
                        return oItem.materialDescription + " (available " + oItem.availableStock + ", selected " + oItem.requestedQuantity + ")";
                    }).join(", ");
                    MessageToast.show("Insufficient stock for checkout: " + sItems);
                    return;
                }

                var fTotalAmount = aItems.reduce(function (sum, item) {
                    return sum + (Number(item.lineAmount) || 0);
                }, 0);
                this.getOwnerComponent().setModel(new JSONModel({
                    items: aItems,
                    totalAmount: fTotalAmount,
                    totalAmountText: getAmountText(fTotalAmount, ""),
                    currency: oViewModel.getProperty("/currency"),
                    note: "",
                    sourceRoute: "cart"
                }), "checkoutData");
                this.getOwnerComponent().getRouter().navTo("RouteCheckout");
            }.bind(this)).catch(function (oError) {
                console.error("Could not validate cart stock:", oError);
                MessageToast.show("Could not check stock. Please try again.");
            }).finally(function () {
                oViewModel.setProperty("/checkoutBusy", false);
            });
        }
    });
});
