/*
  Test (plan task 2.2): act as OFFICE\svc-dssconnect and check that it can get leads
  through dssc.GetLeads, and cannot read LawBase or other LBIntegrations tables directly.
  Nothing is changed. Run as an administrator (it needs permission to impersonate).
*/
USE LBIntegrations;
GO
-- Pick a non-dssc table to try, while still running as you (the bridge can't even see their names).
DECLARE @other sysname = (SELECT TOP (1) QUOTENAME(SCHEMA_NAME(schema_id)) + N'.' + QUOTENAME(name)
                          FROM sys.tables WHERE SCHEMA_NAME(schema_id) <> N'dssc' ORDER BY name);
DECLARE @leads TABLE (Serial int, LeadNumber nvarchar(400), LeadType nvarchar(400), Status nvarchar(400),
    CurrentStatus nvarchar(400), SecurityLevel nvarchar(400), AssignedLogin nvarchar(400), AssignedName nvarchar(400),
    AssignedEmail nvarchar(400), FirstName nvarchar(400), LastName nvarchar(400), Phone nvarchar(400),
    Email nvarchar(400), Language nvarchar(400));
DECLARE @result nvarchar(400);

EXECUTE AS LOGIN = N'OFFICE\svc-dssconnect';
PRINT 'Now acting as ' + SUSER_SNAME();

BEGIN TRY
    INSERT INTO @leads EXEC dssc.GetLeads;
    SELECT @result = CONCAT('PASS  dssc.GetLeads returned ', COUNT(*), ' leads (',
        SUM(CASE WHEN Status = N'New' THEN 1 ELSE 0 END), ' New, ',
        SUM(CASE WHEN Status = N'In Progress' THEN 1 ELSE 0 END), ' In Progress; ',
        SUM(CASE WHEN Phone IS NOT NULL THEN 1 ELSE 0 END), ' with a phone)') FROM @leads;
END TRY BEGIN CATCH SET @result = N'FAIL  dssc.GetLeads: ' + ERROR_MESSAGE(); END CATCH;
PRINT @result;

-- The way the running bridge calls it: with every lead the portal already knows.
DECLARE @known nvarchar(max) = (SELECT STRING_AGG(CAST(Serial AS nvarchar(20)), N',') FROM @leads);
DECLARE @started datetime2 = SYSDATETIME();
DELETE FROM @leads;
BEGIN TRY
    INSERT INTO @leads EXEC dssc.GetLeads @KnownSerials = @known;
    DECLARE @ms int = DATEDIFF(millisecond, @started, SYSDATETIME());
    SELECT @result = CONCAT(CASE WHEN @ms <= 10000 THEN 'PASS' ELSE 'FAIL' END,
        '  with ', (SELECT COUNT(*) FROM STRING_SPLIT(ISNULL(@known, N''), N',')), ' known leads it returned ', COUNT(*),
        ' leads in ', @ms, ' ms (must be under 10,000)') FROM @leads;
END TRY BEGIN CATCH SET @result = N'FAIL  dssc.GetLeads with known leads: ' + ERROR_MESSAGE(); END CATCH;
PRINT @result;

BEGIN TRY
    DECLARE @n int = (SELECT COUNT(*) FROM Lawbase12.dbo.PB0);
    PRINT 'FAIL  reading Lawbase12.dbo.PB0 directly was allowed. It should be refused.';
END TRY BEGIN CATCH PRINT 'PASS  reading Lawbase12.dbo.PB0 directly was refused.'; END CATCH;

IF @other IS NULL
    PRINT 'SKIP  LBIntegrations has no other tables to try.';
ELSE
BEGIN TRY
    EXEC (N'DECLARE @x int = (SELECT COUNT(*) FROM ' + @other + N');');
    PRINT 'FAIL  reading ' + @other + ' directly was allowed. It should be refused.';
END TRY BEGIN CATCH PRINT 'PASS  reading ' + @other + ' directly was refused.'; END CATCH;

REVERT;
PRINT 'Back to ' + SUSER_SNAME();
GO
