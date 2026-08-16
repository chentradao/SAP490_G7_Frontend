sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap490g7fioriapp/model/sessionUtils"
], function (Controller, JSONModel, MessageBox, sessionUtils) {
    "use strict";

    return Controller.extend("sap490g7fioriapp.controller.StaffDashboard", {
        onInit: function () {
            this.getView().setModel(new JSONModel({
                lowStockCount: 0,
                lowStockColor: "Neutral",
                purchaseOrderCount: 0,
                goodsReceiptCount: 0,
                activeProductionCount: 0,
                goodsIssueCount: 0,
                productionGoodsReceiptCount: 0,
                todayConfirmedCount: 0,
                todayCancelledCount: 0,
                todayRevenueText: "0",
                todayItemsSold: 0
            }), "dashboard");

            this.getOwnerComponent().getRouter().getRoute("RouteStaffDashboard")
                .attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            const oSession = this.getOwnerComponent().getModel("session");
            const sRole = String(oSession && oSession.getProperty("/role") || "").toUpperCase();
            const bCanAccessDashboard = Boolean(
                oSession &&
                oSession.getProperty("/isLoggedIn") &&
                (sRole === "STAFF" || sRole === "ADMIN")
            );

            if (!bCanAccessDashboard) {
                MessageBox.warning("Only STAFF or ADMIN can access Staff Operations.");
                this.getOwnerComponent().getRouter().navTo("RouteLogin", {}, true);
                return;
            }

            this.onRefresh();
        },

        onRefresh: async function () {
            const oModel = this.getOwnerComponent().getModel();
            const oDashboard = this.getView().getModel("dashboard");

            const requestObjects = async function (sPath, sSelect, mParameters) {
                const oBinding = oModel.bindList(sPath, undefined, undefined, undefined, {
                    $$groupId: "$direct",
                    $select: sSelect,
                    ...(mParameters || {})
                });
                const aContexts = await oBinding.requestContexts(0, 500);
                return aContexts.map(function (oContext) {
                    return oContext.getObject();
                });
            };

            try {
                const aResults = await Promise.all([
                    requestObjects("/RawStock", "Material,AvailableQuantity,ReorderPoint"),
                    requestObjects("/ZP_G7_PO_REQUEST", "request_id,status,purchase_order"),
                    requestObjects("/GoodsReceiptRequests", "request_id,status,material_document"),
                    requestObjects("/ProductionOrderRequests", "request_id,status,production_order,goods_issue_status,goods_receipt_status"),
                    requestObjects("/ProductionConfirmationHistory", "confirmation_id,confirmation_status"),
                    requestObjects("/Orders", "OrderID,OrderDate,OrderStatus,PaymentStatus,TotalAmount", { $expand: "_Items($select=Quantity)" })
                ]);

                const iLowStock = aResults[0].filter(function (oItem) {
                    return Number(oItem.AvailableQuantity || 0) <= Number(oItem.ReorderPoint || 0);
                }).length;
                const iPurchaseOrders = aResults[1].filter(function (oItem) {
                    return Boolean(oItem.purchase_order) || String(oItem.status || "").toUpperCase() === "PENDING";
                }).length;
                const iGoodsReceipts = aResults[2].filter(function (oItem) {
                    return Boolean(oItem.material_document) || String(oItem.status || "").toUpperCase() === "POSTED";
                }).length;
                const iActiveProduction = aResults[3].filter(function (oItem) {
                    return ["PENDING", "CREATED", "RELEASED", "GOODS_ISSUED"].includes(
                        String(oItem.status || "").toUpperCase()
                    );
                }).length;
                const iGoodsIssues = aResults[3].filter(function (oItem) {
                    return String(oItem.goods_issue_status || "").toUpperCase() === "POSTED";
                }).length;
                const iProductionGoodsReceipts = aResults[3].filter(function (oItem) {
                    return String(oItem.goods_receipt_status || "").toUpperCase() === "POSTED";
                }).length;

                const oToday = new Date();
                const sTodayCompact = [oToday.getFullYear(), String(oToday.getMonth() + 1).padStart(2, "0"), String(oToday.getDate()).padStart(2, "0")].join("");
                const sTodayIso = [oToday.getFullYear(), String(oToday.getMonth() + 1).padStart(2, "0"), String(oToday.getDate()).padStart(2, "0")].join("-");
                const aTodayOrders = aResults[5].filter(function (oOrder) {
                    const sDate = String(oOrder.OrderDate || "").slice(0, 10);
                    return sDate === sTodayCompact || sDate === sTodayIso;
                });
                const iConfirmed = aTodayOrders.filter(function (oOrder) {
                    return String(oOrder.OrderStatus || "").toUpperCase() === "CONFIRMED";
                }).length;
                const iCancelled = aTodayOrders.filter(function (oOrder) {
                    return String(oOrder.OrderStatus || "").toUpperCase() === "CANCELLED";
                }).length;
                const aPaidOrders = aTodayOrders.filter(function (oOrder) {
                    return String(oOrder.PaymentStatus || "").toUpperCase() === "PAID";
                });
                const fRevenue = aPaidOrders.reduce(function (fTotal, oOrder) {
                    return fTotal + (Number(oOrder.TotalAmount) || 0);
                }, 0);
                const iItemsSold = aPaidOrders.reduce(function (iTotal, oOrder) {
                    return iTotal + (oOrder._Items || []).reduce(function (iOrderTotal, oItem) {
                        return iOrderTotal + (Number(oItem.Quantity) || 0);
                    }, 0);
                }, 0);

                oDashboard.setData({
                    lowStockCount: iLowStock,
                    lowStockColor: iLowStock > 0 ? "Error" : "Good",
                    purchaseOrderCount: iPurchaseOrders,
                    goodsReceiptCount: iGoodsReceipts,
                    activeProductionCount: iActiveProduction,
                    goodsIssueCount: iGoodsIssues,
                    productionGoodsReceiptCount: iProductionGoodsReceipts,
                    confirmationCount: aResults[4].length,
                    todayConfirmedCount: iConfirmed,
                    todayCancelledCount: iCancelled,
                    todayRevenueText: fRevenue.toLocaleString("en-US", { maximumFractionDigits: 0 }),
                    todayItemsSold: iItemsSold
                });
            } catch (oError) {
                // Navigation remains usable even when one summary endpoint is unavailable.
                MessageBox.warning("The dashboard could not refresh all summary counts.");
            }
        },

        _navTo: function (sRoute) {
            this.getOwnerComponent().getRouter().navTo(sRoute);
        },

        onOpenPIRPlanning: function () { this._navTo("RoutePIRPlanning"); },
        onOpenMRPResults: function () { this._navTo("RouteMRPResults"); },
        onOpenMaterialStock: function () { this._navTo("RouteMaterialStock"); },
        onOpenPOHistory: function () { this._navTo("RoutePOHistory"); },
        onOpenGRHistory: function () { this._navTo("RouteGRHistory"); },
        onOpenProductionOrder: function () { this._navTo("RouteProductionOrder"); },
        onOpenProductionHistory: function () { this._navTo("RouteProductionOrderHistory"); },
        onOpenGoodsIssueHistory: function () { this._navTo("RouteProductionGoodsIssueHistory"); },
        onOpenGoodsReceiptHistory: function () { this._navTo("RouteProductionGoodsReceiptHistory"); },
        onOpenDailyFinishedGoodsIssue: function () { this._navTo("RouteDailyFinishedGoodsIssue"); },
        onOpenDailyFinishedGoodsIssueHistory: function () { this._navTo("RouteDailyFinishedGoodsIssueHistory"); },
        onOpenFoodStatus: function () { this._navTo("RouteFoodStatus"); },
        onOpenRevenueAnalytics: function () { this._navTo("RouteRevenueAnalytics"); },

        onLogout: function () {
            const oSession = this.getOwnerComponent().getModel("session");
            sessionUtils.resetSession(oSession);
            this.getOwnerComponent().getRouter().navTo("RouteLogin", {}, true);
        }
    });
});
