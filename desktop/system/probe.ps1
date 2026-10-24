# Battery Buddy helper for Windows. Prints one JSON line every 15 seconds with
# things the browser battery API can't tell us: whether a battery exists, battery
# health and cycle count, CPU temperature, and whether a full-screen app or a
# presentation is running. Read-only; it changes nothing on the system.
$ErrorActionPreference = 'SilentlyContinue'

Add-Type -Namespace BatteryBuddy -Name Native -MemberDefinition @'
[DllImport("shell32.dll")]
public static extern int SHQueryUserNotificationState(out int state);
'@

$health = @{}
$healthAt = [datetime]::MinValue

while ($true) {
    $batteries = @(Get-CimInstance -ClassName Win32_Battery)

    # Health changes slowly; ask every 10 minutes.
    if (((Get-Date) - $healthAt).TotalMinutes -ge 10) {
        $health = @{
            design = (@(Get-CimInstance -Namespace root/wmi -ClassName BatteryStaticData) | Measure-Object -Property DesignedCapacity -Sum).Sum
            full   = (@(Get-CimInstance -Namespace root/wmi -ClassName BatteryFullChargedCapacity) | Measure-Object -Property FullChargedCapacity -Sum).Sum
            cycles = (@(Get-CimInstance -Namespace root/wmi -ClassName BatteryCycleCount) | Measure-Object -Property CycleCount -Maximum).Maximum
        }
        $healthAt = Get-Date
    }

    # Usually needs admin rights; null otherwise.
    $temp = (@(Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature) | Measure-Object -Property CurrentTemperature -Maximum).Maximum

    # 2 = busy/full-screen app, 3 = full-screen game, 4 = presentation mode.
    $state = 0
    [void][BatteryBuddy.Native]::SHQueryUserNotificationState([ref]$state)

    [pscustomobject]@{
        batteries = $batteries.Count
        notify    = $state
        design    = $health.design
        full      = $health.full
        cycles    = $health.cycles
        temp      = $temp
        run       = ($batteries | Measure-Object -Property EstimatedRunTime -Minimum).Minimum
    } | ConvertTo-Json -Compress
    [Console]::Out.Flush()
    Start-Sleep -Seconds 15
}
