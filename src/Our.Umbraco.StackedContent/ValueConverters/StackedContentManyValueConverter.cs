using System;
using System.Collections.Generic;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Our.Umbraco.StackedContent.Config;
using Umbraco.Core;
using Umbraco.Core.Logging;
using Umbraco.Core.Models.PublishedContent;
using Umbraco.Core.PropertyEditors;
using Umbraco.Web.PropertyEditors.ValueConverters;
using Umbraco.Web.PublishedCache;

namespace Our.Umbraco.StackedContent.ValueConverters
{
    public class StackedContentManyValueConverter : NestedContentValueConverterBase
    {
        private readonly IProfilingLogger _proflog;

        /// <summary>
        /// Initializes a new instance of the <see cref="StackedContentSingleValueConverter"/> class.
        /// </summary>
        public StackedContentManyValueConverter(IPublishedSnapshotAccessor publishedSnapshotAccessor, IPublishedModelFactory publishedModelFactory, IProfilingLogger proflog)
            : base(publishedSnapshotAccessor, publishedModelFactory)
        {
            _proflog = proflog;
        }

        public static bool IsStacked(IPublishedPropertyType publishedProperty)
        {
            return publishedProperty.EditorAlias.InvariantEquals(Our.Umbraco.StackedContent.Constants.PropertyEditorAlias);
        }

        /// <inheritdoc />
        public override bool IsConverter(IPublishedPropertyType propertyType)
            => IsStacked(propertyType);

        /// <inheritdoc />
        public override Type GetPropertyValueType(IPublishedPropertyType propertyType)
        {
            var contentTypes = propertyType.DataType.ConfigurationAs<StackedContentConfiguration>().ContentTypes;
            return contentTypes.Length > 1
                ? typeof(IPublishedElement)
                : ModelType.For(contentTypes[0].Alias);
        }

        /// <inheritdoc />
        public override PropertyCacheLevel GetPropertyCacheLevel(IPublishedPropertyType propertyType)
            => PropertyCacheLevel.Element;

        /// <inheritdoc />
        public override object ConvertSourceToIntermediate(IPublishedElement owner, IPublishedPropertyType propertyType, object source, bool preview)
        {
            return source?.ToString();
        }

        /// <inheritdoc />
        public override object ConvertIntermediateToObject(IPublishedElement owner, IPublishedPropertyType propertyType, PropertyCacheLevel referenceCacheLevel, object inter, bool preview)
        {
            using (_proflog.DebugDuration<StackedContentManyValueConverter>($"ConvertPropertyToStackedContent ({propertyType.DataType.Id})"))
            {
                var value = (string)inter;
                if (string.IsNullOrWhiteSpace(value)) return null;

                var objects = JsonConvert.DeserializeObject<List<JObject>>(value);
                if (objects.Count == 0)
                    return null;
                if (objects.Count > 1)
                    throw new InvalidOperationException();

                return ConvertToElement(objects[0], referenceCacheLevel, preview);
            }
        }
    }
}