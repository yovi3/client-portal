// DSS Connect gateway. The one door from the office network into DSS Connect on robo,
// and the keeper of the backend: it starts the Python backend and restarts it if needed.
//
//   https://robo.office.dsslaw.com:8893/          the compiled frontend (served from WebRoot)
//   https://robo.office.dsslaw.com:8893/api/...   passed to the backend on 127.0.0.1:8002,
//                                                 with /api removed (live connections too)
//
// HTTPS uses robo's certificate straight from the Windows certificate store, so the
// private key is never copied to a file. The backend itself stays reachable only from
// robo. The bridge's endpoints (/api/bridge/...) are refused here: only the bridge on
// robo may call them, directly. IIS and the other sites on robo are not involved.

using System.Security.Cryptography.X509Certificates;
using DssConnectGateway;
using Microsoft.Extensions.FileProviders;
using Yarp.ReverseProxy.Configuration;

var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    ContentRootPath = AppContext.BaseDirectory,
});
builder.Services.AddWindowsService(o => o.ServiceName = "DSS Connect Gateway");
// Stop within a few seconds even with browsers connected (live updates), so Windows
// never gives up waiting for the service to stop. Browsers reconnect on their own.
builder.Services.Configure<HostOptions>(o => o.ShutdownTimeout = TimeSpan.FromSeconds(5));

var gw = builder.Configuration.GetSection("Gateway").Get<GatewayOptions>() ?? new GatewayOptions();

// The gateway also starts the backend and keeps it running (see BackendHost.cs).
builder.Services.Configure<BackendOptions>(builder.Configuration.GetSection("Backend"));
builder.Services.AddHostedService<BackendHost>();
var certificate = LoadCertificate(gw.CertificateThumbprint);

builder.WebHost.ConfigureKestrel(k =>
{
    k.AddServerHeader = false;
    k.Limits.MaxRequestBodySize = 1100L * 1024 * 1024; // up to 20 files of 50 MB in one "Send documents"
    k.ListenAnyIP(gw.Port, listen => listen.UseHttps(certificate));
});

var routes = new[]
{
    new RouteConfig
    {
        RouteId = "backend",
        ClusterId = "backend",
        Match = new RouteMatch { Path = "/api/{**rest}" },
        Transforms = new List<IReadOnlyDictionary<string, string>>
        {
            new Dictionary<string, string> { ["PathRemovePrefix"] = "/api" },
        },
    },
};
var clusters = new[]
{
    new ClusterConfig
    {
        ClusterId = "backend",
        Destinations = new Dictionary<string, DestinationConfig>
        {
            ["robo"] = new DestinationConfig { Address = gw.Backend },
        },
        // Large uploads on a slow connection can take a while.
        HttpRequest = new Yarp.ReverseProxy.Forwarder.ForwarderRequestConfig { ActivityTimeout = TimeSpan.FromMinutes(10) },
    },
};
builder.Services.AddReverseProxy().LoadFromMemory(routes, clusters);

var app = builder.Build();
var webRoot = new PhysicalFileProvider(gw.WebRoot);

app.Use(async (context, next) =>
{
    // Basic protections for every response. (No HSTS: other sites on robo still use
    // plain http on other ports, and HSTS would apply to all of them.)
    var headers = context.Response.Headers;
    headers["X-Content-Type-Options"] = "nosniff";
    headers["X-Frame-Options"] = "DENY";
    headers["Referrer-Policy"] = "same-origin";

    if (context.Request.Path.StartsWithSegments("/api/bridge"))
    {
        context.Response.StatusCode = StatusCodes.Status404NotFound; // bridge only, never from the network
        return;
    }
    await next();
});

app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = webRoot });
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = webRoot,
    OnPrepareResponse = c =>
    {
        // Built files have a fingerprint in their name, so they can be cached for good;
        // index.html is always checked so a new build is picked up at once.
        c.Context.Response.Headers.CacheControl = c.Context.Request.Path.StartsWithSegments("/assets")
            ? "public, max-age=31536000, immutable"
            : "no-cache";
    },
});

app.MapReverseProxy();

// Any other address is a page of the app (/leads, /u/..., /settings): send index.html.
app.MapFallbackToFile("index.html", new StaticFileOptions
{
    FileProvider = webRoot,
    OnPrepareResponse = c => c.Context.Response.Headers.CacheControl = "no-cache",
});

app.Run();

static X509Certificate2 LoadCertificate(string thumbprint)
{
    var wanted = (thumbprint ?? "").Replace(" ", "").ToUpperInvariant();
    if (wanted.Length == 0)
        throw new InvalidOperationException("Gateway:CertificateThumbprint is empty in appsettings.json.");
    using var store = new X509Store(StoreName.My, StoreLocation.LocalMachine);
    store.Open(OpenFlags.ReadOnly);
    var found = store.Certificates.Find(X509FindType.FindByThumbprint, wanted, validOnly: false);
    if (found.Count == 0)
        throw new InvalidOperationException($"Certificate {wanted} not found in LocalMachine\\My.");
    var cert = found[0];
    if (!cert.HasPrivateKey)
        throw new InvalidOperationException($"Certificate {wanted} has no private key on this machine.");
    return cert;
}
