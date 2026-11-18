namespace DssConnectBridge;

/// <summary>
/// One sync: ask the portal which leads it knows, get those plus every New and In Progress
/// lead from LawBase, and send them to the portal. Logs one line with the outcome.
/// </summary>
public sealed class LeadSync(PortalClient portal, LawBaseLeads lawBase, RunLog log)
{
    // The phone notes from the last sync; logged again only when they change.
    private string _lastNotes = "";
    private int _quietRuns;

    public async Task<bool> RunOnceAsync(CancellationToken ct)
    {
        var started = DateTime.Now;
        try
        {
            var known = await portal.GetKnownSerialsAsync(ct);
            var leads = await lawBase.GetLeadsAsync(known, ct);
            var result = await portal.SendLeadsAsync(leads, ct);
            var notes = string.Join("\n", result.skipped);
            var changedSomething = result.created + result.updated + result.merged_with_typed_in + result.conversations_created > 0;
            // Log a line when something changed, when the notes change, and otherwise once an hour.
            if (changedSomething || notes != _lastNotes || ++_quietRuns >= 60)
            {
                _quietRuns = 0;
                log.Write($"Leads OK: sent {result.received} ({result.created} new, {result.updated} changed, " +
                          $"{result.merged_with_typed_in} merged with typed-in, {result.unchanged} unchanged, " +
                          $"{result.conversations_created} conversations started) in {(DateTime.Now - started).TotalSeconds:0.0}s");
                if (notes != _lastNotes)
                    foreach (var note in result.skipped)
                        log.Write($"  Note: {note}");
            }
            _lastNotes = notes;
            return true;
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            return false;
        }
        catch (Exception ex)
        {
            log.Write($"Leads FAILED: {ex.GetType().Name}: {ex.Message}");
            return false;
        }
    }
}
