using Umbraco.Core.PropertyEditors;
using Umbraco.Core;
using Umbraco.Core.Logging;
using System;
using Umbraco.Core.Models;
using Newtonsoft.Json.Linq;
using Newtonsoft.Json;
using Umbraco.Core.Services;
using System.Collections.Generic;
using System.Linq;
using Umbraco.Core.Models.Editors;
using System.ComponentModel.DataAnnotations;
using System.Text.RegularExpressions;
using Our.Umbraco.StackedContent.Config;

namespace Our.Umbraco.StackedContent.PropertyEditors
{
    /// <summary>
    /// Represents a stacked content property editor.
    /// </summary>
    [DataEditor(
        Our.Umbraco.StackedContent.Constants.PropertyEditorAlias,
        "Stacked Content",
        "~/App_Plugins/StackedContent/views/stackedcontent.html",
        ValueType = ValueTypes.Json,
        Group = "Lists",
        Icon = "icon-thumbnail-list")]
    public class StackedContentPropertyEditor : DataEditor
    {
        private readonly Lazy<PropertyEditorCollection> _propertyEditors;
        private readonly IContentTypeService _contentTypeService;
        private readonly IDataTypeService _dataTypeService;

        internal const string ContentTypeAliasPropertyKey = "scContentTypeAlias";

        public StackedContentPropertyEditor(ILogger logger, Lazy<PropertyEditorCollection> propertyEditors, IContentTypeService contentTypeService, IDataTypeService dataTypeService)
            : base(logger)
        {
            _propertyEditors = propertyEditors;
            _contentTypeService = contentTypeService;
            _dataTypeService = dataTypeService;
        }

        // has to be lazy else circular dep in ctor
        private PropertyEditorCollection PropertyEditors => _propertyEditors.Value;

        #region Pre Value Editor

        protected override IConfigurationEditor CreateConfigurationEditor() => new StackedContentConfigurationEditor();

        #endregion

        #region Value Editor

        protected override IDataValueEditor CreateValueEditor() => new StackedContentPropertyValueEditor(Attribute, PropertyEditors, _contentTypeService, _dataTypeService);

        internal class StackedContentPropertyValueEditor : DataValueEditor
        {
            private readonly PropertyEditorCollection _propertyEditors;
            private readonly IContentTypeService _contentTypeService;
            private readonly IDataTypeService _dataTypeService;

            public StackedContentPropertyValueEditor(DataEditorAttribute attribute, PropertyEditorCollection propertyEditors, IContentTypeService contentTypeService, IDataTypeService dataTypeService)
                : base(attribute)
            {
                _propertyEditors = propertyEditors;
                _contentTypeService = contentTypeService;
                _dataTypeService = dataTypeService;
                Validators.Add(new StackedContentValidator(propertyEditors, _contentTypeService, _dataTypeService));
            }

            /// <inheritdoc />
            public override object Configuration
            {
                get => base.Configuration;
                set
                {
                    if (value == null)
                        throw new ArgumentNullException(nameof(value));
                    if (!(value is StackedContentConfiguration configuration))
                        throw new ArgumentException($"Expected a {typeof(StackedContentConfiguration).Name} instance, but got {value.GetType().Name}.", nameof(value));
                    base.Configuration = value;

                    HideLabel = configuration.HideLabel.TryConvertTo<bool>().Result;
                }
            }

            private IContentType GetElementType(JObject item)
            {
                var contentTypeAlias = item[ContentTypeAliasPropertyKey]?.ToObject<string>();
                return string.IsNullOrEmpty(contentTypeAlias)
                    ? null
                    : _contentTypeService.Get(contentTypeAlias);
            }

            #region DB to String

