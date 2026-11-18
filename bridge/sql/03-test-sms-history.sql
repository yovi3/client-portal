/*
  Test (plan tasks 2.6 and 2.9): act as OFFICE\svc-dssconnect and add ONE clearly marked
  test text to the SMS History of test lead 4058, then mark it Delivered. Proves the bridge
  account can write SMS History only through the signed procedures.
  The row stays, so you can see it in LeadBase; 04-remove-test-sms.sql removes it.
*/
USE LBIntegrations;
GO
DECLARE @lead int = (SELECT Serial FROM Lawbase12.dbo.PB0 WHERE ID = '4058');
DECLARE @counter int = (SELECT Number FROM Lawbase12.dbo.Counters WHERE Table_Name = 'SmsHistory');
PRINT CONCAT('Test lead 4058 serial: ', ISNULL(CAST(@lead AS varchar(20)), 'NOT FOUND'),
             '. LawBase SmsHistory counter now: ', ISNULL(CAST(@counter AS varchar(20)), '(none yet)'));

EXECUTE AS LOGIN = N'OFFICE\svc-dssconnect';
PRINT 'Now acting as ' + SUSER_SNAME();

DECLARE @staff int;
BEGIN TRY
    DECLARE @s TABLE (Login varchar(100), Email varchar(200), FullName varchar(200));
    INSERT INTO @s EXEC dssc.GetStaff;
    SELECT @staff = COUNT(*) FROM @s;
    PRINT CONCAT('PASS  dssc.GetStaff returned ', @staff, ' active LawBase users with an email');
END TRY BEGIN CATCH PRINT 'FAIL  dssc.GetStaff: ' + ERROR_MESSAGE(); END CATCH;

DECLARE @serial int, @now datetime = GETDATE();
BEGIN TRY
    EXEC dssc.AddSmsHistory @CaseSerial = @lead, @DateOfSms = @now, @Direction = 'Outgoing', @PostBy = 'DSSCONNECT',
        @PhoneNumber = '0000000000', @Message = 'DSS Connect test row (safe to delete). Written by the bridge account through dssc.AddSmsHistory.',
        @Status = 'Sent', @Source = 'DSSConnect:TEST', @Serial = @serial OUTPUT;
    IF @serial > 0 PRINT CONCAT('PASS  test text added to lead 4058''s SMS History as row ', @serial);
    ELSE PRINT 'FAIL  no row number came back';
END TRY BEGIN CATCH PRINT 'FAIL  dssc.AddSmsHistory: ' + ERROR_MESSAGE(); END CATCH;

BEGIN TRY
    DECLARE @u TABLE (updated int);
    INSERT INTO @u EXEC dssc.UpdateSmsStatus @Serial = @serial, @Status = 'Delivered';
    DECLARE @updated int = (SELECT updated FROM @u);
    IF @updated = 1 PRINT 'PASS  status updated to Delivered (1 row)';
    ELSE PRINT CONCAT('FAIL  status update changed ', ISNULL(@updated, 0), ' rows; expected 1');
END TRY BEGIN CATCH PRINT 'FAIL  dssc.UpdateSmsStatus: ' + ERROR_MESSAGE(); END CATCH;

BEGIN TRY
    DECLARE @n int = (SELECT COUNT(*) FROM Lawbase12.dbo.SmsHistory);
    PRINT 'FAIL  reading SmsHistory directly was allowed. It should be refused.';
END TRY BEGIN CATCH PRINT 'PASS  reading SmsHistory directly was refused.'; END CATCH;

BEGIN TRY
    EXEC dssc.AddSmsHistory @CaseSerial = @lead, @DateOfSms = @now, @Direction = 'Outgoing', @PostBy = 'X',
        @PhoneNumber = '0', @Message = 'x', @Status = 'Sent', @Source = 'NotDSS', @Serial = @serial OUTPUT;
    PRINT 'FAIL  a row with a non-DSS Connect source was accepted.';
END TRY BEGIN CATCH PRINT 'PASS  a non-DSS Connect source was refused: ' + ERROR_MESSAGE(); END CATCH;

REVERT;
PRINT 'Back to ' + SUSER_SNAME();
DECLARE @after int = (SELECT Number FROM Lawbase12.dbo.Counters WHERE Table_Name = 'SmsHistory');
PRINT CONCAT('LawBase SmsHistory counter after the test: ', @after);
SELECT TOP 1 Serial, CaseSerial, DateOfSms, Direction, PostBy, Status, Source FROM Lawbase12.dbo.SmsHistory
WHERE Source = 'DSSConnect:TEST' ORDER BY Serial DESC;
GO
