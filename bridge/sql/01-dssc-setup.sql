/*
  DSS Connect bridge: SQL setup (plan task 2.2)
  Server: DBSERV01. Safe to run again; each run rebuilds the signing certificate.

  How access works, and why:
  - The bridge's account (OFFICE\svc-dssconnect) may only run procedures in the dssc
    schema of LBIntegrations. It cannot read or change any LawBase table itself.
  - Each dssc procedure is signed with a certificate. In Lawbase12, a user made from
    that certificate has SELECT on only the tables the procedures need. Only signed
    code gets those rights, and only while it runs.
  - The certificate's private key is removed right after signing, so no password or
    key is stored anywhere and nothing else can be signed with it. Changing a
    procedure later means running this script again, which makes a new certificate.
  - Cross-database chaining and TRUSTWORTHY stay OFF on both databases.
*/

USE LBIntegrations;
GO

IF SCHEMA_ID(N'dssc') IS NULL
    EXEC (N'CREATE SCHEMA dssc AUTHORIZATION dbo');
GO

/* Leads for the portal: everything New or In Progress in LeadBase, plus any lead the
   portal already has (so it learns when a lead moves on to Accepted, Rejected or Closed).
   @KnownSerials is a comma-separated list of PB0.Serial values.

   The known Serials go into a small keyed table first; the two lists are then looked up
   separately and combined. (Comparing every PB0 row with the split list directly took
   over a minute with a few hundred known leads.) */
CREATE OR ALTER PROCEDURE dssc.GetLeads
    @KnownSerials nvarchar(max) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @known TABLE (Serial int NOT NULL PRIMARY KEY);
    INSERT INTO @known (Serial)
    SELECT DISTINCT TRY_CAST(LTRIM(RTRIM(value)) AS int)
    FROM STRING_SPLIT(ISNULL(@KnownSerials, N''), N',')
    WHERE TRY_CAST(LTRIM(RTRIM(value)) AS int) IS NOT NULL;

    DECLARE @wanted TABLE (Serial int NOT NULL PRIMARY KEY);
    INSERT INTO @wanted (Serial)
    SELECT p.Serial FROM Lawbase12.dbo.PB0 AS p WHERE p.Status IN (N'New', N'In Progress')
    UNION
    SELECT k.Serial FROM @known AS k;

    SELECT
        p.Serial,
        p.ID                                   AS LeadNumber,
        p.Type                                 AS LeadType,
        NULLIF(LTRIM(RTRIM(p.Status)), '')     AS Status,
        NULLIF(LTRIM(RTRIM(p.CurrentStatus)), '') AS CurrentStatus,
        p.Security                             AS SecurityLevel,
        NULLIF(p.AssignedTo, '')               AS AssignedLogin,
        u.FullName                             AS AssignedName,
        NULLIF(u.email, '')                    AS AssignedEmail,
        NULLIF(c.fname, '')                    AS FirstName,
        NULLIF(c.LName, '')                    AS LastName,
        NULLIF(c.phone, '')                    AS Phone,
        NULLIF(c.Email, '')                    AS Email,
        NULLIF(c.Language, '')                 AS Language
    FROM @wanted AS w
    JOIN Lawbase12.dbo.PB0 AS p ON p.Serial = w.Serial
    OUTER APPLY (
        SELECT TOP (1) fname, LName, phone, Email, Language
        FROM Lawbase12.dbo.PB2
        WHERE CaseSerial = p.Serial
        ORDER BY Serial
    ) AS c
    LEFT JOIN Lawbase12.dbo.User_Profile AS u ON u.Login = p.AssignedTo;
END;
GO

/* ---------------------------------------------------------------------------------
   Rebuild the signing certificate and sign every procedure in the dssc schema.
   --------------------------------------------------------------------------------- */
DECLARE @cert sysname = N'DSSC_LawbaseReader';
DECLARE @pw nvarchar(200) = CONCAT(NEWID(), N'#Aa1', NEWID());  -- used once, never stored
DECLARE @sql nvarchar(max);

