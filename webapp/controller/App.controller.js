sap.ui.define(
    [
        "sap/ui/core/mvc/Controller"
    ],
    function(BaseController) {
      "use strict";
  
      return BaseController.extend("sap490g7fioriapp.controller.App", {
        onInit: function() {
          var oRouter = this.getOwnerComponent().getRouter();
          oRouter.initialize();
        }
      });
    }
  );
  