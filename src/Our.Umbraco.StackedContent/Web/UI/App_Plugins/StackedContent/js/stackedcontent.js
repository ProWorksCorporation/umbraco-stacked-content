// Property Editors
angular.module("umbraco").controller("Our.Umbraco.StackedContent.Controllers.StackedContentPropertyEditorController", [

    "$scope",
    "editorState",
    "notificationsService",
    "innerContentService",
    "Our.Umbraco.StackedContent.Resources.StackedContentResources",

    function ($scope, editorState, notificationsService, innerContentService, scResources) {

        // Config
        var previewEnabled = $scope.model.config.enablePreview === "1";
        var copyEnabled = $scope.model.config.enableCopy === "1";

        $scope.inited = false;
        $scope.markup = {};
        $scope.prompts = {};
        $scope.model.value = $scope.model.value || [];

        $scope.contentTypeGuids = _.uniq($scope.model.config.contentTypes.map(function (itm) {
            return itm.icContentTypeGuid;
        }));

        $scope.canAdd = function () {
            return (!$scope.model.config.maxItems || $scope.model.config.maxItems === "0" || $scope.model.value.length < $scope.model.config.maxItems) && $scope.model.config.singleItemMode !== "1";
        };

        $scope.canDelete = function () {
            return $scope.model.config.singleItemMode !== "1";
        };

        $scope.canCopy = function () {
            return copyEnabled && innerContentService.canCopyContent();
        };

        $scope.canPaste = function () {
            if (copyEnabled && innerContentService.canPasteContent() && $scope.canAdd()) {
                return allowPaste;
            }
            return false;
        };

        $scope.addContent = function (evt, idx) {
            $scope.overlayConfig.event = evt;
            $scope.overlayConfig.data = { model: null, idx: idx, action: "add" };
            $scope.overlayConfig.show = true;
        };

        $scope.editContent = function (evt, idx, itm) {
            $scope.overlayConfig.event = evt;
            $scope.overlayConfig.data = { model: itm, idx: idx, action: "edit" };
            $scope.overlayConfig.show = true;
        };

        $scope.deleteContent = function (evt, idx) {
            $scope.model.value.splice(idx, 1);
            setDirty();
        };

        $scope.copyContent = function (evt, idx) {
            var item = JSON.parse(JSON.stringify($scope.model.value[idx]));
            var success = innerContentService.setCopiedContent(item);
            if (success) {
                allowPaste = true;
                notificationsService.success("Content", "The content block has been copied.");
            } else {
                notificationsService.error("Content", "Unfortunately, the content block was not able to be copied.");
            }
        };

        $scope.pasteContent = function (evt, idx) {
            var item = innerContentService.getCopiedContent();
            if (item && contentTypeGuidIsAllowed(item.icContentTypeGuid)) {
                $scope.overlayConfig.callback({ model: item, idx: idx, action: "add" });
                setDirty();
            } else {
                notificationsService.error("Content", "Unfortunately, the content block is not allowed to be pasted here.");
            }
        };

        $scope.sortableOptions = {
            axis: "y",
            cursor: "move",
            handle: ".stack__preview-wrapper",
            helper: function () {
                return $("<div class=\"stack__sortable-helper\"><div><i class=\"icon icon-navigation\"></i></div></div>");
            },
            cursorAt: {
                top: 0
            },
            stop: function (e, ui) {
                _.each($scope.model.value, function (itm, idx) {
                    innerContentService.populateName(itm, idx, $scope.model.config.contentTypes);
                });
                setDirty();
            }
        };

        // Helpers
        var loadPreviews = function () {
            _.each($scope.model.value, function (itm) {
                scResources.getPreviewMarkup(itm, editorState.current.id).then(function (markup) {
                    if (markup) {
                        $scope.markup[itm.key] = markup;
                    }
                });
            });
        };

        var setDirty = function () {
            if ($scope.propertyForm) {
                $scope.propertyForm.$setDirty();
            }
        };

        var contentTypeGuidIsAllowed = function (guid) {
            return !!guid && _.contains($scope.contentTypeGuids, guid);
        };

        var pasteAllowed = function () {
            var guid = innerContentService.getCopiedContentTypeGuid();
            return guid && contentTypeGuidIsAllowed(guid);
        };

        // Storing the 'pasteAllowed' check in a local variable, so that it doesn't need to be re-eval'd every time
        var allowPaste = pasteAllowed();

        // Set overlay config
        $scope.overlayConfig = {
            propertyAlias: $scope.model.alias,
            contentTypes: $scope.model.config.contentTypes,
            enableFilter: $scope.model.config.enableFilter,
            show: false,
            data: {
                idx: 0,
                model: null
            },
            callback: function (data) {
                innerContentService.populateName(data.model, data.idx, $scope.model.config.contentTypes);

                if (previewEnabled) {
                    scResources.getPreviewMarkup(data.model, editorState.current.id).then(function (markup) {
                        if (markup) {
                            $scope.markup[data.model.key] = markup;
                        }
                    });
                }

                if (!($scope.model.value instanceof Array)) {
                    $scope.model.value = [];
                }

                if (data.action === "add") {
                    $scope.model.value.splice(data.idx, 0, data.model);
                } else if (data.action === "edit") {
                    $scope.model.value[data.idx] = data.model;
                }
            }
        };

        // Initialize value
        if ($scope.model.value.length > 0) {

            // Model is ready so set inited
            $scope.inited = true;

            // Sync icons incase it's changes on the doctype
            var guids = _.uniq($scope.model.value.map(function (itm) {
                return itm.icContentTypeGuid;
            }));

            innerContentService.getContentTypeIconsByGuid(guids).then(function (data) {
                _.each($scope.model.value, function (itm) {
                    if (data.hasOwnProperty(itm.icContentTypeGuid)) {
                        itm.icon = data[itm.icContentTypeGuid];
                    }
                });

                // Try loading previews
                if (previewEnabled) {
                    loadPreviews();
                }
            });

        } else if (editorState.current.hasOwnProperty("contentTypeAlias") && $scope.model.config.singleItemMode === "1") {

            // Initialise single item mode model
            innerContentService.createDefaultDbModel($scope.model.config.contentTypes[0]).then(function (v) {

                $scope.model.value = [v];

                // Model is ready so set inited
                $scope.inited = true;

                // Try loading previews
                if (previewEnabled) {
                    loadPreviews();
                }

            });

        } else {

            // Model is ready so set inited
            $scope.inited = true;

        }
    }
]);