-- 1. Remove the old certificate and its user from Lawbase12.
SET @sql = N'
IF USER_ID(N''DSSC_LawbaseReader'') IS NOT NULL DROP USER DSSC_LawbaseReader;
IF CERT_ID(N''DSSC_LawbaseReader'') IS NOT NULL DROP CERTIFICATE DSSC_LawbaseReader;';
EXEC Lawbase12.sys.sp_executesql @sql;

-- 2. Remove old signatures in LBIntegrations, then the old certificate.
SET @sql = N'';
SELECT @sql += N'DROP SIGNATURE FROM ' + QUOTENAME(SCHEMA_NAME(o.schema_id)) + N'.' + QUOTENAME(o.name)
             + N' BY CERTIFICATE ' + QUOTENAME(@cert) + N';' + CHAR(10)
FROM sys.crypt_properties AS cp
JOIN sys.certificates AS c ON c.thumbprint = cp.thumbprint
JOIN sys.objects AS o ON o.object_id = cp.major_id
WHERE c.name = @cert;
IF @sql <> N'' EXEC sys.sp_executesql @sql;
IF CERT_ID(@cert) IS NOT NULL
    EXEC (N'DROP CERTIFICATE ' + @cert);

-- 3. New certificate, sign every dssc procedure, then delete the private key.
SET @sql = N'CREATE CERTIFICATE ' + QUOTENAME(@cert)
         + N' ENCRYPTION BY PASSWORD = ' + QUOTENAME(@pw, '''')
         + N' WITH SUBJECT = N''DSS Connect: lets dssc procedures read LeadBase'', EXPIRY_DATE = ''20361231'';';
EXEC sys.sp_executesql @sql;

SET @sql = N'';
SELECT @sql += N'ADD SIGNATURE TO ' + QUOTENAME(SCHEMA_NAME(schema_id)) + N'.' + QUOTENAME(name)
             + N' BY CERTIFICATE ' + QUOTENAME(@cert) + N' WITH PASSWORD = ' + QUOTENAME(@pw, '''') + N';' + CHAR(10)
FROM sys.procedures
WHERE schema_id = SCHEMA_ID(N'dssc');
EXEC sys.sp_executesql @sql;

EXEC (N'ALTER CERTIFICATE ' + @cert + N' REMOVE PRIVATE KEY');

-- 4. Copy the public part to Lawbase12 and give it read access to only these tables.
DECLARE @public nvarchar(max) = CONVERT(nvarchar(max), CERTENCODED(CERT_ID(@cert)), 1);
SET @sql = N'
CREATE CERTIFICATE DSSC_LawbaseReader FROM BINARY = ' + @public + N';
CREATE USER DSSC_LawbaseReader FROM CERTIFICATE DSSC_LawbaseReader;
GRANT SELECT ON dbo.PB0 TO DSSC_LawbaseReader;
GRANT SELECT ON dbo.PB2 TO DSSC_LawbaseReader;
GRANT SELECT ON dbo.User_Profile TO DSSC_LawbaseReader;';
EXEC Lawbase12.sys.sp_executesql @sql;

PRINT 'Signed procedures:';
SELECT o.name AS signed_procedure
FROM sys.crypt_properties AS cp
JOIN sys.certificates AS c ON c.thumbprint = cp.thumbprint
JOIN sys.objects AS o ON o.object_id = cp.major_id
WHERE c.name = @cert;
GO

/* ---------------------------------------------------------------------------------
   The bridge's account: may run dssc procedures, nothing else.
   --------------------------------------------------------------------------------- */
USE master;
GO
IF SUSER_ID(N'OFFICE\svc-dssconnect') IS NULL
    CREATE LOGIN [OFFICE\svc-dssconnect] FROM WINDOWS WITH DEFAULT_DATABASE = LBIntegrations;
GO
USE LBIntegrations;
GO
IF USER_ID(N'svc-dssconnect') IS NULL
    CREATE USER [svc-dssconnect] FOR LOGIN [OFFICE\svc-dssconnect] WITH DEFAULT_SCHEMA = dssc;
GRANT EXECUTE ON SCHEMA::dssc TO [svc-dssconnect];
GO
