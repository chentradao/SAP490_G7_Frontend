/*
 * Test AllJourneys: định nghĩa dữ liệu chuẩn bị, thao tác mô phỏng và assertion cho luồng UI5 tương ứng.
 */
sap.ui.define([
	"sap/ui/test/Opa5",
	"./arrangements/Startup",
	"./NavigationJourney"
], function (Opa5, Startup) {
	"use strict";

	Opa5.extendConfig({
		arrangements: new Startup(),
		viewNamespace: "sap490g7fioriapp.view.",
		autoWait: true
	});
});
