namespace DssConnectGateway;

/// <summary>Settings from appsettings.json (Gateway section).</summary>
public sealed class GatewayOptions
{
    /// <summary>HTTPS port staff connect to: https://robo.office.dsslaw.com:8893</summary>
    public int Port { get; set; } = 8893;

    /// <summary>Thumbprint of the robo certificate (issued by dsslaw-office-ca) in LocalMachine\My.</summary>
    public string CertificateThumbprint { get; set; } = "";

    /// <summary>The compiled frontend (copy of frontend\dist).</summary>
    public string WebRoot { get; set; } = @"C:\APPS\DssConnect\web";

    /// <summary>The backend, reachable only from robo itself.</summary>
    public string Backend { get; set; } = "http://127.0.0.1:8002";
}
