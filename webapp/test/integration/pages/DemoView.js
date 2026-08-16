/*
 * Test DemoView: định nghĩa dữ liệu chuẩn bị, thao tác mô phỏng và assertion cho luồng UI5 tương ứng.
 */
sap.ui.define([
	"sap/ui/test/Opa5"
], function (Opa5) {
	"use strict";
	var sViewName = "DemoView";
	
	Opa5.createPageObjects({
		onTheViewPage: {

			actions: {},

			assertions: {

				iShouldSeeThePageView: function () {
					return this.waitFor({
						id: "page",
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
