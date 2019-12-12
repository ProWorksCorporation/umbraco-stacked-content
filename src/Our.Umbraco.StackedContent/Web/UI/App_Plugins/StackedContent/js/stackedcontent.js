angular.module("umbraco").controller("Our.Umbraco.StackedContent.Controllers.DocTypePickerController", [

    "$scope",
    "Our.Umbraco.StackedContent.Resources",

    function($scope, scResources) {

        $scope.add = function () {
            $scope.model.value.push({
                // As per PR #4, all stored content type aliases must be prefixed "sc" for easier recognition.
                // For good measure we'll also prefix the tab alias "sc"
                scAlias: "",
                scTabAlias: "",
                nameTemplate: ""
            });
        };

        $scope.canAdd = function () {
            return !$scope.model.docTypes || !$scope.model.value || $scope.model.value.length < $scope.model.docTypes.length;
        };

        $scope.remove = function (index) {
            $scope.model.value.splice(index, 1);
        };

        $scope.sortableOptions = {
            axis: "y",
            cursor: "move",
            handle: ".handle",
            placeholder: 'sortable-placeholder',
            forcePlaceholderSize: true,
            helper: function(e, ui) {
                // When sorting table rows, the cells collapse. This helper fixes that: https://www.foliotek.com/devblog/make-table-rows-sortable-using-jquery-ui-sortable/
                ui.children().each(function() {
                    $(this).width($(this).width());
                });
                return ui;
            },
            start: function(e, ui) {

                var cellHeight = ui.item.height();

                // Build a placeholder cell that spans all the cells in the row: https://stackoverflow.com/questions/25845310/jquery-ui-sortable-and-table-cell-size
                var cellCount = 0;
                $('td, th', ui.helper).each(function() {
                    // For each td or th try and get it's colspan attribute, and add that or 1 to the total
                    var colspan = 1;
                    var colspanAttr = $(this).attr('colspan');
                    if (colspanAttr > 1) {
                        colspan = colspanAttr;
                    }
                    cellCount += colspan;
                });

                // Add the placeholder UI - note that this is the item's content, so td rather than tr - and set height of tr
                ui.placeholder.html('<td colspan="' + cellCount + '"></td>').height(cellHeight);
            }
        };

        $scope.docTypeTabs = {};

        scResources.getContentTypes().then(function(docTypes) {
            $scope.model.docTypes = docTypes;

            // Count doctype name occurrences
            var docTypeNameOccurrences = _.countBy(docTypes, 'name');

            // Populate document type tab dictionary
            // And append alias to name if multiple doctypes have the same name
            docTypes.forEach(function(value) {
                $scope.docTypeTabs[value.alias] = value.tabs;

                value.displayName = value.name;

                if (docTypeNameOccurrences[value.name] > 1) {
                    value.displayName += " (" + value.alias + ")";
                }
            });
        });

        $scope.selectableDocTypesFor = function (config) {
            // return all doctypes that are:
            // 1. either already selected for this config, or
            // 2. not selected in any other config
            return _.filter($scope.model.docTypes, function (docType) {
                return docType.alias === config.scAlias || !_.find($scope.model.value, function (c) {
                    return docType.alias === c.scAlias;
                });
            });
        };

        if (!$scope.model.value) {
            $scope.model.value = [];
            $scope.add();
        }
    }
]);

angular.module("umbraco").controller("Our.Umbraco.StackedContent.Controllers.EditorController", [

    "$scope",
    "Our.Umbraco.StackedContent.Resources",

    function ($scope, scResources) {
        $scope.submit = function () {
            if ($scope.model.submit) $scope.model.submit($scope.model);
        };

        $scope.close = function () {
            if ($scope.model.close) $scope.model.close();
        };
    }
]);

