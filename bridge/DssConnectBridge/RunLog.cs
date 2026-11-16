using Microsoft.Extensions.Options;

namespace DssConnectBridge;

/// <summary>
/// A plain daily text log (one line per sync) in LogFolder, easy to read on robo,
/// kept for 30 days. Also echoed to the console when the bridge runs in a window.
/// </summary>
public sealed class RunLog(IOptions<BridgeOptions> options)
{
    private readonly object _gate = new();
    private readonly string _folder = options.Value.LogFolder;

    public void Write(string message)
    {
        var line = $"{DateTime.Now:yyyy-MM-dd HH:mm:ss}  {message}";
        Console.WriteLine(line);
        try
        {
            lock (_gate)
            {
                Directory.CreateDirectory(_folder);
                File.AppendAllText(Path.Combine(_folder, $"bridge-{DateTime.Now:yyyyMMdd}.log"), line + Environment.NewLine);
                foreach (var old in Directory.GetFiles(_folder, "bridge-*.log")
                             .Where(f => File.GetLastWriteTime(f) < DateTime.Now.AddDays(-30)))
                    File.Delete(old);
            }
        }
        catch
        {
            // A logging problem must never stop the sync.
        }
    }
}
