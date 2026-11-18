using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class MiraDesktopLayer {
  delegate bool Visitor(IntPtr hwnd, IntPtr data);
  [StructLayout(LayoutKind.Sequential)] struct Rect {public int left,top,right,bottom;}
  [StructLayout(LayoutKind.Sequential)] struct Point {public int x,y;}
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern IntPtr FindWindow(string cls,string title);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern IntPtr FindWindowEx(IntPtr parent,IntPtr after,string cls,string title);
  [DllImport("user32.dll")] static extern bool EnumWindows(Visitor callback,IntPtr data);
  [DllImport("user32.dll")] static extern IntPtr SendMessageTimeout(IntPtr h,uint msg,IntPtr w,IntPtr l,uint flags,uint timeout,out IntPtr reply);
  [DllImport("user32.dll",SetLastError=true)] static extern IntPtr SetParent(IntPtr child,IntPtr parent);
  [DllImport("user32.dll")] static extern IntPtr GetParent(IntPtr h);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h,out Rect rect);
  [DllImport("user32.dll")] static extern bool ScreenToClient(IntPtr h,ref Point p);
  [DllImport("user32.dll",SetLastError=true)] static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int cx,int cy,uint flags);
  [DllImport("user32.dll",EntryPoint="GetWindowLongPtrW")] static extern IntPtr GetStyle(IntPtr h,int index);
  [DllImport("user32.dll",EntryPoint="SetWindowLongPtrW")] static extern IntPtr SetStyle(IntPtr h,int index,IntPtr value);
  public static int Main(string[] args) {
    long handle;
    if(args.Length!=1 || !long.TryParse(args[0],out handle) || handle<=0)return 2;
    try { Attach(new IntPtr(handle)); return 0; }
    catch(Exception e) { Console.Error.WriteLine(e.Message); return 1; }
  }
  static void Attach(IntPtr window) {
    IntPtr prog = FindWindow("Progman",null), layer=IntPtr.Zero, result;
    if(prog==IntPtr.Zero)throw new Exception("Explorer desktop is unavailable");
    SendMessageTimeout(prog,0x052C,new IntPtr(13),new IntPtr(1),2,1000,out result);
    EnumWindows(delegate(IntPtr top,IntPtr unused){
      if(FindWindowEx(top,IntPtr.Zero,"SHELLDLL_DefView",null)!=IntPtr.Zero)
        layer=FindWindowEx(IntPtr.Zero,top,"WorkerW",null);
      return layer==IntPtr.Zero;
    },IntPtr.Zero);
    if(layer==IntPtr.Zero)layer=FindWindowEx(prog,IntPtr.Zero,"WorkerW",null);
    if(layer==IntPtr.Zero)throw new Exception("Explorer wallpaper layer is unavailable");
    Rect rect; if(!GetWindowRect(window,out rect))throw new Win32Exception();
    Point p=new Point();p.x=rect.left;p.y=rect.top;
    if(!ScreenToClient(layer,ref p))throw new Win32Exception();
    long style=GetStyle(window,-16).ToInt64();
    SetStyle(window,-16,new IntPtr((style & ~0x80000000L) | 0x40000000L));
    SetParent(window,layer);
    if(GetParent(window)!=layer)throw new Win32Exception();
    if(!SetWindowPos(window,IntPtr.Zero,p.x,p.y,0,0,0x0031))throw new Win32Exception();
  }
}
