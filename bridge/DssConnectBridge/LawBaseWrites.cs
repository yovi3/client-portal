using System.Data;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Options;

namespace DssConnectBridge;

public sealed record StaffMember(string login, string? email, string? name);

/// <summary>
/// LawBase staff (dssc.GetStaff) and writing texts to LeadBase's SMS History
/// (dssc.AddSmsHistory, dssc.UpdateSmsStatus). Signed procedures only.
/// </summary>
public sealed class LawBaseWrites(IOptions<BridgeOptions> options)
{
    private SqlConnection Open() => new(options.Value.SqlConnection);

    public async Task<List<StaffMember>> GetStaffAsync(CancellationToken ct)
    {
        await using var cn = Open();
        await cn.OpenAsync(ct);
        await using var cmd = new SqlCommand("dssc.GetStaff", cn) { CommandType = CommandType.StoredProcedure, CommandTimeout = 60 };
        var staff = new List<StaffMember>();
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
            staff.Add(new StaffMember(
                Convert.ToString(r["Login"])!.Trim(),
                r["Email"] is DBNull ? null : Convert.ToString(r["Email"])?.Trim(),
                r["FullName"] is DBNull ? null : Convert.ToString(r["FullName"])?.Trim()));
        return staff;
    }

    /// <summary>Adds one text and returns its SmsHistory row number.</summary>
    public async Task<int> AddSmsAsync(SmsItem item, CancellationToken ct)
    {
        await using var cn = Open();
        await cn.OpenAsync(ct);
        await using var cmd = new SqlCommand("dssc.AddSmsHistory", cn) { CommandType = CommandType.StoredProcedure, CommandTimeout = 30 };
        cmd.Parameters.Add("@CaseSerial", SqlDbType.Int).Value = item.case_serial;
        // LawBase stores the time on robo's clock (Eastern), like its own texts.
        cmd.Parameters.Add("@DateOfSms", SqlDbType.DateTime).Value = item.date_utc.ToLocalTime().DateTime;
        cmd.Parameters.Add("@Direction", SqlDbType.VarChar, 10).Value = item.direction;
        cmd.Parameters.Add("@PostBy", SqlDbType.VarChar, 50).Value = item.post_by;
        cmd.Parameters.Add("@PhoneNumber", SqlDbType.VarChar, 20).Value = item.phone;
        cmd.Parameters.Add("@Message", SqlDbType.VarChar, -1).Value = item.message;
        cmd.Parameters.Add("@Status", SqlDbType.VarChar, 20).Value = item.status;
        cmd.Parameters.Add("@Source", SqlDbType.VarChar, 50).Value = item.source;
        var serial = cmd.Parameters.Add("@Serial", SqlDbType.Int);
        serial.Direction = ParameterDirection.Output;
        await cmd.ExecuteNonQueryAsync(ct);
        return serial.Value is int s && s > 0 ? s : throw new InvalidOperationException("No SmsHistory row number came back.");
    }

    /// <summary>Updates the status of a row DSS Connect added. Returns rows changed (0 or 1).</summary>
    public async Task<int> UpdateSmsStatusAsync(int serial, string status, CancellationToken ct)
    {
        await using var cn = Open();
        await cn.OpenAsync(ct);
        await using var cmd = new SqlCommand("dssc.UpdateSmsStatus", cn) { CommandType = CommandType.StoredProcedure, CommandTimeout = 30 };
        cmd.Parameters.Add("@Serial", SqlDbType.Int).Value = serial;
        cmd.Parameters.Add("@Status", SqlDbType.VarChar, 20).Value = status;
        return Convert.ToInt32(await cmd.ExecuteScalarAsync(ct));
    }
}