            public override string ConvertDbToString(PropertyType propertyType, object propertyValue, IDataTypeService dataTypeService)
            {
                if (propertyValue == null || string.IsNullOrWhiteSpace(propertyValue.ToString()))
                    return string.Empty;

                var value = JsonConvert.DeserializeObject<List<object>>(propertyValue.ToString());
                if (value == null)
                    return string.Empty;

                foreach (var o in value)
                {
                    var propValues = (JObject)o;

                    var contentType = GetElementType(propValues);
                    if (contentType == null)
                        continue;

                    var propAliases = propValues.Properties().Select(x => x.Name).ToArray();
                    foreach (var propAlias in propAliases)
                    {
                        var propType = contentType.CompositionPropertyTypes.FirstOrDefault(x => x.Alias == propAlias);
                        if (propType == null)
                        {
                            // type not found, and property is not system: just delete the value
                            if (IsSystemPropertyKey(propAlias) == false)
                                propValues[propAlias] = null;
                        }
                        else
                        {
                            try
                            {
                                // convert the value, and store the converted value
                                var propEditor = _propertyEditors[propType.PropertyEditorAlias];
                                var tempConfig = dataTypeService.GetDataType(propType.DataTypeId).Configuration;
                                var valEditor = propEditor.GetValueEditor(tempConfig);
                                var convValue = valEditor.ConvertDbToString(propType, propValues[propAlias]?.ToString(), dataTypeService);
                                propValues[propAlias] = convValue;
                            }
                            catch (InvalidOperationException)
                            {
                                // deal with weird situations by ignoring them (no comment)
                                propValues[propAlias] = null;
                            }
                        }
                    }
                }

                var str = JsonConvert.SerializeObject(value);
                return string.IsNullOrWhiteSpace(str) ? "" : str;
            }

            #endregion

            #region Convert database // editor

            // note: there is NO variant support here

            public override object ToEditor(Property property, IDataTypeService dataTypeService, string culture = null, string segment = null)
            {
                var val = property.GetValue(culture, segment);
                if (val == null || string.IsNullOrWhiteSpace(val.ToString()))
                    return string.Empty;

                var value = JsonConvert.DeserializeObject<List<object>>(val.ToString());
                if (value == null)
                    return string.Empty;

                foreach (var o in value)
                {
                    var propValues = (JObject)o;

                    var contentType = GetElementType(propValues);
                    if (contentType == null)
                        continue;

                    var propAliases = propValues.Properties().Select(x => x.Name).ToArray();
                    foreach (var propAlias in propAliases)
                    {
                        var propType = contentType.CompositionPropertyTypes.FirstOrDefault(x => x.Alias == propAlias);
                        if (propType == null)
                        {
                            // type not found, and property is not system: just delete the value
                            if (IsSystemPropertyKey(propAlias) == false)
                                propValues[propAlias] = null;
                        }
                        else
                        {
                            try
                            {
                                // create a temp property with the value
                                // - force it to be culture invariant as NC can't handle culture variant element properties
                                propType.Variations = ContentVariation.Nothing;
                                var tempProp = new Property(propType);
                                tempProp.SetValue(propValues[propAlias] == null ? null : propValues[propAlias].ToString());

                                // convert that temp property, and store the converted value
                                var propEditor = _propertyEditors[propType.PropertyEditorAlias];
                                var tempConfig = dataTypeService.GetDataType(propType.DataTypeId).Configuration;
                                var valEditor = propEditor.GetValueEditor(tempConfig);
                                var convValue = valEditor.ToEditor(tempProp, dataTypeService);
                                propValues[propAlias] = convValue == null ? null : JToken.FromObject(convValue);
                            }
                            catch (InvalidOperationException)
                            {
                                // deal with weird situations by ignoring them (no comment)
                                propValues[propAlias] = null;
                            }
                        }

                    }
                }

                // return json
                return value;
            }

            public override object FromEditor(ContentPropertyData editorValue, object currentValue)
            {
                if (editorValue.Value == null || string.IsNullOrWhiteSpace(editorValue.Value.ToString()))
                    return null;

                var value = JsonConvert.DeserializeObject<List<object>>(editorValue.Value.ToString());
                if (value == null)
                    return null;

                // Issue #38 - Keep recursive property lookups working
                if (!value.Any())
                    return null;

                // Process value
                for (var i = 0; i < value.Count; i++)
                {
                    var o = value[i];
                    var propValues = ((JObject)o);

                    var contentType = GetElementType(propValues);
                    if (contentType == null)
                    {
                        continue;
                    }

                    var propValueKeys = propValues.Properties().Select(x => x.Name).ToArray();

                    foreach (var propKey in propValueKeys)
                    {
                        var propType = contentType.CompositionPropertyTypes.FirstOrDefault(x => x.Alias == propKey);
                        if (propType == null)
                        {
                            if (IsSystemPropertyKey(propKey) == false)
                            {
                                // Property missing so just delete the value
                                propValues[propKey] = null;
                            }
                        }
                        else
                        {
                            // Fetch the property types prevalue
                            var propConfiguration = _dataTypeService.GetDataType(propType.DataTypeId).Configuration;

                            // Lookup the property editor
                            var propEditor = _propertyEditors[propType.PropertyEditorAlias];

                            // Create a fake content property data object
                            var contentPropData = new ContentPropertyData(propValues[propKey], propConfiguration);

                            // Get the property editor to do it's conversion
                            var newValue = propEditor.GetValueEditor().FromEditor(contentPropData, propValues[propKey]);

                            // Store the value back
                            propValues[propKey] = (newValue == null) ? null : JToken.FromObject(newValue);
                        }

                    }
                }

                return JsonConvert.SerializeObject(value);
            }

