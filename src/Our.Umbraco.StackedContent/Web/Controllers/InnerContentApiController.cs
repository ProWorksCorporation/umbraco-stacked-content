using System;
using System.Collections.Generic;
using System.Linq;
using System.Web.Http;
using System.Web.Http.ModelBinding;
using Newtonsoft.Json.Linq;
using Our.Umbraco.StackedContent.Helpers;
using Our.Umbraco.StackedContent.Web.WebApi.Filters;
using Umbraco.Core;
using Umbraco.Core.Dictionary;
using Umbraco.Core.Services;
using Umbraco.Web.Editors;
using Umbraco.Web.Models.ContentEditing;
using Umbraco.Web.Mvc;

namespace Our.Umbraco.StackedContent.Web.Controllers
{
    [PluginController("InnerContent")]
    public class InnerContentApiController : UmbracoAuthorizedJsonController
    {
        private readonly IContentService _contentService;
        private readonly IContentTypeService _contentTypeService;
        private readonly ContentController _contentController;

        public InnerContentApiController(IContentTypeService contentTypeService, IContentService contentService, ContentController contentController)
        {
            _contentService = contentService;
            _contentTypeService = contentTypeService;
            _contentController = contentController;
        }

        [HttpGet]
        public IEnumerable<object> GetContentTypes()
        {
            return _contentTypeService
                .GetAllElementTypes()
                .OrderBy(x => x.SortOrder)
                .Select(x => new
                {
                    id = x.Id,
                    guid = x.Key,
                    name = x.Name,
                    alias = x.Alias,
                    icon = x.Icon,
                    tabs = x.CompositionPropertyGroups.Select(y => y.Name).Distinct()
                });
        }

        [HttpGet]
        public IEnumerable<object> GetContentTypesByGuid([ModelBinder] Guid[] guids)
        {
            guids = guids ?? new Guid[0];
            var contentTypes = _contentTypeService.GetAllElementTypes().Where(c => guids.Contains(c.Key)).OrderBy(x => Array.IndexOf(guids, x.Key)).ToList();
            var blueprints = _contentService.GetBlueprintsForContentTypes(contentTypes.Select(x => x.Id).ToArray()).ToArray();

            // NOTE: Using an anonymous class, as the `ContentTypeBasic` type is heavier than what we need (for our requirements)
            return contentTypes.Select(ct => new
            {
                name = ct.Name,
                description = ct.Description,
                guid = ct.Key,
                key = ct.Key,
                icon = ct.Icon,
                blueprints = blueprints.Where(bp => bp.ContentTypeId == ct.Id).ToDictionary(bp => bp.Id, bp => bp.Name)
            });
        }

        [HttpGet]
        public IEnumerable<object> GetContentTypesByAlias([ModelBinder] string[] aliases)
        {
            return _contentTypeService.GetAllElementTypes()
                .Where(x => aliases == null || aliases.Contains(x.Alias))
                .OrderBy(x => x.SortOrder)
                .Select(x => new
                {
                    id = x.Id,
                    guid = x.Key,
                    name = x.Name,
                    alias = x.Alias,
                    icon = x.Icon,
                    tabs = x.CompositionPropertyGroups.Select(y => y.Name).Distinct()
                });
        }

        [HttpGet]
        public IDictionary<string, string> GetContentTypeIconsByGuid([ModelBinder] Guid[] guids)
        {
            return _contentTypeService.GetAllElementTypes()
                .Where(x => guids.Contains(x.Key))
                .ToDictionary(
                    x => x.Key.ToString(),
                    x => x.Icon);
        }

        [HttpGet]
        [UseInternalActionFilter("Umbraco.Web.WebApi.Filters.OutgoingEditorModelEventAttribute", onActionExecuted: true)]
        public ContentItemDisplay GetContentTypeScaffoldByGuid(Guid guid)
        {
            var contentType = _contentTypeService.Get(guid);
            return _contentController.GetEmpty(contentType.Alias, -20);
        }

        [HttpGet]
        [UseInternalActionFilter("Umbraco.Web.WebApi.Filters.OutgoingEditorModelEventAttribute", onActionExecuted: true)]
        public ContentItemDisplay GetContentTypeScaffoldByBlueprintId(int blueprintId)
        {
            return _contentController.GetEmpty(blueprintId, -20);
        }

        [HttpPost]
        public SimpleNotificationModel CreateBlueprintFromContent([FromBody] JObject item, int userId = 0)
        {
            var blueprint = StackedContentHelper.ConvertInnerContentToBlueprint(item, userId);

            Services.ContentService.SaveBlueprint(blueprint, userId);

            return new SimpleNotificationModel(new Notification(
                Services.TextService.Localize("blueprints/createdBlueprintHeading"),
                Services.TextService.Localize("blueprints/createdBlueprintMessage", new[] { blueprint.Name }),
                NotificationStyle.Success));
        }

        private static ICultureDictionary _cultureDictionary;
    }
}
