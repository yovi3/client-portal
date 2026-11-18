/* Removes the test row(s) that 03-test-sms-history.sql added (Source = DSSConnect:TEST). */
USE Lawbase12;
GO
DELETE FROM dbo.SmsHistory WHERE Source = 'DSSConnect:TEST';
PRINT CONCAT('Removed ', @@ROWCOUNT, ' test row(s).');
GO
