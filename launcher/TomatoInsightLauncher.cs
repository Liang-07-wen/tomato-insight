using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Threading;

internal static class TomatoInsightLauncher
{
    private static readonly string RootDirectory =
        AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);

    private static readonly string VenvDirectory =
        Path.Combine(RootDirectory, ".venv");

    private static readonly string VenvPython =
        Path.Combine(VenvDirectory, "Scripts", "python.exe");

    private static readonly string LogPath =
        Path.Combine(RootDirectory, "launcher.log");

    private static readonly object LogLock = new object();

    [STAThread]
    private static int Main()
    {
        Console.OutputEncoding = Encoding.UTF8;
        Console.Title = "Tomato Insight 一键启动";
        ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072;

        try
        {
            WriteLine("==============================================");
            WriteLine(" Tomato Insight Windows 一键本地运行");
            WriteLine("==============================================");
            WriteLine("项目目录：" + RootDirectory);

            EnsureProjectFiles();
            EnsureRuntimeDirectories();
            EnsureVirtualEnvironment();
            EnsureDependencies();
            StartWebsite();
            return 0;
        }
        catch (Exception exception)
        {
            WriteLine("");
            WriteLine("启动失败：" + exception.Message);
            WriteLine("详细日志：" + LogPath);
            WriteLine("");
            WriteLine("按任意键退出。");
            Console.ReadKey(true);
            return 1;
        }
    }

    private static void EnsureProjectFiles()
    {
        string[] requiredFiles =
        {
            "app.py",
            "yolo26_detector.py",
            "requirements.txt",
            Path.Combine("models", "leaf", "best.onnx"),
            Path.Combine("models", "fruit", "best.onnx")
        };

        foreach (string relativePath in requiredFiles)
        {
            string fullPath = Path.Combine(RootDirectory, relativePath);
            if (!File.Exists(fullPath))
            {
                throw new FileNotFoundException(
                    "缺少运行文件：" + relativePath +
                    "。请完整解压 GitHub Release 中的 Windows 压缩包后再启动。"
                );
            }

            if (relativePath.EndsWith(".onnx", StringComparison.OrdinalIgnoreCase))
            {
                long size = new FileInfo(fullPath).Length;
                if (size < 1024 * 1024)
                {
                    throw new InvalidDataException(
                        "模型文件不是完整 ONNX 文件：" + relativePath +
                        "。请使用 GitHub Release 的 Windows 完整包。"
                    );
                }
            }
        }
    }

    private static void EnsureRuntimeDirectories()
    {
        Directory.CreateDirectory(Path.Combine(RootDirectory, "static", "uploads"));
        Directory.CreateDirectory(Path.Combine(RootDirectory, "static", "results"));
    }

    private static void EnsureVirtualEnvironment()
    {
        if (File.Exists(VenvPython))
        {
            WriteLine("Python 虚拟环境已存在。");
            return;
        }

        WriteLine("正在创建 Python 虚拟环境……");

        bool created =
            TryCreateVenv("py.exe", "-3.11") ||
            TryCreateVenv("py.exe", "-3.10") ||
            TryCreateVenv("python.exe", "");

        if (!created)
        {
            InstallPython();
            created =
                TryCreateVenv("py.exe", "-3.11") ||
                TryCreateVenv(
                    Path.Combine(
                        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                        "Programs",
                        "Python",
                        "Python311",
                        "python.exe"
                    ),
                    ""
                );
        }

        if (!created || !File.Exists(VenvPython))
        {
            throw new InvalidOperationException(
                "Python 环境创建失败。请查看 launcher.log 后重新运行启动器。"
            );
        }

        WriteLine("Python 虚拟环境创建完成。");
    }

    private static bool TryCreateVenv(string executable, string prefixArguments)
    {
        if (Path.IsPathRooted(executable) && !File.Exists(executable))
        {
            return false;
        }

        string arguments = string.IsNullOrWhiteSpace(prefixArguments)
            ? "-m venv " + Quote(VenvDirectory)
            : prefixArguments + " -m venv " + Quote(VenvDirectory);

        try
        {
            return RunProcess(executable, arguments, true) == 0 &&
                   File.Exists(VenvPython);
        }
        catch
        {
            return false;
        }
    }

    private static void InstallPython()
    {
        const string downloadUrl =
            "https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe";

        string installerPath = Path.Combine(
            Path.GetTempPath(),
            "python-3.11.9-amd64.exe"
        );

        WriteLine("未检测到可用 Python，正在下载官方 Python 3.11……");

        using (WebClient client = new WebClient())
        {
            client.Headers.Add("User-Agent", "Tomato-Insight-Launcher");
            client.DownloadFile(downloadUrl, installerPath);
        }

        WriteLine("正在安装 Python 3.11……");
        int exitCode = RunProcess(
            installerPath,
            "/quiet InstallAllUsers=0 PrependPath=1 Include_launcher=1 " +
            "Include_test=0 Shortcuts=0",
            true
        );

        if (exitCode != 0)
        {
            throw new InvalidOperationException(
                "Python 安装程序返回错误代码：" + exitCode
            );
        }
    }

    private static void EnsureDependencies()
    {
        string requirementsPath = Path.Combine(RootDirectory, "requirements.txt");
        string markerPath = Path.Combine(VenvDirectory, ".tomato_requirements.sha256");
        string currentHash = ComputeSha256(requirementsPath);
        string installedHash = File.Exists(markerPath)
            ? File.ReadAllText(markerPath, Encoding.UTF8).Trim()
            : "";

        if (string.Equals(currentHash, installedHash, StringComparison.OrdinalIgnoreCase))
        {
            WriteLine("Python 依赖已经安装，跳过重复安装。");
            return;
        }

        WriteLine("正在更新 pip……");
        RequireSuccess(
            RunProcess(VenvPython, "-m pip install --upgrade pip", true),
            "pip 更新失败"
        );

        WriteLine("正在安装网站依赖，首次运行需要几分钟……");
        RequireSuccess(
            RunProcess(
                VenvPython,
                "-m pip install -r " + Quote(requirementsPath),
                true
            ),
            "依赖安装失败"
        );

        File.WriteAllText(markerPath, currentHash, new UTF8Encoding(false));
        WriteLine("网站依赖安装完成。");
    }

    private static void StartWebsite()
    {
        WriteLine("正在启动 Tomato Insight……");

        ProcessStartInfo startInfo = new ProcessStartInfo
        {
            FileName = VenvPython,
            Arguments = Quote(Path.Combine(RootDirectory, "app.py")),
            WorkingDirectory = RootDirectory,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = false
        };
        startInfo.EnvironmentVariables["PYTHONUNBUFFERED"] = "1";

        using (Process serverProcess = new Process())
        {
            serverProcess.StartInfo = startInfo;
            serverProcess.OutputDataReceived += delegate(object sender, DataReceivedEventArgs args)
            {
                if (!string.IsNullOrEmpty(args.Data))
                {
                    WriteLine(args.Data);
                }
            };
            serverProcess.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs args)
            {
                if (!string.IsNullOrEmpty(args.Data))
                {
                    WriteLine(args.Data);
                }
            };

            if (!serverProcess.Start())
            {
                throw new InvalidOperationException("网站进程启动失败。");
            }

            serverProcess.BeginOutputReadLine();
            serverProcess.BeginErrorReadLine();

            Thread browserThread = new Thread(WaitForWebsiteAndOpenBrowser);
            browserThread.IsBackground = true;
            browserThread.Start();

            WriteLine("网站运行期间请保留此窗口；关闭窗口即可结束本地服务。");
            serverProcess.WaitForExit();

            if (serverProcess.ExitCode != 0)
            {
                throw new InvalidOperationException(
                    "网站进程异常退出，错误代码：" + serverProcess.ExitCode
                );
            }
        }
    }

    private static void WaitForWebsiteAndOpenBrowser()
    {
        DateTime deadline = DateTime.UtcNow.AddMinutes(3);

        while (DateTime.UtcNow < deadline)
        {
            for (int port = 5000; port <= 5020; port++)
            {
                string url = "http://127.0.0.1:" + port + "/";
                if (!IsTomatoInsightReady(url))
                {
                    continue;
                }

                WriteLine("网站已启动：" + url);
                if (Environment.GetEnvironmentVariable("TOMATO_LAUNCHER_NO_BROWSER") == "1")
                {
                    WriteLine("测试模式已启用，跳过打开浏览器。");
                }
                else
                {
                    Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
                }
                return;
            }

            Thread.Sleep(1000);
        }

        WriteLine("浏览器自动打开超时，请查看上方日志中的本地访问地址。");
    }

    private static bool IsTomatoInsightReady(string url)
    {
        try
        {
            HttpWebRequest request = (HttpWebRequest)WebRequest.Create(url);
            request.Timeout = 250;
            request.ReadWriteTimeout = 250;
            request.UserAgent = "Tomato-Insight-Launcher";

            using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
            using (StreamReader reader = new StreamReader(response.GetResponseStream()))
            {
                string html = reader.ReadToEnd();
                return response.StatusCode == HttpStatusCode.OK &&
                       html.IndexOf("Tomato Insight", StringComparison.OrdinalIgnoreCase) >= 0;
            }
        }
        catch
        {
            return false;
        }
    }

    private static int RunProcess(string fileName, string arguments, bool logOutput)
    {
        ProcessStartInfo startInfo = new ProcessStartInfo
        {
            FileName = fileName,
            Arguments = arguments,
            WorkingDirectory = RootDirectory,
            UseShellExecute = false,
            RedirectStandardOutput = logOutput,
            RedirectStandardError = logOutput,
            CreateNoWindow = false
        };

        using (Process process = new Process())
        {
            process.StartInfo = startInfo;
            if (!process.Start())
            {
                return -1;
            }

            if (logOutput)
            {
                process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs args)
                {
                    if (!string.IsNullOrEmpty(args.Data))
                    {
                        WriteLine(args.Data);
                    }
                };
                process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs args)
                {
                    if (!string.IsNullOrEmpty(args.Data))
                    {
                        WriteLine(args.Data);
                    }
                };
                process.BeginOutputReadLine();
                process.BeginErrorReadLine();
            }

            process.WaitForExit();
            return process.ExitCode;
        }
    }

    private static void RequireSuccess(int exitCode, string message)
    {
        if (exitCode != 0)
        {
            throw new InvalidOperationException(message + "，错误代码：" + exitCode);
        }
    }

    private static string ComputeSha256(string path)
    {
        using (SHA256 sha256 = SHA256.Create())
        using (FileStream stream = File.OpenRead(path))
        {
            byte[] hash = sha256.ComputeHash(stream);
            StringBuilder builder = new StringBuilder(hash.Length * 2);
            foreach (byte value in hash)
            {
                builder.Append(value.ToString("x2"));
            }
            return builder.ToString();
        }
    }

    private static string Quote(string value)
    {
        return "\"" + value.Replace("\"", "\\\"") + "\"";
    }

    private static void WriteLine(string message)
    {
        string line = "[" + DateTime.Now.ToString("HH:mm:ss") + "] " + message;
        lock (LogLock)
        {
            Console.WriteLine(line);
            try
            {
                File.AppendAllText(LogPath, line + Environment.NewLine, Encoding.UTF8);
            }
            catch
            {
                // 日志写入失败不影响网站启动。
            }
        }
    }
}
