/* global QUnit */
QUnit.config.autostart = false;

sap.ui.getCore().attachInit(function () {
	"use strict";

	sap.ui.require([
		"sap490g7fioriapp/test/unit/AllTests"
	], function () {
		QUnit.start();
	});
});
