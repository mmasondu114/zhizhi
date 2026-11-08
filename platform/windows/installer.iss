#ifndef AppVersion
  #error AppVersion is required
#endif
[Setup]
AppId=io.github.mmasondu114.zhizhi
AppName=知枝
AppVersion={#AppVersion}
AppPublisher=Zhizhi
AppPublisherURL=https://github.com/mmasondu114/zhizhi
DefaultDirName={localappdata}\Programs\Zhizhi
DefaultGroupName=知枝
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputDir={#OutputPath}
OutputBaseFilename=Zhizhi-{#AppVersion}-windows-x64-setup
SetupIconFile={#StagePath}\Zhizhi.ico
UninstallDisplayIcon={app}\Zhizhi.ico
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no
AppMutex=Zhizhi.Launcher
DisableProgramGroupPage=yes
[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
[Files]
Source: "{#StagePath}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; Flags: unchecked
[Icons]
Name: "{group}\知枝"; Filename: "{app}\Zhizhi.exe"; IconFilename: "{app}\Zhizhi.ico"
Name: "{autodesktop}\知枝"; Filename: "{app}\Zhizhi.exe"; IconFilename: "{app}\Zhizhi.ico"; Tasks: desktopicon
[Run]
Filename: "{app}\Zhizhi.exe"; Description: "Open Zhizhi"; Flags: nowait postinstall skipifsilent

