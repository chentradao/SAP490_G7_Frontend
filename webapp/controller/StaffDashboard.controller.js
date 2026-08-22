/*
 * Controller StaffDashboard.controller: điều phối trạng thái, sự kiện giao diện và các lời gọi backend của màn hình.
 * Các hàm on... là event handler; các hàm bắt đầu bằng _ là helper chỉ dùng nội bộ controller.
 */
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap490g7fioriapp/model/sessionUtils"
], function (Controller, JSONModel, MessageBox, sessionUtils) {
    "use strict";

    return Controller.extend("sap490g7fioriapp.controller.StaffDashboard", {
        /** Khởi tạo model trạng thái và đăng ký các sự kiện điều hướng của màn hình. */
        onInit: function () {
            this.getView().setModel(new JSONModel({
                lowStockCount: 0,
                lowStockColor: "Neutral",
                purchaseOrderCount: 0,
                goodsReceiptCount: 0,
                activeProductionCount: 0,
                goodsIssueCount: 0,
                productionGoodsReceiptCount: 0,
                financePeriod: "TODAY",
                financePeriodLabel: "Today",
                financeSuccessfulCount: 0,
                financeCancelledCount: 0,
                financeRevenueText: "0",
                financeCancelledAmountText: "0",
                financePurchaseCostText: "0",
                financeCurrency: "VND",
                financeDataAvailable: true,
                financeMessage: ""
            }), "dashboard");

            this.getOwnerComponent().getRouter().getRoute("RouteStaffDashboard")
                .attachPatternMatched(this._onRouteMatched, this);
        },

        /** Kiểm tra quyền truy cập và chuẩn bị dữ liệu mỗi khi route được mở. */
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

        /** Tải lại dữ liệu mới nhất cho các binding đang hiển thị. */
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
                    requestObjects("/Orders", "OrderID,OrderDate,OrderStatus,PaymentStatus,TotalAmount,Currency"),
                    requestObjects(
                        "/AdminFinanceDaily",
                        "BusinessDate,Currency,SuccessfulOrderCount,Revenue,CancelledOrderCount,CancelledOrderAmount,PurchaseCost"
                    ).catch(function (oError) {
                        console.error("AdminFinanceDaily could not be loaded:", oError);
                        return null;
                    })
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

                const bFinanceDataAvailable = Array.isArray(aResults[6]);
                this._financeOrders = aResults[5];
                this._financeDailyRows = bFinanceDataAvailable ? aResults[6] : [];
                this._financeDataAvailable = bFinanceDataAvailable;

                oDashboard.setData({
                    lowStockCount: iLowStock,
                    lowStockColor: iLowStock > 0 ? "Error" : "Good",
                    purchaseOrderCount: iPurchaseOrders,
                    goodsReceiptCount: iGoodsReceipts,
                    activeProductionCount: iActiveProduction,
                    goodsIssueCount: iGoodsIssues,
                    productionGoodsReceiptCount: iProductionGoodsReceipts,
                    confirmationCount: aResults[4].length,
                    financePeriod: oDashboard.getProperty("/financePeriod") || "TODAY",
                    financePeriodLabel: "",
                    financeSuccessfulCount: 0,
                    financeCancelledCount: 0,
                    financeRevenueText: "0",
                    financeCancelledAmountText: "0",
                    financePurchaseCostText: "0",
                    financeCurrency: "VND",
                    financeDataAvailable: bFinanceDataAvailable,
                    financeMessage: bFinanceDataAvailable ? "" :
                        "Purchase cost is unavailable. Sales KPIs are temporarily calculated from Orders."
                });
                this._applyFinancePeriod();
            } catch (oError) {
                // Navigation remains usable even when one summary endpoint is unavailable.
                MessageBox.warning("The dashboard could not refresh all summary counts.");
            }
        },

        /** Xử lý sự kiện Finance Period Change từ giao diện người dùng. */
        onFinancePeriodChange: function (oEvent) {
            this.getView().getModel("dashboard").setProperty(
                "/financePeriod",
                oEvent.getParameter("item").getKey()
            );
            this._applyFinancePeriod();
        },

        /** Hàm nội bộ thực hiện apply Finance Period. */
        _applyFinancePeriod: function () {
            const oDashboard = this.getView().getModel("dashboard");
            const sPeriod = oDashboard.getProperty("/financePeriod") || "TODAY";
            const oRange = this._getFinanceRange(sPeriod);
            const isInRange = function (vDate) {
                const sDate = this._normalizeBusinessDate(vDate);
                return sDate && sDate >= oRange.start && sDate <= oRange.end;
            }.bind(this);
            const aOrders = (this._financeOrders || []).filter(function (oOrder) {
                return isInRange(oOrder.OrderDate);
            });
            const aSuccessfulOrders = aOrders.filter(function (oOrder) {
                const sOrderStatus = String(oOrder.OrderStatus || "").toUpperCase();
                return String(oOrder.PaymentStatus || "").toUpperCase() === "PAID" &&
                    ["CONFIRMED", "COMPLETED"].includes(sOrderStatus);
            });
            const aCancelledOrders = aOrders.filter(function (oOrder) {
                return String(oOrder.OrderStatus || "").toUpperCase() === "CANCELLED";
            });
            const oFallback = {
                successful: aSuccessfulOrders.length,
                revenue: aSuccessfulOrders.reduce(function (fTotal, oOrder) {
                    return fTotal + (Number(oOrder.TotalAmount) || 0);
                }, 0),
                cancelled: aCancelledOrders.length,
                cancelledAmount: aCancelledOrders.reduce(function (fTotal, oOrder) {
                    return fTotal + (Number(oOrder.TotalAmount) || 0);
                }, 0),
                purchaseCost: 0
            };
            const oFinance = (this._financeDailyRows || []).filter(function (oRow) {
                return isInRange(oRow.BusinessDate) &&
                    String(oRow.Currency || "VND").toUpperCase() === "VND";
            }).reduce(function (oTotal, oRow) {
                oTotal.successful += Number(oRow.SuccessfulOrderCount) || 0;
                oTotal.revenue += Number(oRow.Revenue) || 0;
                oTotal.cancelled += Number(oRow.CancelledOrderCount) || 0;
                oTotal.cancelledAmount += Number(oRow.CancelledOrderAmount) || 0;
                oTotal.purchaseCost += Number(oRow.PurchaseCost) || 0;
                return oTotal;
            }, {
                successful: 0,
                revenue: 0,
                cancelled: 0,
                cancelledAmount: 0,
                purchaseCost: 0
            });
            const oTotals = this._financeDataAvailable ? oFinance : oFallback;
            const formatAmount = function (fAmount) {
                return Number(fAmount || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
            };

            oDashboard.setProperty("/financePeriodLabel", oRange.label);
            oDashboard.setProperty("/financeSuccessfulCount", oTotals.successful);
            oDashboard.setProperty("/financeCancelledCount", oTotals.cancelled);
            oDashboard.setProperty("/financeRevenueText", formatAmount(oTotals.revenue));
            oDashboard.setProperty("/financeCancelledAmountText", formatAmount(oTotals.cancelledAmount));
            oDashboard.setProperty(
                "/financePurchaseCostText",
                this._financeDataAvailable ? formatAmount(oTotals.purchaseCost) : "—"
            );
        },

        /** Đọc và trả về Finance Range phục vụ xử lý nội bộ. */
        _getFinanceRange: function (sPeriod) {
            const oToday = new Date();
            const oStart = new Date(oToday.getFullYear(), oToday.getMonth(), oToday.getDate());
            const oEnd = new Date(oStart);

            if (sPeriod === "WEEK") {
                const iDaysFromMonday = (oToday.getDay() + 6) % 7;
                oStart.setDate(oStart.getDate() - iDaysFromMonday);
                oEnd.setDate(oStart.getDate() + 6);
            } else if (sPeriod === "MONTH") {
                oStart.setDate(1);
                oEnd.setMonth(oEnd.getMonth() + 1, 0);
            }

            const formatIso = function (oDate) {
                return [
                    oDate.getFullYear(),
                    String(oDate.getMonth() + 1).padStart(2, "0"),
                    String(oDate.getDate()).padStart(2, "0")
                ].join("-");
            };
            const formatDisplay = function (oDate) {
                return oDate.toLocaleDateString("en-GB");
            };

            return {
                start: formatIso(oStart),
                end: formatIso(oEnd),
                label: sPeriod === "TODAY" ? formatDisplay(oStart) :
                    formatDisplay(oStart) + " - " + formatDisplay(oEnd)
            };
        },

        /** Hàm nội bộ thực hiện normalize Business Date. */
        _normalizeBusinessDate: function (vDate) {
            if (vDate instanceof Date && !Number.isNaN(vDate.getTime())) {
                return [
                    vDate.getFullYear(),
                    String(vDate.getMonth() + 1).padStart(2, "0"),
                    String(vDate.getDate()).padStart(2, "0")
                ].join("-");
            }
            const sDate = String(vDate || "").slice(0, 10);
            return /^\d{8}$/.test(sDate) ?
                sDate.slice(0, 4) + "-" + sDate.slice(4, 6) + "-" + sDate.slice(6, 8) :
                sDate;
        },

        /** Hàm nội bộ thực hiện nav To. */
        _navTo: function (sRoute) {
            this.getOwnerComponent().getRouter().navTo(sRoute);
        },

        /** Xử lý sự kiện Open PIR Planning từ giao diện người dùng. */
        onOpenPIRPlanning: function () { this._navTo("RoutePIRPlanning"); },
        /** Xử lý sự kiện Open MRP Run. */
        onOpenMRPRun: function () { this._navTo("RouteMRPRun"); },
        /** Xử lý sự kiện Open MRP Results từ giao diện người dùng. */
        onOpenMRPResults: function () { this._navTo("RouteMRPResults"); },
        /** Xử lý sự kiện Open Material Stock từ giao diện người dùng. */
        onOpenMaterialStock: function () { this._navTo("RouteMaterialStock"); },
        /** Xử lý sự kiện Open PO History từ giao diện người dùng. */
        onOpenPOHistory: function () { this._navTo("RoutePOHistory"); },
        /** Xử lý sự kiện Open GR History từ giao diện người dùng. */
        onOpenGRHistory: function () { this._navTo("RouteGRHistory"); },
        /** Xử lý sự kiện Open Production Order từ giao diện người dùng. */
        onOpenProductionOrder: function () { this._navTo("RouteProductionOrder"); },
        /** Xử lý sự kiện Open Production History từ giao diện người dùng. */
        onOpenProductionHistory: function () { this._navTo("RouteProductionOrderHistory"); },
        /** Xử lý sự kiện Open Goods Issue History từ giao diện người dùng. */
        onOpenGoodsIssueHistory: function () { this._navTo("RouteProductionGoodsIssueHistory"); },
        /** Xử lý sự kiện Open Goods Receipt History từ giao diện người dùng. */
        onOpenGoodsReceiptHistory: function () { this._navTo("RouteProductionGoodsReceiptHistory"); },
        /** Xử lý sự kiện Open Daily Finished Goods Issue từ giao diện người dùng. */
        onOpenDailyFinishedGoodsIssue: function () { this._navTo("RouteDailyFinishedGoodsIssue"); },
        /** Xử lý sự kiện Open Daily Finished Goods Issue History từ giao diện người dùng. */
        onOpenDailyFinishedGoodsIssueHistory: function () { this._navTo("RouteDailyFinishedGoodsIssueHistory"); },
        /** Xử lý sự kiện Open Food Status từ giao diện người dùng. */
        onOpenFoodStatus: function () { this._navTo("RouteFoodStatus"); },
        /** Xử lý sự kiện Open Revenue Analytics từ giao diện người dùng. */
        onOpenRevenueAnalytics: function () { this._navTo("RouteRevenueAnalytics"); },

        /** Xử lý sự kiện Logout từ giao diện người dùng. */
        onLogout: function () {
            const oSession = this.getOwnerComponent().getModel("session");
            sessionUtils.resetSession(oSession);
            this.getOwnerComponent().getRouter().navTo("RouteLogin", {}, true);
        }
    });
});
