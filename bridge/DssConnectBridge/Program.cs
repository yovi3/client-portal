// DSS Connect bridge (plan Phase 2). Runs on robo as a Windows service under
// OFFICE\svc-dssconnect. It connects out to the portal over HTTPS and to SQL Server
// with its own Windows identity; nothing connects in to it.
//
//   DssConnectBridge.exe            run until stopped (as a service or in a window)
//   DssConnectBridge.exe --once     run one sync, print what happened, and exit

using DssConnectBridge;

var once = args.Contains("--once", StringComparer.OrdinalIgnoreCase);

var builder = Host.CreateApplicationBuilder(args);
builder.Configuration.AddJsonFile("appsettings.local.json", optional: true, reloadOnChange: false);
builder.Services.AddWindowsService(o => o.ServiceName = "DSS Connect Bridge");

builder.Services.Configure<BridgeOptions>(builder.Configuration.GetSection("Bridge"));
builder.Services.AddSingleton<RunLog>();
builder.Services.AddSingleton<PortalClient>();
builder.Services.AddSingleton<LawBaseLeads>();
builder.Services.AddSingleton<LeadSync>();

if (once)
{
    using var host = builder.Build();
    var sync = host.Services.GetRequiredService<LeadSync>();
    var ok = await sync.RunOnceAsync(CancellationToken.None);
    return ok ? 0 : 1;
}

builder.Services.AddHostedService<LeadSyncWorker>();
builder.Build().Run();
return 0;