angular.module("umbraco").controller("Our.Umbraco.StackedContent.Controllers.StackedContentPropertyEditorController", [

    "$scope",
    "$interpolate",
    "$filter",
    "contentResource",
    "localizationService",
    "iconHelper",
    "clipboardService",
    "eventsService",
    "overlayService",

    function($scope, $interpolate, $filter, contentResource, localizationService, iconHelper, clipboardService, eventsService, overlayService) {

        var contentTypeAliases = [];
        _.each($scope.model.config.contentTypes, function(contentType) {
            contentTypeAliases.push(contentType.scAlias);
        });

        _.each($scope.model.config.contentTypes, function(contentType) {
            contentType.nameExp = contentType.nameTemplate ?
                $interpolate(contentType.nameTemplate) :
                undefined;
        });

        $scope.nodes = [];
        $scope.currentNode = undefined;
        $scope.realCurrentNode = undefined;
        $scope.scaffolds = undefined;
        $scope.sorting = false;
        $scope.inited = false;

        $scope.minItems = $scope.model.config.minItems || 0;
        $scope.maxItems = $scope.model.config.maxItems || 0;

        if ($scope.maxItems === 0)
            $scope.maxItems = 1000;

        $scope.singleMode = $scope.minItems === 1 && $scope.maxItems === 1;
        $scope.showIcons = Object.toBoolean($scope.model.config.showIcons);
        $scope.wideMode = Object.toBoolean($scope.model.config.hideLabel);
        $scope.hasContentTypes = $scope.model.config.contentTypes.length > 0;

        $scope.labels = {};
        localizationService.localizeMany(["grid_addElement", "content_createEmpty"]).then(function(data) {
            $scope.labels.grid_addElement = data[0];
            $scope.labels.content_createEmpty = data[1];
        });

        // helper to force the current form into the dirty state
        $scope.setDirty = function() {
            if ($scope.propertyForm) {
                $scope.propertyForm.$setDirty();
            }
        };

        $scope.canAdd = function () {
            return $scope.nodes.length < $scope.maxItems && !$scope.model.singleMode;
        };

        $scope.addNode = function (alias) {
            var scaffold = $scope.getScaffold(alias);

            var newNode = createNode(scaffold, null);

            $scope.currentNode = newNode;
            $scope.setDirty();
        };

        $scope.openNodeTypePicker = function ($event) {
            if ($scope.nodes.length >= $scope.maxItems) {
                return;
            }

            $scope.overlayMenu = {
                show: false,
                style: {},
                filter: $scope.scaffolds.length > 12 ? true : false,
                orderBy: "$index",
                view: "itempicker",
                event: $event,
                submit: function(model) {
                    if (model && model.selectedItem) {
                        $scope.addNode(model.selectedItem.alias);
                    }
                    $scope.overlayMenu.show = false;
                    $scope.overlayMenu = null;
                },
                close: function() {
                    $scope.overlayMenu.show = false;
                    $scope.overlayMenu = null;
                }
            };

            // this could be used for future limiting on node types
            $scope.overlayMenu.availableItems = [];
            _.each($scope.scaffolds, function(scaffold) {
                $scope.overlayMenu.availableItems.push({
                    alias: scaffold.contentTypeAlias,
                    name: scaffold.contentTypeName,
                    icon: iconHelper.convertFromLegacyIcon(scaffold.icon)
                });
            });

            if ($scope.overlayMenu.availableItems.length === 0) {
                return;
            }

            $scope.overlayMenu.size = $scope.overlayMenu.availableItems.length > 6 ? "medium" : "small";
            $scope.overlayMenu.title = $scope.labels.content_createEmpty;

            if ($scope.overlayMenu.availableItems.length === 1) {
                // only one scaffold type - no need to display the picker
                $scope.addNode($scope.scaffolds[0].contentTypeAlias);
                return;
            }

            $scope.overlayMenu.show = true;
        };

        $scope.editNode = function(idx) {
            if ($scope.currentNode && $scope.currentNode.key === $scope.nodes[idx].key) {
                $scope.currentNode = undefined;
            } else {
                $scope.currentNode = $scope.nodes[idx];
            }
        };

        $scope.deleteNode = function(idx) {
            $scope.nodes.splice(idx, 1);
            $scope.setDirty();
            updateModel();
        };
        $scope.requestDeleteNode = function(idx) {
            if ($scope.nodes.length <= $scope.model.config.minItems) {
                return;
            }

            if ($scope.model.config.confirmDeletes === true) {
                localizationService.localizeMany(["content_stackedContentDeleteItem", "general_delete", "general_cancel", "contentTypeEditor_yesDelete"]).then(function(data) {
                    const overlay = {
                        title: data[1],
                        content: data[0],
                        closeButtonLabel: data[2],
                        submitButtonLabel: data[3],
                        submitButtonStyle: "danger",
                        close: function() {
                            overlayService.close();
                        },
                        submit: function() {
                            $scope.deleteNode(idx);
                            overlayService.close();
                        }
                    };

                    overlayService.open(overlay);
                });
            } else {
                $scope.deleteNode(idx);
            }
        };

        $scope.getName = function(idx) {

            var name = "";

            if ($scope.model.value[idx]) {

                var contentType = $scope.getContentTypeConfig($scope.model.value[idx].scContentTypeAlias);

                if (contentType) {
                    // first try getting a name using the configured label template
                    if (contentType.nameExp) {
                        // Run the expression against the stored dictionary value, NOT the node object
                        var item = $scope.model.value[idx];

                        // Add a temporary index property
                        item["$index"] = idx + 1;

                        var newName = contentType.nameExp(item);
                        if (newName && (newName = $.trim(newName))) {
                            name = newName;
                        }

                        // Delete the index property as we don't want to persist it
                        delete item["$index"];
                    }

                    // if we still do not have a name and we have multiple content types to choose from, use the content type name (same as is shown in the content type picker)
                    if (!name && $scope.scaffolds.length > 1) {
                        var scaffold = $scope.getScaffold(contentType.scAlias);
                        if (scaffold) {
                            name = scaffold.contentTypeName;
                        }
                    }
                }

            }

            if (!name) {
                name = "Item " + (idx + 1);
            }

            // Update the nodes actual name value
            if ($scope.nodes[idx].name !== name) {
                $scope.nodes[idx].name = name;
            }

            return name;
        };

        $scope.getIcon = function (idx) {
            var scaffold = $scope.getScaffold($scope.model.value[idx].scContentTypeAlias);
            return scaffold && scaffold.icon ? iconHelper.convertFromLegacyIcon(scaffold.icon) : "icon-folder";
        };

        $scope.sortableOptions = {
            axis: "y",
            cursor: "move",
            handle: '.umb-stacked-content__header-bar',
            distance: 10,
            opacity: 0.7,
            tolerance: "pointer",
            scroll: true,
            start: function() {
                updateModel();
                // Yea, yea, we shouldn't modify the dom, sue me
                $("#umb-stacked-content--" + $scope.model.id + " .umb-rte textarea").each(function() {
                    tinymce.execCommand("mceRemoveEditor", false, $(this).attr("id"));
                    $(this).css("visibility", "hidden");
                });
                $scope.$apply(function() {
                    $scope.sorting = true;
                });
            },
            update: function() {
                $scope.setDirty();
            },
            stop: function() {
                $("#umb-stacked-content--" + $scope.model.id + " .umb-rte textarea").each(function() {
                    tinymce.execCommand("mceAddEditor", true, $(this).attr("id"));
                    $(this).css("visibility", "visible");
                });
                $scope.$apply(function() {
                    $scope.sorting = false;
                    updateModel();
                });
            }
        };

        $scope.getScaffold = function (alias) {
            return _.find($scope.scaffolds, function (scaffold) {
                return scaffold.contentTypeAlias === alias;
            });
        };

        $scope.getContentTypeConfig = function (alias) {
            return _.find($scope.model.config.contentTypes, function (contentType) {
                return contentType.scAlias === alias;
            });
        };

        $scope.showCopy = clipboardService.isSupported();

        $scope.showPaste = false;

        $scope.clickCopy = function ($event, node) {

            syncCurrentNode();

            clipboardService.copy("elementType", node.contentTypeAlias, node);
            $event.stopPropagation();
        };

        $scope.pasteFromClipboard = function (newNode) {

            if (newNode === undefined) {
                return;
            }

            // generate a new key.
            newNode.key = String.CreateGuid();

            $scope.nodes.push(newNode);
            $scope.setDirty();
            //updateModel();// done by setting current node...

            $scope.currentNode = newNode;
        };

        function checkAbilityToPasteContent() {
            $scope.showPaste = clipboardService.hasEntriesOfType("elementType", contentTypeAliases);
        }

        eventsService.on("clipboardService.storageUpdate", checkAbilityToPasteContent);

        // Initialize
        var scaffoldsLoaded = 0;
        $scope.scaffolds = [];
        _.each($scope.model.config.contentTypes, function(contentType) {
            contentResource.getScaffold(-20, contentType.scAlias).then(function(scaffold) {
                // make sure it's an element type before allowing the user to create new ones
                if (scaffold.isElement) {
                    /*
                    // remove all tabs except the specified tab
                    var tabs = scaffold.variants[0].tabs;
                    var tab = _.find(tabs, function(tab) {
                        return tab.id !== 0 && (tab.alias.toLowerCase() === contentType.scTabAlias.toLowerCase() || contentType.scTabAlias === "");
                    });
                    scaffold.variants[0].tabs = [];
                    if (tab) {
                        scaffold.variants[0].tabs.push(tab);

                        angular.forEach(tab.properties,
                            function(property) {
                                if (_.find(notSupported, function(x) { return x === property.editor; })) {
                                    property.notSupported = true;
                                    // TODO: Not supported message to be replaced with 'content_stackedContentEditorNotSupported' dictionary key. Currently not possible due to async/timing quirk.
                                    property.notSupportedMessage = "Property " + property.label + " uses editor " + property.editor + " which is not supported by Stacked Content.";
                                }
                            });
                    } */
                    // Store the scaffold object
                    $scope.scaffolds.push(scaffold);
                }

                scaffoldsLoaded++;
                initIfAllScaffoldsHaveLoaded();
            }, function() {
                scaffoldsLoaded++;
                initIfAllScaffoldsHaveLoaded();
            });
        });

        var initIfAllScaffoldsHaveLoaded = function () {
            // Initialize when all scaffolds have loaded
            if ($scope.model.config.contentTypes.length === scaffoldsLoaded) {
                // Because we're loading the scaffolds async one at a time, we need to
                // sort them explicitly according to the sort order defined by the data type.
                contentTypeAliases = [];
                _.each($scope.model.config.contentTypes, function (contentType) {
                    contentTypeAliases.push(contentType.scAlias);
                });
                $scope.scaffolds = $filter("orderBy")($scope.scaffolds, function (s) {
                    return contentTypeAliases.indexOf(s.contentTypeAlias);
                });

                // Convert stored nodes
                if ($scope.model.value) {
                    for (var i = 0; i < $scope.model.value.length; i++) {
                        var item = $scope.model.value[i];
                        var scaffold = $scope.getScaffold(item.scContentTypeAlias);
                        if (!scaffold) {
                            // No such scaffold - the content type might have been deleted. We need to skip it.
                            continue;
                        }
                        createNode(scaffold, item);
                    }
                }

                // Enforce min items
                if ($scope.nodes.length < $scope.model.config.minItems) {
                    for (var j = $scope.nodes.length; j < $scope.model.config.minItems; j++) {
                        $scope.addNode($scope.scaffolds[0].contentTypeAlias);
                    }
                }

                // If there is only one item, set it as current node
                if ($scope.singleMode || $scope.nodes.length === 1 && $scope.maxItems === 1) {
                    $scope.currentNode = $scope.nodes[0];
                }

                $scope.inited = true;

                checkAbilityToPasteContent();
            }
        };

        function createNode(scaffold, fromScEntry) {
            var node = angular.copy(scaffold);

            node.key = fromScEntry && fromScEntry.key ? fromScEntry.key : String.CreateGuid();

            var variant = node.variants[0];

            for (var t = 0; t < variant.tabs.length; t++) {
                var tab = variant.tabs[t];

                for (var p = 0; p < tab.properties.length; p++) {
                    var prop = tab.properties[p];

                    prop.propertyAlias = prop.alias;
                    prop.alias = $scope.model.alias + "___" + prop.alias;
                    // Force validation to occur server side as this is the
                    // only way we can have consistency between mandatory and
                    // regex validation messages. Not ideal, but it works.
                    prop.validation = {
                        mandatory: false,
                        pattern: ""
                    };

                    if (fromScEntry && fromScEntry[prop.propertyAlias]) {
                        prop.value = fromScEntry[prop.propertyAlias];
                    }
                }
            }

            $scope.nodes.push(node);

            return node;
        }

        function convertNodeIntoSCEntry(node) {
            var obj = {
                key: node.key,
                name: node.name,
                scContentTypeAlias: node.contentTypeAlias
            };
            for (var t = 0; t < node.variants[0].tabs.length; t++) {
                var tab = node.variants[0].tabs[t];
                for (var p = 0; p < tab.properties.length; p++) {
                    var prop = tab.properties[p];
                    if (typeof prop.value !== "function") {
                        obj[prop.propertyAlias] = prop.value;
                    }
                }
            }
            return obj;
        }

        function syncCurrentNode() {
            if ($scope.realCurrentNode) {
                $scope.$broadcast("scSyncVal", { key: $scope.realCurrentNode.key });
            }
        }

        function updateModel() {
            syncCurrentNode();

            if ($scope.inited) {
                var newValues = [];
                for (var i = 0; i < $scope.nodes.length; i++) {
                    newValues.push(convertNodeIntoSCEntry($scope.nodes[i]));
                }
                $scope.model.value = newValues;
            }
        }

        $scope.$watch("currentNode", function(newVal) {
            updateModel();
            $scope.realCurrentNode = newVal;
        });

        var unsubscribe = $scope.$on("formSubmitting", function(ev, args) {
            updateModel();
        });

        $scope.$on("$destroy", function() {
            unsubscribe();
        });

    }

]);


