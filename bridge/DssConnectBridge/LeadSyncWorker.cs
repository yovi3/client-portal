namespace DssConnectBridge;

/// <summary>
/// Runs the lead sync every LeadSyncSeconds. Between syncs it keeps one request open to the
/// portal, so when staff click "Load leads" it syncs straight away instead of waiting.
/// After a failure it waits longer each time (up to 10 minutes) so a portal or database
/// outage doesn't flood the log, and goes back to the normal pace as soon as a sync works.
/// </summary>
public sealed class LeadSyncWorker(LeadSync sync, WriteBackSync writeBack, PortalClient portal, RunLog log, Microsoft.Extensions.Options.IOptions<BridgeOptions> options)
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
            if (ok)
            {
                // Then LeadBase write-back: texts into SMS History, staff logins.
                try { await writeBack.RunOnceAsync(stoppingToken); }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
                catch (Exception ex) { log.Write($"Write-back FAILED: {ex.GetType().Name}: {ex.Message}"); }
            }
            wait = ok ? normal : TimeSpan.FromSeconds(Math.Min(600, wait.TotalSeconds * 2));
            try
            {
                await WaitUntilDueOrAskedAsync(DateTime.UtcNow + wait, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
        log.Write("Bridge stopped.");
    }

    // Waits until the next sync is due, returning early if staff click Load leads.
    private async Task WaitUntilDueOrAskedAsync(DateTime due, CancellationToken ct)
    {
        while (DateTime.UtcNow < due)
        {
            var remaining = due - DateTime.UtcNow;
            var seconds = (int)Math.Ceiling(Math.Min(25, remaining.TotalSeconds));
            if (seconds < 1) return;
            bool asked;
            try
            {
                asked = await portal.WaitForSyncRequestAsync(seconds, ct);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw;
            }
            catch
            {
                // Portal unreachable or busy: just wait the ordinary way for this stretch.
                await Task.Delay(TimeSpan.FromSeconds(seconds), ct);
                continue;
            }
            if (asked)
            {
                log.Write("Load leads was clicked; syncing now.");
                return;
            }
        }
    }
}
