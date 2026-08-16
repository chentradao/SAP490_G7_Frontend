sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox"
], function (Controller, JSONModel, MessageBox) {
    "use strict";

    return Controller.extend("sap490g7fioriapp.controller.RevenueAnalytics", {
        onInit: function () {
            this.getView().setModel(new JSONModel({
                busy: false, rangeDays: "7", allRows: [], rows: [], chartHtml: "", currency: "VND",
                revenueText: "0", purchaseCostText: "0", balanceText: "0",
                successfulOrders: 0, cancelledOrders: 0, cancelledAmountText: "0",
                message: "Revenue and purchase costs supplied by AdminFinanceDaily."
            }), "analytics");
            this.getOwnerComponent().getRouter().getRoute("RouteRevenueAnalytics")
                .attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            const oSession = this.getOwnerComponent().getModel("session");
            const sRole = String(oSession && oSession.getProperty("/role") || "").toUpperCase();
            if (!oSession || !oSession.getProperty("/isLoggedIn") || !["STAFF", "ADMIN"].includes(sRole)) {
                MessageBox.warning("Only STAFF or ADMIN can access Revenue Analytics.");
                this.getOwnerComponent().getRouter().navTo("RouteLogin", {}, true);
                return;
            }
            this._loadAnalytics();
        },

        _loadAnalytics: async function () {
            const oAnalytics = this.getView().getModel("analytics");
            oAnalytics.setProperty("/busy", true);
            try {
                const oBinding = this.getOwnerComponent().getModel().bindList(
                    "/AdminFinanceDaily", undefined, undefined, undefined, {
                        $$groupId: "$direct",
                        $select: "BusinessDate,Currency,SuccessfulOrderCount,Revenue,CancelledOrderCount,CancelledOrderAmount,PurchaseCost"
                    }
                );
                const aContexts = await oBinding.requestContexts(0, 1000);
                const aRows = aContexts.map(function (oContext) {
                    const oRow = oContext.getObject();
                    const fRevenue = Number(oRow.Revenue || 0);
                    const fPurchaseCost = Number(oRow.PurchaseCost || 0);
                    return {
                        date: this._normalizeDate(oRow.BusinessDate), currency: oRow.Currency || "VND",
                        successfulOrders: Number(oRow.SuccessfulOrderCount || 0), revenue: fRevenue,
                        purchaseCost: fPurchaseCost, balance: fRevenue - fPurchaseCost,
                        cancelledOrders: Number(oRow.CancelledOrderCount || 0),
                        cancelledAmount: Number(oRow.CancelledOrderAmount || 0)
                    };
                }.bind(this)).sort(function (a, b) { return a.date.localeCompare(b.date); });
                oAnalytics.setProperty("/allRows", aRows);
                this._applyRange();
            } catch (oError) {
                MessageBox.error(oError.message || "Could not load AdminFinanceDaily analytics.");
                oAnalytics.setProperty("/allRows", []);
                this._applyRange();
            } finally {
                oAnalytics.setProperty("/busy", false);
            }
        },

        onRangeChange: function () { this._applyRange(); },

        _applyRange: function () {
            const oAnalytics = this.getView().getModel("analytics");
            const aAllRows = oAnalytics.getProperty("/allRows") || [];
            const sRange = oAnalytics.getProperty("/rangeDays") || "7";
            let aRows = aAllRows.slice();
            if (sRange !== "ALL" && aAllRows.length) {
                const oStartDate = new Date(aAllRows[aAllRows.length - 1].date + "T00:00:00");
                oStartDate.setDate(oStartDate.getDate() - Number(sRange) + 1);
                aRows = aAllRows.filter(function (oRow) {
                    return new Date(oRow.date + "T00:00:00") >= oStartDate;
                });
            }
            const oTotals = aRows.reduce(function (oTotal, oRow) {
                oTotal.revenue += oRow.revenue; oTotal.purchaseCost += oRow.purchaseCost;
                oTotal.balance += oRow.balance; oTotal.successfulOrders += oRow.successfulOrders;
                oTotal.cancelledOrders += oRow.cancelledOrders; oTotal.cancelledAmount += oRow.cancelledAmount;
                return oTotal;
            }, { revenue: 0, purchaseCost: 0, balance: 0, successfulOrders: 0, cancelledOrders: 0, cancelledAmount: 0 });
            oAnalytics.setProperty("/rows", aRows.slice().reverse());
            oAnalytics.setProperty("/currency", aRows.length ? aRows[aRows.length - 1].currency : "VND");
            oAnalytics.setProperty("/revenueText", this.formatAmount(oTotals.revenue));
            oAnalytics.setProperty("/purchaseCostText", this.formatAmount(oTotals.purchaseCost));
            oAnalytics.setProperty("/balanceText", this.formatAmount(oTotals.balance));
            oAnalytics.setProperty("/successfulOrders", oTotals.successfulOrders);
            oAnalytics.setProperty("/cancelledOrders", oTotals.cancelledOrders);
            oAnalytics.setProperty("/cancelledAmountText", this.formatAmount(oTotals.cancelledAmount));
            oAnalytics.setProperty("/chartHtml", this._buildSvg(aRows));
        },

        _normalizeDate: function (vDate) {
            const sDate = String(vDate || "").slice(0, 10);
            return /^\d{8}$/.test(sDate) ? sDate.slice(0, 4) + "-" + sDate.slice(4, 6) + "-" + sDate.slice(6, 8) : sDate;
        },

        _buildSvg: function (aRows) {
            if (!aRows.length) { return '<div style="padding:4rem;text-align:center;color:#5b738b">No finance data for this period.</div>'; }
            const iWidth = 1100, iHeight = 430, iLeft = 105, iTop = 35, iPlotWidth = 930, iPlotHeight = 310;
            const aValues = [];
            aRows.forEach(function (oRow) { aValues.push(oRow.revenue, oRow.purchaseCost, Math.max(0, oRow.balance)); });
            const fScaleMax = Math.max.apply(Math, aValues.concat([1])) * 1.1;
            const getX = function (i) { return iLeft + (aRows.length === 1 ? iPlotWidth / 2 : i * iPlotWidth / (aRows.length - 1)); };
            const getY = function (v) { return iTop + iPlotHeight - Math.max(0, Number(v || 0)) / fScaleMax * iPlotHeight; };
            const compact = function (v) { return Number(v || 0).toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 }); };
            const series = function (sKey, sColor, sLabel) {
                const sPoints = aRows.map(function (oRow, i) { return getX(i).toFixed(1) + "," + getY(oRow[sKey]).toFixed(1); }).join(" ");
                const sDots = aRows.map(function (oRow, i) {
                    const sTitle = sLabel + " " + oRow.date + ": " + Number(oRow[sKey]).toLocaleString("en-US") + " " + oRow.currency;
                    return '<circle cx="' + getX(i).toFixed(1) + '" cy="' + getY(oRow[sKey]).toFixed(1) + '" r="5" fill="' + sColor + '"><title>' + sTitle + '</title></circle>';
                }).join("");
                return '<polyline fill="none" stroke="' + sColor + '" stroke-width="4" stroke-linejoin="round" points="' + sPoints + '"/>' + sDots;
            };
            let sGrid = "";
            for (let i = 0; i <= 4; i += 1) {
                const y = iTop + iPlotHeight * i / 4;
                sGrid += '<line x1="' + iLeft + '" y1="' + y + '" x2="' + (iLeft + iPlotWidth) + '" y2="' + y + '" stroke="#d9e2ec"/>' +
                    '<text x="' + (iLeft - 12) + '" y="' + (y + 5) + '" text-anchor="end" font-size="12" fill="#475e75">' + compact(fScaleMax * (4 - i) / 4) + '</text>';
            }
            const iStep = Math.max(1, Math.ceil(aRows.length / 10));
            const sLabels = aRows.map(function (oRow, i) {
                return (i % iStep === 0 || i === aRows.length - 1) ? '<text x="' + getX(i) + '" y="375" text-anchor="middle" font-size="12" fill="#475e75">' + oRow.date.slice(5) + '</text>' : "";
            }).join("");
            return '<div class="revenueChart"><svg viewBox="0 0 ' + iWidth + ' ' + iHeight + '">' + sGrid +
                series("revenue", "#0a6ed1", "Revenue") + series("purchaseCost", "#e9730c", "Purchase Cost") +
                series("balance", "#107e3e", "Balance") + sLabels + '<text x="25" y="28" font-size="12" fill="#475e75">VND</text></svg></div>';
        },

        formatAmount: function (v) { return Number(v || 0).toLocaleString("en-US", { maximumFractionDigits: 0 }); },
        formatDate: function (sDate) {
            if (!sDate) { return "-"; }
            const oDate = new Date(String(sDate) + "T00:00:00");
            return Number.isNaN(oDate.getTime()) ? String(sDate) : oDate.toLocaleDateString("vi-VN");
        },
        formatBalanceState: function (v) { return Number(v || 0) >= 0 ? "Success" : "Error"; },
        onRefresh: function () { this._loadAnalytics(); },
        onBack: function () { this.getOwnerComponent().getRouter().navTo("RouteStaffDashboard", {}, true); }
    });
});
