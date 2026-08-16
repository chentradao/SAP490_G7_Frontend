/*
 * Controller FoodStatus.controller: điều phối trạng thái, sự kiện giao diện và các lời gọi backend của màn hình.
 * Các hàm on... là event handler; các hàm bắt đầu bằng _ là helper chỉ dùng nội bộ controller.
 */
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (Controller, Filter, FilterOperator, MessageToast, MessageBox) {
    "use strict";

    return Controller.extend("sap490g7fioriapp.controller.FoodStatus", {
        /** Khởi tạo model trạng thái và đăng ký các sự kiện điều hướng của màn hình. */
        onInit: function () {
            this._sSearchQuery = "";
            this._sStatusFilter = "ALL";
            this.getOwnerComponent().getRouter().getRoute("RouteFoodStatus")
                .attachPatternMatched(this._onRouteMatched, this);
        },

        /** Kiểm tra quyền truy cập và chuẩn bị dữ liệu mỗi khi route được mở. */
        _onRouteMatched: function () {
            var oSession = this.getOwnerComponent().getModel("session");
            var sRole = String(oSession && oSession.getProperty("/role") || "").toUpperCase();
            if (!oSession || !oSession.getProperty("/isLoggedIn") || ["STAFF", "ADMIN"].indexOf(sRole) === -1) {
                MessageBox.warning("Only STAFF or ADMIN can manage food status.");
                this.getOwnerComponent().getRouter().navTo("RouteLogin", {}, true);
                return;
            }
            this._sSearchQuery = "";
            this._sStatusFilter = "ALL";
            this.byId("foodStatusSearch").setValue("");
            this.byId("foodStatusFilter").setSelectedKey("ALL");
            this._applyFilters();
        },

        /** Xử lý sự kiện Search từ giao diện người dùng. */
        onSearch: function (oEvent) {
            this._sSearchQuery = String(
                oEvent.getParameter("newValue") || oEvent.getParameter("query") || ""
            ).trim();
            this._applyFilters();
        },

        /** Lưu trạng thái được chọn và kết hợp với điều kiện tìm kiếm hiện tại. */
        onStatusFilterChange: function (oEvent) {
            this._sStatusFilter = oEvent.getSource().getSelectedKey() || "ALL";
            this._applyFilters();
        },

        /** Hàm nội bộ thực hiện apply Filters. */
        _applyFilters: function () {
            var oBinding = this.byId("foodStatusTable").getBinding("items");
            var aFilters = [new Filter("MaterialNumber", FilterOperator.GE, "FG00009")];
            if (this._sSearchQuery) {
                aFilters.push(new Filter({
                    filters: [
                        new Filter("MaterialNumber", FilterOperator.Contains, this._sSearchQuery),
                        new Filter("MaterialDescription", FilterOperator.Contains, this._sSearchQuery)
                    ],
                    and: false
                }));
            }
            if (this._sStatusFilter === "A" || this._sStatusFilter === "I") {
                aFilters.push(new Filter("Status", FilterOperator.EQ, this._sStatusFilter));
            }
            oBinding.filter(aFilters);
        },

        /** Đồng bộ tồn kho Food2 với tồn thành phẩm hiện tại tại P001/FG01. */
        onSyncFGStock: function () {
            var oSession = this.getOwnerComponent().getModel("session");
            var sRole = String(oSession && oSession.getProperty("/role") || "").toUpperCase();
            var oButton = this.byId("syncFGStockButton");
            var oModel = this.getOwnerComponent().getModel();
            var oAction;

            if (sRole !== "ADMIN") {
                MessageBox.warning("Only ADMIN can synchronize finished-goods stock.");
                return;
            }

            oButton.setBusy(true);
            oButton.setEnabled(false);
            oAction = oModel.bindContext(
                "/Food2/com.sap.gateway.srvd.zsd_g7_canteen.v0001.syncFromFG01(...)",
                undefined,
                { $$groupId: "$direct" }
            );

            oAction.execute("$direct").then(function () {
                var oBinding = this.byId("foodStatusTable").getBinding("items");
                if (oBinding) {
                    oBinding.refresh();
                }
                this._applyFilters();
                MessageToast.show("Food2 stock was synchronized from P001/FG01.");
            }.bind(this)).catch(function (oError) {
                console.error("Could not synchronize Food2 stock:", oError);
                MessageBox.error("Could not synchronize stock from P001/FG01.");
            }).finally(function () {
                oButton.setBusy(false);
                oButton.setEnabled(true);
            });
        },

        /** Xử lý sự kiện Status Change từ giao diện người dùng. */
        onStatusChange: function (oEvent) {
            var oSwitch = oEvent.getSource();
            var oContext = oSwitch.getBindingContext();
            var bRequestedActive = oEvent.getParameter("state");
            var sDescription = oContext && oContext.getProperty("MaterialDescription") || "Food item";
            var oModel = this.getOwnerComponent().getModel();
            var oAction;

            if (!oContext) { return; }
            oSwitch.setEnabled(false);
            oAction = oModel.bindContext(
                "com.sap.gateway.srvd.zsd_g7_canteen.v0001.toggleStatus(...)",
                oContext,
                { $$groupId: "$direct" }
            );

            oAction.execute("$direct").then(function () {
                this._applyFilters();
                MessageToast.show(
                    sDescription + " is now " + (bRequestedActive ? "active" : "inactive") + "."
                );
            }.bind(this)).catch(function (oError) {
                console.error("Could not toggle food status:", oError);
                oSwitch.setState(!bRequestedActive);
                MessageBox.error("Could not update the food status. Please try again.");
            }).finally(function () {
                oSwitch.setEnabled(true);
            });
        },

        /** Định dạng Price trước khi hiển thị trên giao diện. */
        formatPrice: function (vPrice) {
            var nPrice;

            if (typeof vPrice === "number") {
                nPrice = vPrice;
            } else {
                var sPrice = String(vPrice === null || vPrice === undefined ? "" : vPrice)
                    .trim()
                    .replace(/\s/g, "");

                if (sPrice.indexOf(",") !== -1 && sPrice.indexOf(".") !== -1) {
                    if (sPrice.lastIndexOf(",") > sPrice.lastIndexOf(".")) {
                        sPrice = sPrice.replace(/\./g, "").replace(",", ".");
                    } else {
                        sPrice = sPrice.replace(/,/g, "");
                    }
                } else if (sPrice.indexOf(",") !== -1) {
                    sPrice = /^-?\d{1,3}(,\d{3})+$/.test(sPrice)
                        ? sPrice.replace(/,/g, "")
                        : sPrice.replace(",", ".");
                }

                nPrice = Number(sPrice);
            }

            if (!Number.isFinite(nPrice)) {
                nPrice = 0;
            }

            return nPrice.toLocaleString("vi-VN", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
            });
        },

        /** Định dạng số lượng tồn kho Food2 với tối đa ba chữ số thập phân. */
        formatQuantity: function (vQuantity) {
            var nQuantity = Number(vQuantity);

            if (!Number.isFinite(nQuantity)) {
                nQuantity = 0;
            }

            return nQuantity.toLocaleString("vi-VN", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 3
            });
        },

        /** Xử lý sự kiện Back từ giao diện người dùng. */
        onBack: function () {
            this.getOwnerComponent().getRouter().navTo("RouteStaffDashboard", {}, true);
        }
    });
});
