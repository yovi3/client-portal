using System.Diagnostics;
using Microsoft.Extensions.Options;

namespace DssConnectGateway;

/// <summary>Settings for the backend the gateway starts and looks after (Backend section).</summary>
public sealed class BackendOptions
{
    /// <summary>False = the backend is started some other way (the gateway only forwards to it).</summary>
    public bool Manage { get; set; } = true;
    public string Python { get; set; } = @"C:\APPS\client-portal\backend\.venv\Scripts\python.exe";
    public string WorkingDirectory { get; set; } = @"C:\APPS\client-portal\backend";
    /// <summary>No --reload: a running service doesn't watch code. Restart the service after an update.</summary>
    public string Arguments { get; set; } = "-m uvicorn app.main:app --host 127.0.0.1 --port 8002";
    public string LogFile { get; set; } = @"C:\APPS\portal-logs\backend.log";
}

/// <summary>
/// Starts the Python backend when the gateway service starts, restarts it if it stops,
/// and stops it with the service. Its output goes to LogFile (kept to the last 20 MB).
/// That way the whole portal on robo is one Windows service, which survives reboots.
/// </summary>
public sealed class BackendHost(IOptions<BackendOptions> options, ILogger<BackendHost> logger) : BackgroundService
{
    private readonly BackendOptions _o = options.Value;
    private Process? _process;
    private readonly object _logGate = new();

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_o.Manage) return;
        var restarts = 0;
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                Start();
                Log($"--- backend started (PID {_process!.Id})");
                await _process.WaitForExitAsync(stoppingToken);
                Log($"--- backend stopped with exit code {_process.ExitCode}; restarting");
                logger.LogError("DSS Connect backend stopped with exit code {Code}; restarting.", _process.ExitCode);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                Log($"--- backend could not start: {ex.Message}");
                logger.LogError(ex, "DSS Connect backend could not start.");
            }
            restarts++;
            // Wait a little longer after each failure (5 s up to 1 min) so a broken setup doesn't spin.
            await Task.Delay(TimeSpan.FromSeconds(Math.Min(60, 5 * restarts)), stoppingToken).ContinueWith(_ => { });
        }
    }

    private void Start()
    {
        var psi = new ProcessStartInfo(_o.Python, _o.Arguments)
        {
            WorkingDirectory = _o.WorkingDirectory,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        psi.Environment["PYTHONUNBUFFERED"] = "1";
        _process = new Process { StartInfo = psi, EnableRaisingEvents = true };
        _process.OutputDataReceived += (_, e) => { if (e.Data is not null) Log(e.Data); };
        _process.ErrorDataReceived += (_, e) => { if (e.Data is not null) Log(e.Data); };
        _process.Start();
        _process.BeginOutputReadLine();
        _process.BeginErrorReadLine();
    }

    private void Log(string line)
    {
        try
        {
            lock (_logGate)
            {
                Directory.CreateDirectory(Path.GetDirectoryName(_o.LogFile)!);
                var info = new FileInfo(_o.LogFile);
                if (info.Exists && info.Length > 20L * 1024 * 1024)
                    File.Move(_o.LogFile, _o.LogFile + ".old", overwrite: true);
                File.AppendAllText(_o.LogFile, $"{DateTime.Now:yyyy-MM-dd HH:mm:ss}  {line}{Environment.NewLine}");
            }
        }
        catch
        {
            // Logging must never stop the backend.
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        // Stop the backend first, so the service never waits on it.
        try
        {
            if (_process is { HasExited: false })
            {
                _process.Kill(entireProcessTree: true);
                Log("--- backend stopped with the service");
            }
        }
        catch { /* already gone */ }
        await base.StopAsync(cancellationToken);
    }
}
