/*
 * Controller MyOrders.controller: điều phối trạng thái, sự kiện giao diện và các lời gọi backend của màn hình.
 * Các hàm on... là event handler; các hàm bắt đầu bằng _ là helper chỉ dùng nội bộ controller.
 */
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap490g7fioriapp/model/sessionUtils"
], function (Controller, JSONModel, Filter, FilterOperator, MessageBox, MessageToast, sessionUtils) {
    "use strict";

    /** Chuyển ngày từ backend sang chuỗi ngày phù hợp với locale Việt Nam. */
    function formatDate(sValue) {
        var sDate = String(sValue || "").replace(/[^0-9]/g, "").slice(0, 8);
        return sDate.length === 8 ? sDate.slice(6, 8) + "/" + sDate.slice(4, 6) + "/" + sDate.slice(0, 4) : sValue || "";
    }

    return Controller.extend("sap490g7fioriapp.controller.MyOrders", {
        /** Khởi tạo model trạng thái và đăng ký các sự kiện điều hướng của màn hình. */
        onInit: function () {
            var oRoute = this.getOwnerComponent().getRouter().getRoute("RouteMyOrders");
            oRoute.attachPatternMatched(this._onRouteMatched, this);
        },

        /** Kiểm tra quyền truy cập và chuẩn bị dữ liệu mỗi khi route được mở. */
        _onRouteMatched: function () {
            var oSession = this.getOwnerComponent().getModel("session");
            if (!sessionUtils.isLoggedIn(oSession) || !sessionUtils.isCustomer(oSession)) {
                this._clearOrders();
                this.getOwnerComponent().getRouter().navTo("RouteLogin", {}, true);
                return;
            }
            this._refreshOrders();
        },

        /** Hàm nội bộ thực hiện clear Orders. */
        _clearOrders: function () {
            var oOrdersModel = this.getOwnerComponent().getModel("orders");
            if (oOrdersModel) {
                oOrdersModel.setProperty("/orders", []);
                oOrdersModel.setProperty("/filteredOrders", []);
                oOrdersModel.setProperty("/statusOptions", []);
                oOrdersModel.setProperty("/selectedOrder", null);
            }
        },

        /** Hàm nội bộ thực hiện refresh Orders. */
        _refreshOrders: function () {
            var oComponent = this.getOwnerComponent();
            var oOrdersModel = oComponent.getModel("orders") || new JSONModel({
                orders: [], filteredOrders: [], statusOptions: [], selectedOrder: null, showHidden: false
            });
            oComponent.setModel(oOrdersModel, "orders");
            this.getView().setModel(oOrdersModel, "orders");

            var oSession = oComponent.getModel("session");
            var sUserId = oSession && oSession.getProperty("/userId");

            this._loadOrdersFromBackend(sUserId).then(function (aOrders) {
                oOrdersModel.setProperty("/orders", aOrders);
                oOrdersModel.setProperty("/statusOptions", this._getStatusOptions(aOrders));
                this._applyFilters();
            }.bind(this)).catch(function (oError) {
                console.error("Could not load orders:", oError);
                oOrdersModel.setProperty("/orders", []);
                oOrdersModel.setProperty("/filteredOrders", []);
            });
        },

        /** Tải Orders From Backend từ nguồn dữ liệu và cập nhật trạng thái màn hình. */
        _loadOrdersFromBackend: function (sUserId) {
            if (!sUserId) {
                return Promise.resolve([]);
            }

            var aFilters = [new Filter("UserID", FilterOperator.EQ, sUserId)];
            var oListBinding = this.getOwnerComponent().getModel().bindList("/Orders", null, null, aFilters, {
                $expand: "_Items"
            });

            return oListBinding.requestContexts(0, 5000).then(function (aContexts) {
                return (aContexts || []).map(function (oContext) {
                    return this._normalizeOrder(oContext.getObject());
                }.bind(this));
            }.bind(this));
        },

        /** Hàm nội bộ thực hiện normalize Order. */
        _normalizeOrder: function (oRow) {
            var aItems = Array.isArray(oRow._Items) ? oRow._Items : [];
            var sOrderDate = oRow.OrderDate || oRow.CreatedAt || "";
            return {
                orderId: oRow.OrderID,
                userId: oRow.UserID,
                cartId: oRow.CartID,
                orderDate: String(sOrderDate).replace(/[^0-9]/g, "").slice(0, 8),
                orderDateDisplay: formatDate(sOrderDate),
                orderTime: oRow.OrderTime || "",
                totalAmount: parseFloat(oRow.TotalAmount) || 0,
                totalAmountText: oRow.TotalAmount,
                currency: oRow.Currency || "VND",
                orderStatus: oRow.OrderStatus || "Unknown",
                paymentStatus: oRow.PaymentStatus || "Unknown",
                note: oRow.Note || "",
                createdAt: oRow.CreatedAt || "",
                isHidden: this._getHiddenOrderIds().indexOf(oRow.OrderID) !== -1,
                items: aItems.map(function (oItem) {
                    return {
                        foodId: oItem.FoodID,
                        foodName: oItem.FoodName || "",
                        quantity: oItem.Quantity,
                        unitPrice: parseFloat(oItem.UnitPrice) || 0,
                        currency: oItem.Currency || "VND",
                        lineAmount: parseFloat(oItem.LineAmount) || 0,
                        itemStatus: oItem.ItemStatus || ""
                    };
                })
            };
        },

        /** Đọc và trả về Status Options phục vụ xử lý nội bộ. */
        _getStatusOptions: function (aOrders) {
            var mStatuses = {};
            (aOrders || []).forEach(function (oOrder) { mStatuses[oOrder.orderStatus] = true; });
            return [{ key: "", text: "All statuses" }].concat(Object.keys(mStatuses).sort().map(function (sStatus) {
                return { key: sStatus, text: sStatus };
            }));
        },

        /** Xử lý sự kiện Filter Change từ giao diện người dùng. */
        onFilterChange: function () {
            this._applyFilters();
        },

        /** Xử lý sự kiện Toggle Hidden Orders từ giao diện người dùng. */
        onToggleHiddenOrders: function (oEvent) {
            var oModel = this.getOwnerComponent().getModel("orders");
            oModel.setProperty("/showHidden", oEvent.getParameter("pressed"));
            this._applyFilters();
        },

        /** Hàm nội bộ thực hiện apply Filters. */
        _applyFilters: function () {
            var oModel = this.getOwnerComponent().getModel("orders");
            if (!oModel) { return; }
            var sFrom = this.byId("fromDate") ? this.byId("fromDate").getValue() : "";
            var sTo = this.byId("toDate") ? this.byId("toDate").getValue() : "";
            var sStatus = this.byId("statusFilter") ? this.byId("statusFilter").getSelectedKey() : "";
            var aOrders = oModel.getProperty("/orders") || [];
            var bShowHidden = Boolean(oModel.getProperty("/showHidden"));

            oModel.setProperty("/filteredOrders", aOrders.filter(function (oOrder) {
                return (!sFrom || oOrder.orderDate >= sFrom) &&
                    (!sTo || oOrder.orderDate <= sTo) &&
                    (!sStatus || oOrder.orderStatus === sStatus) &&
                    Boolean(oOrder.isHidden) === bShowHidden;
            }));
        },

        /** Xử lý sự kiện Soft Delete Order từ giao diện người dùng. */
        onSoftDeleteOrder: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext("orders");
            var oOrder = oContext && oContext.getObject();

            if (!oOrder) {
                return;
            }

            if (oOrder.isHidden) {
                this._setOrderHidden(oOrder.orderId, false);
                MessageToast.show("Order restored to My Orders.");
                return;
            }

            MessageBox.confirm(
                "Hide order " + oOrder.orderId + " from My Orders? The SAP order and payment data will not be deleted.",
                {
                    title: "Hide order",
                    actions: ["Hide", MessageBox.Action.CANCEL],
                    emphasizedAction: "Hide",
                    onClose: function (sAction) {
                        if (sAction === "Hide") {
                            this._setOrderHidden(oOrder.orderId, true);
                            MessageToast.show("Order hidden from My Orders.");
                        }
                    }.bind(this)
                }
            );
        },

        /** Hàm nội bộ thực hiện set Order Hidden. */
        _setOrderHidden: function (sOrderId, bHidden) {
            var oModel = this.getOwnerComponent().getModel("orders");
            var aOrders = oModel.getProperty("/orders") || [];
            var aHiddenOrderIds = this._getHiddenOrderIds();
            var iHiddenIndex = aHiddenOrderIds.indexOf(sOrderId);

            if (bHidden && iHiddenIndex === -1) {
                aHiddenOrderIds.push(sOrderId);
            } else if (!bHidden && iHiddenIndex !== -1) {
                aHiddenOrderIds.splice(iHiddenIndex, 1);
            }

            aOrders.forEach(function (oOrder) {
                if (oOrder.orderId === sOrderId) {
                    oOrder.isHidden = bHidden;
                }
            });
            this._saveHiddenOrderIds(aHiddenOrderIds);
            oModel.setProperty("/orders", aOrders.slice());
            this._applyFilters();
        },

        /** Đọc và trả về Hidden Storage Key phục vụ xử lý nội bộ. */
        _getHiddenStorageKey: function () {
            var oSession = this.getOwnerComponent().getModel("session");
            var sUserId = String(oSession && oSession.getProperty("/userId") || "anonymous");
            return "sap490g7.hiddenOrders." + sUserId;
        },

        /** Đọc và trả về Hidden Order Ids phục vụ xử lý nội bộ. */
        _getHiddenOrderIds: function () {
            try {
                var aOrderIds = JSON.parse(window.localStorage.getItem(this._getHiddenStorageKey()) || "[]");
                return Array.isArray(aOrderIds) ? aOrderIds : [];
            } catch (oError) {
                return [];
            }
        },

        /** Hàm nội bộ thực hiện save Hidden Order Ids. */
        _saveHiddenOrderIds: function (aOrderIds) {
            try {
                window.localStorage.setItem(this._getHiddenStorageKey(), JSON.stringify(aOrderIds));
            } catch (oError) {
                console.warn("Could not save hidden orders:", oError);
            }
        },

        /** Xử lý sự kiện Order Press từ giao diện người dùng. */
        onOrderPress: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext("orders");
            var sOrderId = oContext && oContext.getProperty("orderId");
            if (sOrderId) {
                this.getOwnerComponent().getRouter().navTo("RouteMyOrderDetail", { orderId: sOrderId });
            }
        },

        /** Xử lý sự kiện Back từ giao diện người dùng. */
        onBack: function () {
            this.getOwnerComponent().getRouter().navTo("RouteFoodList", {}, true);
        }
    });
});
