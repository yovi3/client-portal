namespace DssConnectBridge;

/// <summary>Settings from appsettings.json (and the bridge key from appsettings.local.json).</summary>
public sealed class BridgeOptions
{
    /// <summary>Portal address, e.g. http://127.0.0.1:8002 on robo now, the Azure address later.</summary>
    public string PortalBaseUrl { get; set; } = "http://127.0.0.1:8002";

    /// <summary>Secret shared with the portal's BRIDGE_API_KEY. Kept in appsettings.local.json only.</summary>
    public string PortalKey { get; set; } = "";

    /// <summary>LBIntegrations on DBSERV01, signed in as the service's own Windows account.</summary>
    public string SqlConnection { get; set; } =
        "Server=DBSERV01;Database=LBIntegrations;Integrated Security=true;Encrypt=true;TrustServerCertificate=true;Application Name=DSS Connect Bridge";

    /// <summary>How often leads are sent to the portal.</summary>
    public int LeadSyncSeconds { get; set; } = 60;

    /// <summary>Folder for the bridge's own readable log files.</summary>
    public string LogFolder { get; set; } = @"C:\APPS\DssConnectBridge\logs";
}
