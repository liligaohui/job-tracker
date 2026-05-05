Attribute VB_Name = "AutoRefresh"
Option Explicit

Public NextRefreshTime As Date

Public Sub StartAutoRefresh()
    RefreshAndSchedule
End Sub

Public Sub RefreshAndSchedule()
    On Error Resume Next
    ThisWorkbook.RefreshAll
    On Error GoTo 0

    NextRefreshTime = Now + TimeValue("00:01:00")
    Application.OnTime EarliestTime:=NextRefreshTime, Procedure:="RefreshAndSchedule", Schedule:=True
End Sub

Public Sub StopAutoRefresh()
    On Error Resume Next
    Application.OnTime EarliestTime:=NextRefreshTime, Procedure:="RefreshAndSchedule", Schedule:=False
    On Error GoTo 0
End Sub
