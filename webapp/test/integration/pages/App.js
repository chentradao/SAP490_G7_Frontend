/*
 * Test App: định nghĩa dữ liệu chuẩn bị, thao tác mô phỏng và assertion cho luồng UI5 tương ứng.
 */
sap.ui.define([
	"sap/ui/test/Opa5"
], function (Opa5) {
	"use strict";
	var sViewName = "App";
	
	Opa5.createPageObjects({
		onTheAppPage: {

			actions: {},

			assertions: {

				iShouldSeeTheApp: function () {
					return this.waitFor({
						id: "app",
						viewName: sViewName,
						success: function () {
							Opa5.assert.ok(true, "The " + sViewName + " view is displayed");
						},
						errorMessage: "Did not find the " + sViewName + " view"
					});
				}
			}
		}
	});

});
