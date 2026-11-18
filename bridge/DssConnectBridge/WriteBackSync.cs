namespace DssConnectBridge;

/// <summary>
/// After each lead sync: writes new texts to LeadBase's SMS History and updates the status
/// of ones already written (task 2.9); every 10 minutes, sends LawBase's staff logins to the
/// portal (task 2.6). Logs only when something happened or went wrong.
/// </summary>
public sealed class WriteBackSync(PortalClient portal, LawBaseWrites lawBase, RunLog log)
{
    private DateTime _nextStaffSync = DateTime.MinValue;
    // Results written to LeadBase but not yet reported to the portal; reported first next time.
    private List<SmsDone> _unreported = [];

    public async Task RunOnceAsync(CancellationToken ct)
    {
        if (DateTime.UtcNow >= _nextStaffSync)
        {
            try
            {
                var staff = await lawBase.GetStaffAsync(ct);
                await portal.SendStaffAsync(staff, ct);
                _nextStaffSync = DateTime.UtcNow.AddMinutes(10);
            }
            catch (Exception ex) when (!ct.IsCancellationRequested)
            {
                log.Write($"Staff logins FAILED: {ex.GetType().Name}: {ex.Message}");
                _nextStaffSync = DateTime.UtcNow.AddMinutes(1);
            }
        }

        if (_unreported.Count > 0)
        {
            try { await portal.SendSmsDoneAsync(_unreported, ct); log.Write($"SMS History: reported {_unreported.Count} earlier results"); _unreported = []; }
            catch (Exception ex) when (!ct.IsCancellationRequested)
            {
                log.Write($"SMS History: still can't report {_unreported.Count} earlier results ({ex.Message}); writing nothing new until it can.");
                return;
            }
        }

        List<SmsItem> pending;
        try { pending = await portal.GetSmsPendingAsync(ct); }
        catch (Exception ex) when (!ct.IsCancellationRequested)
        {
            log.Write($"SMS History FAILED to get the to-do list: {ex.GetType().Name}: {ex.Message}");
            return;
        }
        if (pending.Count == 0) return;

        var results = new List<SmsDone>();
        int added = 0, updated = 0, failed = 0;
        foreach (var item in pending)
        {
            try
            {
                if (item.serial is int existing)
                {
                    await lawBase.UpdateSmsStatusAsync(existing, item.status, ct);
                    results.Add(new SmsDone(item.message_id, existing, item.status, null));
                    updated++;
                }
                else
                {
                    var serial = await lawBase.AddSmsAsync(item, ct);
                    results.Add(new SmsDone(item.message_id, serial, item.status, null));
                    added++;
                }
            }
            catch (Exception ex) when (!ct.IsCancellationRequested)
            {
                results.Add(new SmsDone(item.message_id, null, null, ex.Message));
                failed++;
                log.Write($"  SMS History: text {item.message_id} could not be written: {ex.Message}");
            }
        }
        try { await portal.SendSmsDoneAsync(results, ct); }
        catch (Exception ex) when (!ct.IsCancellationRequested)
        {
            // The rows are in LeadBase but the portal didn't hear back. Keep the results and
            // report them first next time (nothing new is written until then). Even if the
            // bridge restarts, dssc.AddSmsHistory returns an existing row rather than adding it twice.
            _unreported = results;
            log.Write($"SMS History: wrote {added}, but couldn't report back to the portal ({ex.Message}); will report next run.");
            return;
        }
        log.Write($"SMS History OK: {added} added, {updated} status updates{(failed > 0 ? $", {failed} failed" : "")}");
    }
}
