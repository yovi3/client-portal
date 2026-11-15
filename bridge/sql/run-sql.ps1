<#
  Runs a .sql script against DBSERV01, batch by batch (split on GO lines), and prints
  the messages SQL sends back (PRINT lines) and any result rows. Uses your Windows sign-in.
  Usage:  .\run-sql.ps1 .\01-dssc-setup.sql
#>
param([Parameter(Mandatory)][string]$Path, [string]$Server = 'DBSERV01')
$text = [IO.File]::ReadAllText((Resolve-Path $Path))
$batches = [regex]::Split($text, '(?im)^\s*GO\s*$') | Where-Object { $_.Trim() }
$messages = New-Object System.Collections.Generic.List[string]
$cn = New-Object System.Data.SqlClient.SqlConnection "Server=$Server;Database=master;Integrated Security=true"
# PRINT output arrives as events; collect it here and show it after each batch.
$cn.add_InfoMessage({ param($s, $e) $messages.Add($e.Message) }.GetNewClosure())
$cn.Open()
$n = 0
try {
    foreach ($b in $batches) {
        $n++
        $cmd = $cn.CreateCommand(); $cmd.CommandText = $b; $cmd.CommandTimeout = 120
        $r = $cmd.ExecuteReader()
        do { while ($r.Read()) { $vals = for ($i = 0; $i -lt $r.FieldCount; $i++) { "$($r.GetName($i))=$($r[$i])" }; "  " + ($vals -join '  ') } } while ($r.NextResult())
        $r.Close()
        foreach ($m in $messages) { "  $m" }
        $messages.Clear()
    }
    "OK: $n batches ran."
} catch {
    foreach ($m in $messages) { "  $m" }
    "FAILED in batch ${n}: $($_.Exception.InnerException.Message)$($_.Exception.Message)"
} finally { $cn.Close() }
