

using Newtonsoft.Json.Linq;
using System;
using System.Collections.Generic;
using System.Linq;
using Umbraco.Core.Models;
using Umbraco.Core.Services;
using Umbraco.Web.Composing;

namespace Our.Umbraco.StackedContent.Helpers
{
    public static class StackedContentHelper
    {


        internal static IContent ConvertInnerContentToBlueprint(JObject item, int userId = 0)
        {
            var contentType = GetContentTypeFromItem(item);

            // creates a fast lookup of the property types
            var propertyTypes = contentType.PropertyTypes.ToDictionary(x => x.Alias, x => x, StringComparer.InvariantCultureIgnoreCase);

            var propValues = item.ToObject<Dictionary<string, object>>();
            var properties = new List<Property>();

            foreach (var jProp in propValues)
            {
                if (propertyTypes.ContainsKey(jProp.Key) == false)
                    continue;

                var propType = propertyTypes[jProp.Key];
                if (propType != null)
                {
                    // TODO: Check if we need to call `ConvertEditorToDb`?
                    var prop = new Property(propType);
                    prop.SetValue(jProp.Value);
                    properties.Add(prop);
                }
            }

            // Manually parse out the special properties
            propValues.TryGetValue("name", out object name);
            propValues.TryGetValue("key", out object key);

            return new Content(name?.ToString(), -1, contentType, new PropertyCollection(properties))
            {
                Key = key == null ? Guid.Empty : Guid.Parse(key.ToString()),
                ParentId = -1,
                Path = "-1",
                CreatorId = userId,
                WriterId = userId
            };
        }

        internal static Guid? GetContentTypeGuidFromItem(JObject item)
        {
            var contentTypeGuidProperty = item?[Constants.ContentTypeGuidPropertyKey];
            return contentTypeGuidProperty?.ToObject<Guid?>();
        }

        internal static string GetContentTypeAliasFromItem(JObject item)
        {
            var contentTypeAliasProperty = item?[Constants.ContentTypeAliasPropertyKey];
            return contentTypeAliasProperty?.ToObject<string>();
        }

        internal static void SetContentTypeGuid(JObject item, string contentTypeAlias, IContentTypeService contentTypeService)
        {
            var key = contentTypeService.Get(contentTypeAlias)?.Key;
            if(key != null)
            {
                item[Constants.ContentTypeGuidPropertyKey] = key.ToString();
            }
        }

        internal static IContentType GetContentTypeFromItem(JObject item)
        {
            var contentTypeService = Current.Services.ContentTypeService;

            var contentTypeGuid = GetContentTypeGuidFromItem(item);
            if (contentTypeGuid.HasValue && contentTypeGuid.Value != Guid.Empty)
                return contentTypeService.Get(contentTypeGuid.Value);

            var contentTypeAlias = GetContentTypeAliasFromItem(item);
            if (string.IsNullOrWhiteSpace(contentTypeAlias) == false)
            {
                // Future-proofing - setting the GUID, queried from the alias
                SetContentTypeGuid(item, contentTypeAlias, contentTypeService);

                return contentTypeService.Get(contentTypeAlias);
            }

            return null;
        }
    }
}