            #endregion
        }

        internal class StackedContentValidator : IValueValidator
        {
            private readonly PropertyEditorCollection _propertyEditors;
            private readonly IContentTypeService _contentTypeService;
            private readonly IDataTypeService _dataTypeService;

            public StackedContentValidator(PropertyEditorCollection propertyEditors, IContentTypeService contentTypeService, IDataTypeService dataTypeService)
            {
                _propertyEditors = propertyEditors;
                _contentTypeService = contentTypeService;
                _dataTypeService = dataTypeService;
            }

            private IContentType GetElementType(JObject item)
            {
                var contentTypeAlias = item[ContentTypeAliasPropertyKey]?.ToObject<string>();
                return string.IsNullOrEmpty(contentTypeAlias)
                    ? null
                    : _contentTypeService.Get(contentTypeAlias);
            }

            public IEnumerable<ValidationResult> Validate(object rawValue, string valueType, object dataTypeConfiguration)
            {
                if (rawValue == null)
                    yield break;

                var value = JsonConvert.DeserializeObject<List<object>>(rawValue.ToString());
                if (value == null)
                    yield break;

                var dataTypeService = _dataTypeService;
                for (var i = 0; i < value.Count; i++)
                {
                    var o = value[i];
                    var propValues = (JObject)o;

                    var contentType = GetElementType(propValues);
                    if (contentType == null) continue;

                    var propValueKeys = propValues.Properties().Select(x => x.Name).ToArray();

                    foreach (var propKey in propValueKeys)
                    {
                        var propType = contentType.CompositionPropertyTypes.FirstOrDefault(x => x.Alias == propKey);
                        if (propType != null)
                        {
                            var config = dataTypeService.GetDataType(propType.DataTypeId).Configuration;
                            var propertyEditor = _propertyEditors[propType.PropertyEditorAlias];

                            foreach (var validator in propertyEditor.GetValueEditor().Validators)
                            {
                                foreach (var result in validator.Validate(propValues[propKey], propertyEditor.GetValueEditor().ValueType, config))
                                {
                                    result.ErrorMessage = "Item " + (i + 1) + " '" + propType.Name + "' " + result.ErrorMessage;
                                    yield return result;
                                }
                            }

                            // Check mandatory
                            if (propType.Mandatory)
                            {
                                if (propValues[propKey] == null)
                                    yield return new ValidationResult("Item " + (i + 1) + " '" + propType.Name + "' cannot be null", new[] { propKey });
                                else if (propValues[propKey].ToString().IsNullOrWhiteSpace() || (propValues[propKey].Type == JTokenType.Array && !propValues[propKey].HasValues))
                                    yield return new ValidationResult("Item " + (i + 1) + " '" + propType.Name + "' cannot be empty", new[] { propKey });
                            }

                            // Check regex
                            if (!propType.ValidationRegExp.IsNullOrWhiteSpace()
                                && propValues[propKey] != null && !propValues[propKey].ToString().IsNullOrWhiteSpace())
                            {
                                var regex = new Regex(propType.ValidationRegExp);
                                if (!regex.IsMatch(propValues[propKey].ToString()))
                                {
                                    yield return new ValidationResult("Item " + (i + 1) + " '" + propType.Name + "' is invalid, it does not match the correct pattern", new[] { propKey });
                                }
                            }
                        }
                    }
                }
            }
        }

        #endregion

        private static bool IsSystemPropertyKey(string propKey)
        {
            return propKey == "name" || propKey == "key" || propKey == ContentTypeAliasPropertyKey;
        }
    }
}