namespace DssConnectBridge;

/// <summary>
/// Runs the lead sync every LeadSyncSeconds. After a failure it waits longer each time
/// (up to 10 minutes) so a portal or database outage doesn't flood the log, and goes
/// back to the normal pace as soon as a sync succeeds.
/// </summary>
public sealed class LeadSyncWorker(LeadSync sync, RunLog log, Microsoft.Extensions.Options.IOptions<BridgeOptions> options)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var normal = TimeSpan.FromSeconds(Math.Max(15, options.Value.LeadSyncSeconds));
        var wait = normal;
        log.Write($"Bridge started as {Environment.UserDomainName}\\{Environment.UserName}; syncing leads every {normal.TotalSeconds:0}s to {options.Value.PortalBaseUrl}");
        while (!stoppingToken.IsCancellationRequested)
        {
            var ok = await sync.RunOnceAsync(stoppingToken);
            wait = ok ? normal : TimeSpan.FromSeconds(Math.Min(600, wait.TotalSeconds * 2));
            try { await Task.Delay(wait, stoppingToken); } catch (OperationCanceledException) { break; }
        }
        log.Write("Bridge stopped.");
    }
}
