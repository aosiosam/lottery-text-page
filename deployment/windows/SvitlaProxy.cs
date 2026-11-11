using System;
using System.IO;
using System.Net;
using System.Web;

public class SvitlaProxy : IHttpHandler {
    public bool IsReusable { get { return true; } }
    public void ProcessRequest(HttpContext context) {
        var incoming=context.Request;
        if(!incoming.IsSecureConnection && !incoming.RawUrl.StartsWith("/.well-known/acme-challenge/", StringComparison.Ordinal)) {
            context.Response.StatusCode=308;
            context.Response.RedirectLocation="https://svitla.it.com"+incoming.RawUrl;
            return;
        }
        var outgoing=(HttpWebRequest)WebRequest.Create("http://127.0.0.1:3088"+incoming.RawUrl);
        outgoing.Proxy=null; outgoing.Method=incoming.HttpMethod;
        outgoing.AllowAutoRedirect=false; outgoing.Timeout=90000; outgoing.ReadWriteTimeout=90000;
        outgoing.Host=incoming.Headers["Host"];
        foreach(string key in incoming.Headers.AllKeys) {
            if(String.IsNullOrEmpty(key)) continue;
            string lower=key.ToLowerInvariant();
            if(lower=="host"||lower=="content-length"||lower=="connection"||lower=="accept-encoding"||lower=="transfer-encoding"||lower=="expect"||lower.StartsWith("x-forwarded-")) continue;
            if(lower=="accept") outgoing.Accept=incoming.Headers[key];
            else if(lower=="content-type") outgoing.ContentType=incoming.ContentType;
            else if(lower=="user-agent") outgoing.UserAgent=incoming.UserAgent;
            else if(lower=="referer") outgoing.Referer=incoming.Headers[key];
            else if(!WebHeaderCollection.IsRestricted(key)) outgoing.Headers[key]=incoming.Headers[key];
        }
        outgoing.Headers["X-Forwarded-Proto"]=incoming.IsSecureConnection?"https":"http";
        if(incoming.HttpMethod!="GET"&&incoming.HttpMethod!="HEAD") {
            outgoing.ContentLength=incoming.ContentLength;
            if(incoming.ContentLength>0) using(Stream stream=outgoing.GetRequestStream()) incoming.InputStream.CopyTo(stream);
        }
        HttpWebResponse upstream=null;
        try { upstream=(HttpWebResponse)outgoing.GetResponse(); }
        catch(WebException error) { upstream=error.Response as HttpWebResponse; if(upstream==null){context.Response.StatusCode=502;context.Response.TrySkipIisCustomErrors=true;context.Response.ContentType="text/plain; charset=utf-8";context.Response.Write("Website temporarily unavailable.");return;} }
        using(upstream) {
            context.Response.StatusCode=(int)upstream.StatusCode;
            context.Response.TrySkipIisCustomErrors=true;context.Response.BufferOutput=false;
            foreach(string key in upstream.Headers.AllKeys) {
                string lower=key.ToLowerInvariant();
                if(lower=="connection"||lower=="transfer-encoding"||lower=="keep-alive"||lower=="content-length")continue;
                if(lower=="content-type"){context.Response.ContentType=upstream.ContentType;continue;}
                foreach(string value in upstream.Headers.GetValues(key))context.Response.AppendHeader(key,value);
            }
            if(incoming.HttpMethod!="HEAD")using(Stream stream=upstream.GetResponseStream())stream.CopyTo(context.Response.OutputStream);
        }
    }
}