// Resources
angular.module("umbraco.resources").factory("Our.Umbraco.StackedContent.Resources.StackedContentResources", [

    "$http",
    "$q",
    "umbRequestHelper",

    function ($http, $q, umbRequestHelper) {
        return {
            getPreviewMarkup: function (data, pageId) {
                return $q(function (resolve, reject) {
                    resolve("Preview Not Implemented");
                });
                //return umbRequestHelper.resourcePromise(
                //    $http({
                //        url: umbRequestHelper.convertVirtualToAbsolutePath("~/umbraco/backoffice/StackedContent/StackedContentApi/GetPreviewMarkup"),
                //        method: "POST",
                //        params: { pageId: pageId },
                //        data: data
                //    }),
                //    "Failed to retrieve preview markup"
                //);
            }
        };
    }
]);


// Services
angular.module("umbraco").factory("innerContentService", [

    "$interpolate",
    "localStorageService",
    "Our.Umbraco.InnerContent.Resources.InnerContentResources",

    function ($interpolate, localStorageService, icResources) {

        var self = {};

        var getScaffold = function (contentType, blueprintId) {

            var process = function (scaffold) {

                // remove all tabs except the specified tab
                if (contentType.hasOwnProperty("icTabAlias")) {

                    var tab = _.find(scaffold.tabs, function (tab) {
                        return tab.id !== 0 && (tab.alias.toLowerCase() === contentType.icTabAlias.toLowerCase() || contentType.icTabAlias === "");
                    });
                    scaffold.tabs = [];
                    if (tab) {
                        scaffold.tabs.push(tab);
                    }

                } else {

                    if (self.compareCurrentUmbracoVersion("7.8", { zeroExtend: true }) < 0) {
                        // Remove general properties tab for pre 7.8 umbraco installs
                        scaffold.tabs.pop();
                    }

                }

                return scaffold;

            };

            if (blueprintId > 0) {
                return icResources.getContentTypeScaffoldByBlueprintId(blueprintId).then(process);
            } else {
                return icResources.getContentTypeScaffoldByGuid(contentType.icContentTypeGuid).then(process);
            }
        };

        var isPrimitive = function (test) {
            return (test !== Object(test));
        };

        self.populateName = function (itm, idx, contentTypes) {

            var contentType = _.find(contentTypes, function (itm2) {
                return itm2.icContentTypeGuid === itm.icContentTypeGuid;
            });

            var nameTemplate = contentType.nameTemplate || "Item {{$index+1}}";
            var nameExp = $interpolate(nameTemplate);

            if (nameExp) {

                // Inject temporary index property
                itm.$index = idx;

                // Execute the name expression
                var newName = nameExp(itm);
                if (newName && (newName = $.trim(newName)) && itm.name !== newName) {
                    itm.name = newName;
                }

                // Remove temporary index property
                delete itm.$index;
            }

        };

        self.getAllContentTypes = function () {
            return icResources.getAllContentTypes();
        };

        self.getContentTypesByGuid = function (guids) {
            return icResources.getContentTypesByGuid(guids);
        };

        self.getContentTypeIconsByGuid = function (guids) {
            return icResources.getContentTypeIconsByGuid(guids);
        };

        self.createEditorModel = function (contentType, dbModel, blueprintId) {

            return getScaffold(contentType, blueprintId).then(function (scaffold) {

                scaffold.key = self.generateUid();
                scaffold.icContentTypeGuid = contentType.icContentTypeGuid;
                scaffold.name = "Untitled";

                return self.extendEditorModel(scaffold, dbModel);

            });

        };

        self.extendEditorModel = function (editorModel, dbModel) {

            editorModel.key = dbModel && dbModel.key ? dbModel.key : editorModel.key;
            editorModel.name = dbModel && dbModel.name ? dbModel.name : editorModel.name;

            if (!editorModel.key) {
                editorModel.key = self.generateUid();
            }

            if (dbModel) {
                for (var t = 0; t < editorModel.tabs.length; t++) {
                    var tab = editorModel.tabs[t];
                    for (var p = 0; p < tab.properties.length; p++) {
                        var prop = tab.properties[p];
                        if (dbModel.hasOwnProperty(prop.alias)) {
                            prop.value = isPrimitive(dbModel[prop.alias]) ? dbModel[prop.alias] : angular.copy(dbModel[prop.alias]);
                        }
                    }
                }
            }

            return editorModel;

        };

        self.createDbModel = function (model) {

            var dbModel = {
                key: model.key,
                name: model.name,
                icon: model.icon,
                icContentTypeGuid: model.icContentTypeGuid
            };

            for (var t = 0; t < model.tabs.length; t++) {
                var tab = model.tabs[t];
                for (var p = 0; p < tab.properties.length; p++) {
                    var prop = tab.properties[p];
                    if (typeof prop.value !== "function") {
                        dbModel[prop.alias] = prop.value;
                    }
                }
            }

            return dbModel;
        };

        self.createDefaultDbModel = function (contentType) {
            return self.createEditorModel(contentType).then(function (editorModel) {
                return self.createDbModel(editorModel);
            });
        };

        self.compareCurrentUmbracoVersion = function compareCurrentUmbracoVersion(v, options) {
            return this.compareVersions(Umbraco.Sys.ServerVariables.application.version, v, options);
        };

        self.compareVersions = function compareVersions(v1, v2, options) {

            var lexicographical = options && options.lexicographical,
                zeroExtend = options && options.zeroExtend,
                v1parts = v1.split("."),
                v2parts = v2.split(".");

            function isValidPart(x) {
                return (lexicographical ? /^\d+[A-Za-z]*$/ : /^\d+$/).test(x);
            }

            if (!v1parts.every(isValidPart) || !v2parts.every(isValidPart)) {
                return NaN;
            }

            if (zeroExtend) {
                while (v1parts.length < v2parts.length) {
                    v1parts.push("0");
                }
                while (v2parts.length < v1parts.length) {
                    v2parts.push("0");
                }
            }

            if (!lexicographical) {
                v1parts = v1parts.map(Number);
                v2parts = v2parts.map(Number);
            }

            for (var i = 0; i < v1parts.length; ++i) {
                if (v2parts.length === i) {
                    return 1;
                }

                if (v1parts[i] === v2parts[i]) {
                    continue;
                } else if (v1parts[i] > v2parts[i]) {
                    return 1;
                } else {
                    return -1;
                }
            }

            if (v1parts.length !== v2parts.length) {
                return -1;
            }

            return 0;

        };

        self.canCopyContent = function () {
            return localStorageService.isSupported;
        };

        self.canPasteContent = function () {
            return localStorageService.isSupported;
        };

        self.setCopiedContent = function (itm) {
            if (itm && itm.icContentTypeGuid) {
                localStorageService.set("icContentTypeGuid", itm.icContentTypeGuid);
                itm.key = undefined;
                localStorageService.set("icContentJson", itm);
                return true;
            }
            return false;
        };

        self.getCopiedContent = function () {
            var itm = localStorageService.get("icContentJson");
            itm.key = self.generateUid();
            return itm;
        };

        self.getCopiedContentTypeGuid = function () {
            return localStorageService.get("icContentTypeGuid");
        };

        // Helpful methods
        var lut = []; for (var i = 0; i < 256; i++) { lut[i] = (i < 16 ? "0" : "") + i.toString(16); }
        self.generateUid = function () {
            var d0 = Math.random() * 0xffffffff | 0;
            var d1 = Math.random() * 0xffffffff | 0;
            var d2 = Math.random() * 0xffffffff | 0;
            var d3 = Math.random() * 0xffffffff | 0;
            return lut[d0 & 0xff] + lut[d0 >> 8 & 0xff] + lut[d0 >> 16 & 0xff] + lut[d0 >> 24 & 0xff] + "-" +
                lut[d1 & 0xff] + lut[d1 >> 8 & 0xff] + "-" + lut[d1 >> 16 & 0x0f | 0x40] + lut[d1 >> 24 & 0xff] + "-" +
                lut[d2 & 0x3f | 0x80] + lut[d2 >> 8 & 0xff] + "-" + lut[d2 >> 16 & 0xff] + lut[d2 >> 24 & 0xff] +
                lut[d3 & 0xff] + lut[d3 >> 8 & 0xff] + lut[d3 >> 16 & 0xff] + lut[d3 >> 24 & 0xff];
        };

        return self;
    }

]);