// Filter to take a node id and grab it's name instead
// Usage: {{ pickerAlias | scNodeName }}

// Cache for node names so we don't make a ton of requests
var scNodeNameCache = {
    id: "",
    keys: {}
};

angular.module("umbraco.filters").filter("scNodeName", function(editorState, entityResource) {

    function formatLabel(firstNodeName, totalNodes) {
        return totalNodes <= 1 ?
            firstNodeName
            // If there is more than one item selected, append the additional number of items selected to hint that
            :
            firstNodeName + " (+" + (totalNodes - 1) + ")";
    }

    return function(input) {

        // Check we have a value at all
        if (input === "" || input.toString() === "0") {
            return "";
        }

        var currentNode = editorState.getCurrent();

        // Ensure a unique cache per editor instance
        var key = "scNodeName_" + currentNode.key;
        if (scNodeNameCache.id !== key) {
            scNodeNameCache.id = key;
            scNodeNameCache.keys = {};
        }

        // MNTP values are comma separated IDs. We'll only fetch the first one for the SC header.
        var ids = input.split(',');
        var lookupId = ids[0];

        // See if there is a value in the cache and use that
        if (scNodeNameCache.keys[lookupId]) {
            return formatLabel(scNodeNameCache.keys[lookupId], ids.length);
        }

        // No value, so go fetch one 
        // We'll put a temp value in the cache though so we don't 
        // make a load of requests while we wait for a response
        scNodeNameCache.keys[lookupId] = "Loading...";

        var type = lookupId.indexOf("umb://media/") === 0 ?
            "Media" :
            lookupId.indexOf("umb://member/") === 0 ?
            "Member" :
            "Document";
        entityResource.getById(lookupId, type)
            .then(
                function(ent) {
                    scNodeNameCache.keys[lookupId] = ent.name;
                }
            );

        // Return the current value for now
        return formatLabel(scNodeNameCache.keys[lookupId], ids.length);
    };

}).filter("scRichText", function() {
    return function(input) {
        return $("<div/>").html(input).text();
    };
});

angular.module('umbraco.resources').factory('Our.Umbraco.StackedContent.Resources',
    function ($http, umbRequestHelper) {
        return {
            getContentTypes: function () {
                var url = Umbraco.Sys.ServerVariables.umbracoSettings.umbracoPath + "/backoffice/InnerContent/InnerContentApi/GetContentTypes";
                return umbRequestHelper.resourcePromise(
                    $http.get(url),
                    'Failed to retrieve content types'
                );
            }
        };
    });