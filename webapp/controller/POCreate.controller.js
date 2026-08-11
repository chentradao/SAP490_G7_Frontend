sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageBox"
], function (Controller, JSONModel, MessageBox) {
  "use strict";

  return Controller.extend("sap490g7fioriapp.controller.POCreate", {

    onInit: function () {
      const oUiModel = new JSONModel({
        showStockInfo: false,
        showPOForm: false,
        busy: false,
        material: "",
        description: "",
        plant: "",
        storageLoc: "",
        unit: "",
        stock: "",
        vendor: "",
        quantity: "",
        price: "",
        currency: "",
        purchOrg: "",
        purchGroup: ""
      });
      this.getView().setModel(oUiModel, "ui");
    },

    onMaterialChange: function (oEvent) {
      const oSelectedItem = oEvent.getParameter("selectedItem");
      if (!oSelectedItem) {
        return;
      }
      const oContext = oSelectedItem.getBindingContext();
      const oStock = oContext.getObject();
      const oUiModel = this.getView().getModel("ui");

      oUiModel.setProperty("/material", oStock.Material);
      oUiModel.setProperty("/description", oStock.MaterialDescription);
      oUiModel.setProperty("/plant", oStock.Plant);
      oUiModel.setProperty("/storageLoc", oStock.StorageLocation);
      oUiModel.setProperty("/unit", oStock.MaterialBaseUnit);
      oUiModel.setProperty("/stock", oStock.StockQuantity);
      oUiModel.setProperty("/showStockInfo", true);
      oUiModel.setProperty("/showPOForm", false);
    },

    onOpenPOForm: function () {
      this.getView().getModel("ui").setProperty("/showPOForm", true);
    },

    onCreatePOConfirm: async function () {
      const oUiModel = this.getView().getModel("ui");
      const oData = oUiModel.getData();

      if (!oData.vendor || !oData.quantity || !oData.price || !oData.currency || !oData.purchOrg || !oData.purchGroup) {
        MessageBox.warning("Please enter all required information.");
        return;
      }

      oUiModel.setProperty("/busy", true);

      try {
        const oModel = this.getOwnerComponent().getModel();
        const oListBinding = oModel.bindList("/ZC_G7_PO_REQUEST");

        const oNewContext = oListBinding.create({
          vendor: oData.vendor,
          material: oData.material,
          quantity: oData.quantity,
          unit: oData.unit,
          price: oData.price,
          currency: oData.currency,
          company_code: "1000", // TODO: confirm the actual company code.
          plant: oData.plant,
          storage_loc: oData.storageLoc,
          purch_org: oData.purchOrg,
          purch_group: oData.purchGroup
        });

        await oNewContext.created();

        // TODO: confirm the exact namespace after refreshing zsd_g7_canteen $metadata.
        const oActionBinding = oModel.bindContext(
          "com.sap.gateway.srvd.zsd_g7_canteen.v0001.CreatePurchaseOrder(...)",
          oNewContext
        );
        await oActionBinding.execute();

        const oResultContext = oActionBinding.getBoundContext();
        const oResult = oResultContext.getObject();

        MessageBox.success(
          `PO created successfully. PO number: ${oResult.purchase_order}`,
          { onClose: () => this._resetForm() }
        );

      } catch (oError) {
        MessageBox.error("Could not create PO: " + (oError.message || oError));
      } finally {
        oUiModel.setProperty("/busy", false);
      }
    },

    _resetForm: function () {
      const oUiModel = this.getView().getModel("ui");
      oUiModel.setData({
        showStockInfo: false, showPOForm: false, busy: false,
        material: "", description: "", plant: "", storageLoc: "", unit: "", stock: "",
        vendor: "", quantity: "", price: "", currency: "", purchOrg: "", purchGroup: ""
      });
      this.byId("materialSelect").setSelectedKey("");
    },

    onNavBack: function () {
      this.getOwnerComponent().getRouter().navTo("RouteFoodList");
    }
  });
});
