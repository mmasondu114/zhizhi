using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

internal static class Launcher {
    const string Id = "io.github.mmasondu114.zhizhi";
    const string Url = "http://127.0.0.1:4317";
    static Process child;
    static IntPtr job;
    static StreamWriter log;
    static readonly object LogLock = new object();
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] static extern IntPtr CreateJobObject(IntPtr a, string n);
    [DllImport("kernel32.dll")] static extern bool SetInformationJobObject(IntPtr h, int c, IntPtr p, uint n);
    [DllImport("kernel32.dll")] static extern bool AssignProcessToJobObject(IntPtr h, IntPtr p);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
    [StructLayout(LayoutKind.Sequential)] struct Basic { public long PerProcess, PerJob; public uint Flags; public UIntPtr Min, Max; public uint Active; public UIntPtr Affinity; public uint Priority, Scheduling; }
    [StructLayout(LayoutKind.Sequential)] struct IO { public ulong A,B,C,D,E,F; }
    [StructLayout(LayoutKind.Sequential)] struct Limits { public Basic Basic; public IO IO; public UIntPtr ProcessMemory, JobMemory, PeakProcess, PeakJob; }
    static void AttachJob(Process p) {
        job=CreateJobObject(IntPtr.Zero,null); var limits=new Limits(); limits.Basic.Flags=0x2000;
        int size=Marshal.SizeOf(limits); var ptr=Marshal.AllocHGlobal(size);
        try { Marshal.StructureToPtr(limits,ptr,false); if(job==IntPtr.Zero || !SetInformationJobObject(job,9,ptr,(uint)size) || !AssignProcessToJobObject(job,p.Handle)) throw new Exception("无法创建本地服务进程组"); }
        finally { Marshal.FreeHGlobal(ptr); }
    }
    static string Version { get { return FileVersionInfo.GetVersionInfo(Application.ExecutablePath).ProductVersion; } }
    static string Health() {
        try { var request=(HttpWebRequest)WebRequest.Create(Url+"/api/health"); request.Timeout=800; request.Proxy=null;
            using(var response=request.GetResponse()) using(var reader=new StreamReader(response.GetResponseStream())) {
                var value=new JavaScriptSerializer().Deserialize<System.Collections.Generic.Dictionary<string,object>>(reader.ReadToEnd());
                return value["appId"].ToString()==Id ? value["version"].ToString() : "other";
            }
        } catch { return null; }
    }
    static void OpenTree() { Process.Start(new ProcessStartInfo(Url){UseShellExecute=true}); }
    static void Start() {
        var existing=Health(); if(existing!=null) { if(existing==Version)return; throw new Exception("端口 4317 已被其他版本占用，请先退出旧版知枝。"); }
        var root=AppDomain.CurrentDomain.BaseDirectory; var data=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Zhizhi","data"); Directory.CreateDirectory(data);
        log=new StreamWriter(Path.Combine(data,"server.log"),true){AutoFlush=true};
        var start=new ProcessStartInfo(Path.Combine(root,"runtime","node.exe"),"\""+Path.Combine(root,"app","server","index.js")+"\"") {UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=Path.Combine(root,"app"),RedirectStandardOutput=true,RedirectStandardError=true};
        start.EnvironmentVariables["TREE_DATA_DIR"]=data; start.EnvironmentVariables["PORT"]="4317";
        child=new Process {StartInfo=start};
        DataReceivedEventHandler write=(s,e)=>{ if(e.Data!=null)lock(LogLock){if(log!=null)log.WriteLine(e.Data);} };
        child.OutputDataReceived+=write; child.ErrorDataReceived+=write; child.Start(); AttachJob(child); child.BeginOutputReadLine(); child.BeginErrorReadLine();
        for(int i=0;i<60;i++){ if(Health()==Version)return; if(child.HasExited)break; Thread.Sleep(200); }
        throw new Exception("本地服务未能启动。请检查端口 4317，或查看 %LOCALAPPDATA%\\Zhizhi\\data\\server.log。");
    }
    static void Stop(){ if(job!=IntPtr.Zero){CloseHandle(job);job=IntPtr.Zero;} if(child!=null){try{if(!child.HasExited){child.Kill();child.WaitForExit(3000);}}catch{}child.Dispose();child=null;}lock(LogLock){if(log!=null){log.Dispose();log=null;}} }
    [STAThread] static int Main(string[] args) {
        bool smoke=Array.IndexOf(args,"--smoke-test")>=0; bool created;
        using(var mutex=new Mutex(true,"Local\\Zhizhi.Launcher",out created)) {
            if(!created){if(!smoke)OpenTree();return smoke?2:0;}
            try {
                Application.EnableVisualStyles(); Start(); if(smoke)return 0;
                using(var tray=new NotifyIcon()) {
                    tray.Icon=Icon.ExtractAssociatedIcon(Application.ExecutablePath)??SystemIcons.Application; tray.Text="知枝 · 知识树";
                    var menu=new ContextMenuStrip(); menu.Items.Add("打开知识树",null,(s,e)=>OpenTree());
                    menu.Items.Add("查看新版本",null,(s,e)=>Process.Start(new ProcessStartInfo("https://github.com/mmasondu114/zhizhi/releases"){UseShellExecute=true}));
                    menu.Items.Add("退出知枝",null,(s,e)=>Application.Exit()); tray.ContextMenuStrip=menu; tray.DoubleClick+=(s,e)=>OpenTree(); tray.Visible=true;
                    OpenTree(); Application.Run(); tray.Visible=false;
                } return 0;
            } catch(Exception e){if(!smoke)MessageBox.Show(e.Message,"知枝暂时无法启动",MessageBoxButtons.OK,MessageBoxIcon.Error);return 1;}
            finally {Stop();mutex.ReleaseMutex();}
        }
    }
}
