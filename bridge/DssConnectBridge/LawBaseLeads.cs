using System.Data;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Options;

namespace DssConnectBridge;

/// <summary>One lead as dssc.GetLeads returns it, in the shape the portal expects.</summary>
public sealed record BridgeLead(
    int serial, string lead_number, string? lead_type, string? status, string? current_status,
    int? security_level, string? assigned_login, string? assigned_name, string? assigned_email,
    string? first_name, string? last_name, string? phone, string? email, string? language);

/// <summary>Reads leads from LawBase through the signed dssc.GetLeads procedure, and nothing else.</summary>
public sealed class LawBaseLeads(IOptions<BridgeOptions> options)
{
    public async Task<List<BridgeLead>> GetLeadsAsync(IEnumerable<int> knownSerials, CancellationToken ct)
    {
        await using var cn = new SqlConnection(options.Value.SqlConnection);
        await cn.OpenAsync(ct);
        await using var cmd = new SqlCommand("dssc.GetLeads", cn) { CommandType = CommandType.StoredProcedure, CommandTimeout = 60 };
        cmd.Parameters.Add("@KnownSerials", SqlDbType.NVarChar, -1).Value = string.Join(",", knownSerials);

        var leads = new List<BridgeLead>();
        await using var r = await cmd.ExecuteReaderAsync(ct);
        string? S(string col) => r[col] is DBNull ? null : Convert.ToString(r[col])?.Trim();
        int? I(string col) => r[col] is DBNull ? null : int.TryParse(Convert.ToString(r[col]), out var v) ? v : null;
        while (await r.ReadAsync(ct))
        {
            leads.Add(new BridgeLead(
                serial: Convert.ToInt32(r["Serial"]),
                lead_number: S("LeadNumber") ?? "",
                lead_type: S("LeadType"),
                status: S("Status"),
                current_status: S("CurrentStatus"),
                security_level: I("SecurityLevel"),
                assigned_login: S("AssignedLogin"),
                assigned_name: S("AssignedName"),
                assigned_email: S("AssignedEmail"),
                first_name: S("FirstName"),
                last_name: S("LastName"),
                phone: S("Phone"),
                email: S("Email"),
                language: S("Language")));
        }
        return leads;
    }
}