// Resources
angular.module("umbraco.resources").factory("Our.Umbraco.InnerContent.Resources.InnerContentResources", [

    "$http",
    "umbRequestHelper",

    function ($http, umbRequestHelper) {
        return {
            getAllContentTypes: function () {
                return umbRequestHelper.resourcePromise(
                    $http({
                        url: umbRequestHelper.convertVirtualToAbsolutePath("~/umbraco/backoffice/InnerContent/InnerContentApi/GetContentTypes"),
                        method: "GET"
                    }),
                    "Failed to retrieve content types"
                );
            },
            getContentTypesByGuid: function (guids) {
                return umbRequestHelper.resourcePromise(
                    $http({
                        url: umbRequestHelper.convertVirtualToAbsolutePath("~/umbraco/backoffice/InnerContent/InnerContentApi/GetContentTypesByGuid"),
                        method: "GET",
                        params: { guids: guids }
                    }),
                    "Failed to retrieve content types"
                );
            },
            getContentTypesByAlias: function (aliases) {
                return umbRequestHelper.resourcePromise(
                    $http({
                        url: umbRequestHelper.convertVirtualToAbsolutePath("~/umbraco/backoffice/InnerContent/InnerContentApi/GetContentTypesByAlias"),
                        method: "GET",
                        params: { aliases: aliases }
                    }),
                    "Failed to retrieve content types"
                );
            },
            getContentTypeIconsByGuid: function (guids) {
                return umbRequestHelper.resourcePromise(
                    $http({
                        url: umbRequestHelper.convertVirtualToAbsolutePath("~/umbraco/backoffice/InnerContent/InnerContentApi/GetContentTypeIconsByGuid"),
                        method: "GET",
                        params: { guids: guids }
                    }),
                    "Failed to retrieve content type icons"
                );
            },
            getContentTypeScaffoldByGuid: function (guid) {
                return umbRequestHelper.resourcePromise(
                    $http({
                        url: umbRequestHelper.convertVirtualToAbsolutePath("~/umbraco/backoffice/InnerContent/InnerContentApi/GetContentTypeScaffoldByGuid"),
                        method: "GET",
                        params: { guid: guid }
                    }),
                    "Failed to retrieve content type scaffold by Guid"
                );
            },
            getContentTypeScaffoldByBlueprintId: function (blueprintId) {
                return umbRequestHelper.resourcePromise(
                    $http({
                        url: umbRequestHelper.convertVirtualToAbsolutePath("~/umbraco/backoffice/InnerContent/InnerContentApi/GetContentTypeScaffoldByBlueprintId"),
                        method: "GET",
                        params: { blueprintId: blueprintId }
                    }),
                    "Failed to retrieve content type scaffold by blueprint Id"
                );
            },
            createBlueprintFromContent: function (data, userId) {
                return umbRequestHelper.resourcePromise(
                    $http({
                        url: umbRequestHelper.convertVirtualToAbsolutePath("~/umbraco/backoffice/InnerContent/InnerContentApi/CreateBlueprintFromContent"),
                        method: "POST",
                        params: { userId: userId },
                        data: data
                    }),
                    "Failed to create blueprint from content"
                );
            }
        };
    }
]);
