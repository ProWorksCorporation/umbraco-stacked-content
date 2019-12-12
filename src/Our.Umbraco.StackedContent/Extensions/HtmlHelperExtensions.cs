using System.Collections.Generic;
using System.Configuration;
using System.Text;
using System.Web;
using System.Web.Mvc;
using System.Web.Mvc.Html;
using Umbraco.Core.Logging;
using Umbraco.Core.Models.PublishedContent;
using Umbraco.Web.Composing;

namespace Our.Umbraco.StackedContent.Extensions
{
    public static class HtmlHelperExtensions
    {
        private const string DefaultPathToPartials = "~/Views/Partials/StackedContentComponents/";
        private const string DefaultContainerPartial = "StackedContentContainer";
        private const string DefaultPartialExtension = ".cshtml";
        private static readonly string PathToPartials;
        private static readonly string ContainerPartial;
        private static readonly string PartialExtension;

        static HtmlHelperExtensions()
        {
            var ptp = ConfigurationManager.AppSettings["StackedContent:PathToPartials"];
            var cp = ConfigurationManager.AppSettings["StackedContent:ContainerPartial"];
            var pe = ConfigurationManager.AppSettings["StackedContent:PartialExtension"];

            PathToPartials = string.IsNullOrWhiteSpace(ptp) ? DefaultPathToPartials : ptp;
            ContainerPartial = string.IsNullOrWhiteSpace(cp) ? DefaultContainerPartial : cp;
            PartialExtension = string.IsNullOrWhiteSpace(pe) ? DefaultPartialExtension : (pe[0] != '.' ? '.' + pe : pe);
        }

        public static IHtmlString RenderStackedContent(this HtmlHelper htmlHelper, IPublishedElement content, ViewDataDictionary viewDataDictionary = null, string partialPath = null) => RenderStackedContent(htmlHelper, content == null ? null : new[] { content }, viewDataDictionary, partialPath);

        public static IHtmlString RenderStackedContent(this HtmlHelper htmlHelper, IEnumerable<IPublishedElement> contentList, ViewDataDictionary viewDataDictionary = null, string partialPath = null)
        {
            var context = HttpContext.Current;

            if (contentList == null || context == null) return new HtmlString("");
            if (string.IsNullOrEmpty(partialPath)) partialPath = PathToPartials;

            var sb = new StringBuilder();
            foreach (var content in contentList)
            {
                RenderPartial(sb, context, htmlHelper, content, partialPath, viewDataDictionary);
            }

            return new HtmlString(sb.ToString());
        }

        private static void RenderPartial(StringBuilder sb, HttpContext context, HtmlHelper htmlHelper, IPublishedElement content, string partialPath, ViewDataDictionary viewDataDictionary)
        {
            var partial = $"{partialPath}{content.ContentType.Alias}{PartialExtension}";
            var containerPartial = $"{partialPath}{ContainerPartial}{PartialExtension}";

            if (!System.IO.File.Exists(context.Server.MapPath(partial)))
            {
                Current.Logger.Info<IPublishedContent>($"The partial for {context.Server.MapPath(partial)} could not be found.  Please create a partial with that name, rename your alias, or set the StackedContent:PathToPartials application setting to point to the correct path for stacked content partials.");
            }
            else if (System.IO.File.Exists(context.Server.MapPath(containerPartial)))
            {
                if (viewDataDictionary == null) viewDataDictionary = new ViewDataDictionary();
                viewDataDictionary["scPartial"] = partial;
                sb.AppendLine(htmlHelper.Partial(containerPartial, content, viewDataDictionary).ToString());
            }
            else
            {
                sb.AppendLine(htmlHelper.Partial(partial, content, viewDataDictionary).ToString());
            }
        }
    }
}
