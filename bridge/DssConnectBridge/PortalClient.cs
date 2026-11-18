using System.Net.Http.Json;
using Microsoft.Extensions.Options;

namespace DssConnectBridge;

public sealed record KnownLeads(List<int> serials);

public sealed record SyncRequest(bool sync);

public sealed record LeadSyncResult(
    int received, int created, int updated, int merged_with_typed_in, int unchanged,
    int conversations_created, List<string> skipped);

/// <summary>Talks to the portal's /bridge endpoints. Every request carries the bridge key.</summary>
public sealed class PortalClient
{
    private readonly HttpClient _http;
    private readonly bool _hasKey;

    public PortalClient(IOptions<BridgeOptions> options)
    {
        var o = options.Value;
        _hasKey = !string.IsNullOrWhiteSpace(o.PortalKey);
        _http = new HttpClient { BaseAddress = new Uri(o.PortalBaseUrl.TrimEnd('/') + "/"), Timeout = TimeSpan.FromSeconds(60) };
        if (_hasKey) _http.DefaultRequestHeaders.Add("X-Bridge-Key", o.PortalKey);
        _http.DefaultRequestHeaders.UserAgent.ParseAdd("DSSConnectBridge/1.0");
    }

    private void RequireKey()
    {
        if (!_hasKey)
            throw new InvalidOperationException("Bridge:PortalKey is empty. Put the key in appsettings.local.json next to the program.");
    }

    public async Task<List<int>> GetKnownSerialsAsync(CancellationToken ct)
    {
        RequireKey();
        using var res = await _http.GetAsync("bridge/known-leads", ct);
        if (!res.IsSuccessStatusCode)
            throw new HttpRequestException($"Portal said {(int)res.StatusCode}: {await res.Content.ReadAsStringAsync(ct)}");
        var known = await res.Content.ReadFromJsonAsync<KnownLeads>(ct);
        return known?.serials ?? [];
    }

    /// <summary>
    /// Waits (up to <paramref name="seconds"/>) for staff to click Load leads. True means
    /// sync now. The portal holds this request open, so the bridge hears about a click at once.
    /// </summary>
    public async Task<bool> WaitForSyncRequestAsync(int seconds, CancellationToken ct)
    {
        RequireKey();
        using var res = await _http.GetAsync($"bridge/wait-for-request?seconds={seconds}", ct);
        if (!res.IsSuccessStatusCode)
            throw new HttpRequestException($"Portal said {(int)res.StatusCode}");
        var answer = await res.Content.ReadFromJsonAsync<SyncRequest>(ct);
        return answer?.sync == true;
    }

    public async Task<LeadSyncResult> SendLeadsAsync(List<BridgeLead> leads, CancellationToken ct)
    {
        RequireKey();
        using var res = await _http.PostAsJsonAsync("bridge/leads", new { leads }, ct);
        if (!res.IsSuccessStatusCode)
            throw new HttpRequestException($"Portal said {(int)res.StatusCode}: {await res.Content.ReadAsStringAsync(ct)}");
        return (await res.Content.ReadFromJsonAsync<LeadSyncResult>(ct))!;
    }
}
