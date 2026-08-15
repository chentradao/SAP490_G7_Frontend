sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel"
], function (Controller, JSONModel) {
    "use strict";

    return Controller.extend("sap490g7fioriapp.controller.RevenueAnalytics", {
        onInit: function () {
            this.getView().setModel(new JSONModel({
                chartHtml: "",
                backendAvailable: false,
                message: "Loading analytics..."
            }), "analytics");
            this.getOwnerComponent().getRouter().getRoute("RouteRevenueAnalytics")
                .attachPatternMatched(this._loadAnalytics, this);
        },

        _loadAnalytics: function () {
            this._loadRapAnalytics().then(function (aRows) {
                this._showChart(aRows, true);
            }.bind(this)).catch(function () {
                return this._loadRevenueFallback().then(function (aRows) {
                    this._showChart(aRows, false);
                }.bind(this));
            }.bind(this));
        },

        _loadRapAnalytics: function () {
            return this.getOwnerComponent().getModel().bindList(
                "/SalesAnalyticsDaily", undefined, undefined, undefined,
                { $$groupId: "$direct", $select: "BusinessDate,Revenue,MaterialCost,Profit,Currency" }
            ).requestContexts(0, 31).then(function (aContexts) {
                if (!aContexts.length) { throw new Error("No analytics data"); }
                return aContexts.map(function (oContext) {
                    var oRow = oContext.getObject();
                    return {
                        date: oRow.BusinessDate,
                        revenue: Number(oRow.Revenue) || 0,
                        cost: Number(oRow.MaterialCost) || 0,
                        profit: Number(oRow.Profit) || 0
                    };
                }).sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
            });
        },

        _loadRevenueFallback: function () {
            return this.getOwnerComponent().getModel().bindList(
                "/Orders", undefined, undefined, undefined,
                { $$groupId: "$direct", $select: "OrderDate,PaymentStatus,TotalAmount" }
            ).requestContexts(0, 5000).then(function (aContexts) {
                var oByDate = {};
                aContexts.forEach(function (oContext) {
                    var oOrder = oContext.getObject();
                    if (String(oOrder.PaymentStatus || "").toUpperCase() !== "PAID") { return; }
                    var sDate = this._normalizeDate(oOrder.OrderDate);
                    if (sDate) { oByDate[sDate] = (oByDate[sDate] || 0) + (Number(oOrder.TotalAmount) || 0); }
                }.bind(this));
                return this._lastDays(7).map(function (sDate) {
                    return { date: sDate, revenue: oByDate[sDate] || 0, cost: 0, profit: 0 };
                });
            }.bind(this));
        },

        _normalizeDate: function (vDate) {
            var sDate = String(vDate || "").slice(0, 10);
            return /^\d{8}$/.test(sDate) ? sDate.slice(0, 4) + "-" + sDate.slice(4, 6) + "-" + sDate.slice(6, 8) : sDate;
        },

        _lastDays: function (iDays) {
            var aDates = [];
            for (var i = iDays - 1; i >= 0; i -= 1) {
                var oDate = new Date();
                oDate.setDate(oDate.getDate() - i);
                aDates.push([oDate.getFullYear(), String(oDate.getMonth() + 1).padStart(2, "0"), String(oDate.getDate()).padStart(2, "0")].join("-"));
            }
            return aDates;
        },

        _showChart: function (aRows, bBackendAvailable) {
            var oAnalytics = this.getView().getModel("analytics");
            oAnalytics.setProperty("/backendAvailable", bBackendAvailable);
            oAnalytics.setProperty("/message", bBackendAvailable ?
                "Revenue, BOM material cost and profit supplied by RAP analytics." :
                "Revenue is available. Material cost and profit require the SalesAnalyticsDaily RAP entity described below.");
            oAnalytics.setProperty("/chartHtml", this._buildSvg(aRows, bBackendAvailable));
        },

        _buildSvg: function (aRows, bShowCost) {
            var iWidth = 1000, iHeight = 430, iLeft = 80, iTop = 30, iPlotWidth = 880, iPlotHeight = 320;
            var aValues = [];
            aRows.forEach(function (oRow) {
                aValues.push(oRow.revenue);
                if (bShowCost) { aValues.push(oRow.cost, oRow.profit); }
            });
            var fMax = Math.max.apply(Math, aValues.concat([1]));
            var point = function (vValue, iIndex) {
                var x = iLeft + (aRows.length === 1 ? iPlotWidth / 2 : iIndex * iPlotWidth / (aRows.length - 1));
                var y = iTop + iPlotHeight - (Number(vValue || 0) / fMax * iPlotHeight);
                return x.toFixed(1) + "," + y.toFixed(1);
            };
            var polyline = function (sKey, sColor) {
                return '<polyline fill="none" stroke="' + sColor + '" stroke-width="4" points="' +
                    aRows.map(function (oRow, i) { return point(oRow[sKey], i); }).join(" ") + '"/>';
            };
            var sLabels = aRows.map(function (oRow, i) {
                var x = iLeft + (aRows.length === 1 ? iPlotWidth / 2 : i * iPlotWidth / (aRows.length - 1));
                return '<text x="' + x + '" y="385" text-anchor="middle" font-size="13" fill="#475e75">' + String(oRow.date).slice(5) + '</text>';
            }).join("");
            var sLines = polyline("revenue", "#0a6ed1");
            if (bShowCost) { sLines += polyline("cost", "#e9730c") + polyline("profit", "#107e3e"); }
            return '<div class="revenueChart"><svg viewBox="0 0 ' + iWidth + ' ' + iHeight + '" role="img" aria-label="Revenue, cost and profit line chart">' +
                '<line x1="80" y1="350" x2="960" y2="350" stroke="#8996a5"/><line x1="80" y1="30" x2="80" y2="350" stroke="#8996a5"/>' +
                sLines + sLabels + '</svg></div>';
        },

        onBack: function () {
            this.getOwnerComponent().getRouter().navTo("RouteStaffDashboard", {}, true);
        }
    });
});
