/*
 * Controller FoodDetail.controller: điều phối trạng thái, sự kiện giao diện và các lời gọi backend của màn hình.
 * Các hàm on... là event handler; các hàm bắt đầu bằng _ là helper chỉ dùng nội bộ controller.
 */
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap490g7fioriapp/model/cartUtils",
    "sap490g7fioriapp/model/sessionUtils"
], function (Controller, Filter, FilterOperator, MessageToast, cartUtils, sessionUtils) {
    "use strict";

    return Controller.extend("sap490g7fioriapp.controller.FoodDetail", {

        /** Khởi tạo model trạng thái và đăng ký các sự kiện điều hướng của màn hình. */
        onInit: function () {
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("RouteFoodDetail").attachPatternMatched(this._onRouteMatched, this);
        },

        /** Kiểm tra quyền truy cập và chuẩn bị dữ liệu mỗi khi route được mở. */
        _onRouteMatched: function (oEvent) {
            var oSession = this.getOwnerComponent().getModel("session");
            if (!sessionUtils.isLoggedIn(oSession) || !sessionUtils.isCustomer(oSession)) {
                this.getOwnerComponent().getRouter().navTo("RouteLogin", {}, true);
                return;
            }

            var sMaterialNumber = oEvent.getParameter("arguments").materialNumber;
            var sPath = "/Food2(MaterialNumber='" + encodeURIComponent(sMaterialNumber) + "')";

            this.getView().bindElement({
                path: sPath,
                parameters: {}
            });
        },

        /** Kiểm tra điều kiện Active Food. */
        _isActiveFood: function (sStatus) {
            return ["A", "ACTIVE", "1"].indexOf(String(sStatus || "").toUpperCase()) !== -1;
        },

        /** Đọc và trả về Current Cart Quantity phục vụ xử lý nội bộ. */
        _getCurrentCartQuantity: function (sCartId, sFoodId) {
            if (!sCartId || !sFoodId) {
                return Promise.resolve(0);
            }

            return this.getOwnerComponent().getModel().bindList("/CartItems", undefined, undefined, [
                new Filter("CartID", FilterOperator.EQ, sCartId),
                new Filter("FoodID", FilterOperator.EQ, sFoodId)
            ], {
                $$groupId: "$auto"
            }).requestContexts(0, 1).then(function (aContexts) {
                return aContexts && aContexts.length ? Number(aContexts[0].getObject().Quantity || 0) : 0;
            }).catch(function (oError) {
                console.warn("Could not read current cart quantity:", oError);
                return 0;
            });
        },

        /** Điều hướng về màn hình trước hoặc màn hình mặc định khi không có lịch sử. */
        onNavBack: function () {
            this.getOwnerComponent().getRouter().navTo("RouteFoodList");
        },

        /** Định dạng Price trước khi hiển thị trên giao diện. */
        formatPrice: function (vPrice) {
            if (vPrice === null || vPrice === undefined || vPrice === "") {
                return "";
            }
            var fPrice = parseFloat(String(vPrice).replace(/,/g, ""));
            if (!Number.isFinite(fPrice)) {
                return "";
            }
            return fPrice.toLocaleString("en-US", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
            });
        },

        /** Xử lý sự kiện Open Cart từ giao diện người dùng. */
        onOpenCart: function () {
            var oSession = this.getOwnerComponent().getModel("session");
            var oContext = this.getView().getBindingContext();
            if (oSession) {
                oSession.setProperty("/cartReturnRoute", "RouteFoodDetail");
                oSession.setProperty("/cartReturnMaterialNumber",
                    oContext ? oContext.getProperty("MaterialNumber") : "");
            }
            this.getOwnerComponent().getRouter().navTo("RouteCart", {}, true);
        },

        /** Xử lý sự kiện Add To Cart từ giao diện người dùng. */
        onAddToCart: function () {
            var oContext = this.getView().getBindingContext();
            if (!oContext) {
                return;
            }

            var oMaterial = oContext.getObject();
            var oSession = this.getOwnerComponent().getModel("session");
            var sUserId = oSession && oSession.getProperty("/userId");
            var oODataModel = this.getOwnerComponent().getModel();
            var oQuantityInput = this.byId("quantityInput");
            var iQuantity = parseInt(oQuantityInput ? oQuantityInput.getValue() : 1, 10);
            var iAvailableStock = Number(oMaterial.AvailableStock || 0);

            if (!sessionUtils.isLoggedIn(oSession) || !sessionUtils.isCustomer(oSession)) {
                this.getOwnerComponent().getRouter().navTo("RouteLogin", {}, true);
                return;
            }

            if (!this._isActiveFood(oMaterial.Status)) {
                MessageToast.show("This item is inactive.");
                return;
            }

            if (iAvailableStock <= 0) {
                MessageToast.show("This item is out of stock.");
                return;
            }

            if (!iQuantity || iQuantity < 1) {
                MessageToast.show("Please select a valid quantity.");
                return;
            }

            if (iQuantity > iAvailableStock) {
                MessageToast.show("Selected quantity exceeds available stock.");
                if (oQuantityInput) {
                    oQuantityInput.setValue(iAvailableStock);
                }
                return;
            }

            this._getCurrentCartQuantity(oSession && oSession.getProperty("/cartId"), oMaterial.MaterialNumber)
                .then(function (iCurrentQuantity) {
                    if (iCurrentQuantity + iQuantity > iAvailableStock) {
                        MessageToast.show("Selected quantity exceeds available stock including items already in cart.");
                        return Promise.reject({ handled: true });
                    }
                    return cartUtils.addMaterialToCart(oODataModel, oSession, sUserId, oMaterial, iQuantity);
                })
                .then(function (sCartId) {
                    return cartUtils.refreshCartCount(oODataModel, oSession, sCartId);
                }).then(function () {
                    MessageToast.show(oMaterial.MaterialDescription + " added to cart");
                }).catch(function (oError) {
                    if (oError && oError.handled) {
                        return;
                    }
                    console.error("Add to cart from Food Detail failed:", oError);
                    MessageToast.show("Unable to add item to cart");
                });
        }
    });
});
