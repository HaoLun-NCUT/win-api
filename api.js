const ffi = require('ffi-napi');
const ref = require('ref-napi');
const { exec } = require('child_process');

// 加載 kernel32.dll 並定義需要使用的函數
const kernel32 = ffi.Library('kernel32', {
  'GetSystemTimes': ['bool', ['void*', 'void*', 'void*']],
  'GlobalMemoryStatusEx': ['bool', ['void*']]
});

// 分配內存以存儲系統時間信息
const idleTime1 = Buffer.alloc(8);
const kernelTime1 = Buffer.alloc(8);
const userTime1 = Buffer.alloc(8);

const idleTime2 = Buffer.alloc(8);
const kernelTime2 = Buffer.alloc(8);
const userTime2 = Buffer.alloc(8);

// MEMORYSTATUSEX 結構體大小和內存緩衝區
const MEMORYSTATUSEX_SIZE = 64;
const memoryStatus = Buffer.alloc(MEMORYSTATUSEX_SIZE);
memoryStatus.writeUInt32LE(MEMORYSTATUSEX_SIZE, 0);

// 全局變量存儲CPU快取信息
let cpuCacheInfo = {
  L1: '未知',
  L2: '未知',
  L3: '未知',
  Cores: '未知',
  LogicalProcessors: '未知'
};

// 全局變量存儲CPU暫存器信息
let cpuRegisterInfo = {
  Registers: '未知',
  Cores: '未知',
  LogicalProcessors: '未知'
};

// 生成使用率圖形的函數
function generateUsageBar(percentage, maxBars = 50) {
  const bars = Math.round(percentage * maxBars / 100);
  return '■'.repeat(bars) + '□'.repeat(maxBars - bars);
}

// 初始化 CPU 快取信息 - 只在啟動時執行一次
function initCpuCacheInfo() {
  exec('powershell -command "Get-CimInstance -ClassName Win32_Processor | Select-Object L1CacheSize, L2CacheSize, L3CacheSize, NumberOfCores, NumberOfLogicalProcessors | Format-List"', (error, stdout) => {
    if (error) {
      console.error(`執行錯誤: ${error}`);
      return;
    }
    
    const output = stdout.trim();
    
    // 解析 PowerShell 輸出
    const l1Match = output.match(/L1CacheSize\s*:\s*(\d+)/i);
    const l2Match = output.match(/L2CacheSize\s*:\s*(\d+)/i);
    const l3Match = output.match(/L3CacheSize\s*:\s*(\d+)/i);
    const coresMatch = output.match(/NumberOfCores\s*:\s*(\d+)/i);
    const logicalMatch = output.match(/NumberOfLogicalProcessors\s*:\s*(\d+)/i);
    
    if (l1Match) cpuCacheInfo.L1 = parseInt(l1Match[1]);
    if (l2Match) cpuCacheInfo.L2 = parseInt(l2Match[1]);
    if (l3Match) cpuCacheInfo.L3 = parseInt(l3Match[1]);
    if (coresMatch) cpuCacheInfo.Cores = parseInt(coresMatch[1]);
    if (logicalMatch) cpuCacheInfo.LogicalProcessors = parseInt(logicalMatch[1]);
    
    // 如果 L1 還是空的，嘗試其他命令
    if (!l1Match) {
      exec('wmic cpu get L1CacheSize', (error, stdout) => {
        if (!error) {
          const l1Lines = stdout.trim().split('\n');
          if (l1Lines.length >= 2) {
            cpuCacheInfo.L1 = parseInt(l1Lines[1].trim()) || '未知';
          }
        }
      });
    }
  });
}

// 初始化 CPU 暫存器信息 - 只在啟動時執行一次
function initCpuRegisterInfo() {
  exec('powershell -command "Get-CimInstance -ClassName Win32_Processor | Select-Object NumberOfCores, NumberOfLogicalProcessors | Format-List"', (error, stdout) => {
    if (error) {
      console.error(`執行錯誤: ${error}`);
      return;
    }
    
    const output = stdout.trim();
    
    // 解析 PowerShell 輸出
    const coresMatch = output.match(/NumberOfCores\s*:\s*(\d+)/i);
    const logicalMatch = output.match(/NumberOfLogicalProcessors\s*:\s*(\d+)/i);
    
    if (coresMatch) cpuRegisterInfo.Cores = parseInt(coresMatch[1]);
    if (logicalMatch) cpuRegisterInfo.LogicalProcessors = parseInt(logicalMatch[1]);
    
    // 暫存器信息可以通過其他方式獲取，這裡假設為固定值
    cpuRegisterInfo.Registers = '32 個通用暫存器';
  });
}

// 在相关导入部分下方添加这个函数
function getContextSwitchRate(callback) {
  exec('powershell -command "Get-Counter -Counter \\"\\System\\Context Switches/sec\\" -SampleInterval 1 -MaxSamples 1 | Select-Object -ExpandProperty CounterSamples | Select-Object CookedValue"', (error, stdout) => {
    if (error) {
      console.error(`執行錯誤: ${error}`);
      callback(null);
      return;
    }
    
    const match = stdout.match(/CookedValue\s*:\s*([\d\.]+)/i);
    if (match) {
      callback(parseFloat(match[1]));
    } else {
      callback(null);
    }
  });
}

// 獲取正在運行的應用程式清單
function getRunningApplications(callback) {
  exec('powershell -command "Get-Process | Select-Object -Property Name, Id, CPU | Sort-Object -Property CPU -Descending | Format-Table -AutoSize"', (error, stdout) => {
    if (error) {
      console.error(`執行錯誤: ${error}`);
      callback(null);
      return;
    }
    
    const systemProcesses = ['System', 'Registry', 'smss', 'csrss', 'wininit', 'services', 'lsass', 'svchost', 'winlogon', 'explorer', 'spoolsv', 'taskhostw', 'dwm', 'fontdrvhost', 'sihost', 'ctfmon'];
    const filteredOutput = stdout.split('\n').filter(line => {
      const processName = line.trim().split(/\s+/)[0];
      return !systemProcesses.includes(processName);
    }).join('\n');
    
    callback(filteredOutput.trim());
  });
}

// 獲取和顯示 CPU 使用率
function getCpuUsage() {
  // 獲取第一個時間點的系統時間
  let resultSystemTimes = kernel32.GetSystemTimes(idleTime1, kernelTime1, userTime1);
  if (!resultSystemTimes) {
    console.error(`無法獲取系統時間。錯誤: ${kernel32.GetLastError()}`);
    return;
  }

  // 記錄第一個時間點的值
  const idleValue1 = idleTime1.readBigUInt64LE(0);
  const kernelValue1 = kernelTime1.readBigUInt64LE(0);
  const userValue1 = userTime1.readBigUInt64LE(0);
  
  // 等待一段時間（例如 1000 毫秒）
  setTimeout(() => {
    // 獲取第二個時間點的系統時間
    resultSystemTimes = kernel32.GetSystemTimes(idleTime2, kernelTime2, userTime2);
    if (!resultSystemTimes) {
      console.error(`無法獲取系統時間。錯誤: ${kernel32.GetLastError()}`);
      return;
    }

    // 記錄第二個時間點的值
    const idleValue2 = idleTime2.readBigUInt64LE(0);
    const kernelValue2 = kernelTime2.readBigUInt64LE(0);
    const userValue2 = userTime2.readBigUInt64LE(0);
    
    // 計算兩個時間點之間的差值
    const idleDiff = idleValue2 - idleValue1;
    const kernelDiff = kernelValue2 - kernelValue1;
    const userDiff = userValue2 - userValue1;

    // 正確計算 CPU 使用率
    const totalWorkTime = (kernelDiff - idleDiff) + userDiff;
    const totalTime = kernelDiff + userDiff;
    
    // 避免除以零的情況
    const cpuUsage = totalTime > 0 ? (totalWorkTime * 100n) / totalTime : 0n;
    const cpuUsageNum = Number(cpuUsage);

    // 計算內核使用率和使用者使用率的比例
    const kernelUsage = totalTime > 0 ? ((kernelDiff - idleDiff) * 100n) / totalTime : 0n;
    const kernelUsageNum = Number(kernelUsage);
    const userUsage = totalTime > 0 ? (userDiff * 100n) / totalTime : 0n;
    const userUsageNum = Number(userUsage);

    // 儲存所有打印的資訊
    let output = '';

    // 顯示 CPU 使用率圖形和數值
    output += `===== 系統監視器 =====\n`;
    output += `[CPU 使用率]\n`;
    output += `總體使用率: [${generateUsageBar(cpuUsageNum)}] ${cpuUsageNum.toFixed(1)}%\n`;
    output += `內核使用率: [${generateUsageBar(kernelUsageNum)}] ${kernelUsageNum.toFixed(1)}%\n`;
    output += `使用者部分: [${generateUsageBar(userUsageNum)}] ${userUsageNum.toFixed(1)}%\n`;
    
    // 顯示 CPU 快取與暫存器信息
    output += `\n[CPU 快取與暫存器信息]\n`;
    output += `L1 快取大小: ${cpuCacheInfo.L1 ? `${cpuCacheInfo.L1} KB` : '未知'}\n`;
    output += `L2 快取大小: ${cpuCacheInfo.L2 ? `${cpuCacheInfo.L2} KB` : '未知'}\n`;
    output += `L3 快取大小: ${cpuCacheInfo.L3 ? `${cpuCacheInfo.L3} KB` : '未知'}\n`;
    output += `暫存器數量: ${cpuRegisterInfo.Registers}\n`;
    output += `實體核心數: ${cpuCacheInfo.Cores || cpuRegisterInfo.Cores || '未知'}\n`;
    output += `邏輯處理器數: ${cpuCacheInfo.LogicalProcessors || cpuRegisterInfo.LogicalProcessors || '未知'}\n`;
    
    // 在显示 CPU 部分添加
    let contextSwitchRate = null;
    getContextSwitchRate((rate) => {
      contextSwitchRate = rate;
      
      if (contextSwitchRate !== null) {
        output += `上下文切換率: ${contextSwitchRate.toFixed(1)} 次/秒\n`;
      } else {
        output += `上下文切換率:無法獲取\n`;
      }

      // 顯示正在運行的應用程式清單
      getRunningApplications((applications) => {
        output += `\n[正在運行的應用程式]\n`;
        if (applications) {
          output += `${applications}\n`;
        } else {
          output += `無法獲取正在運行的應用程式清單\n`;
        }

        output += `\n============================\n`;

        // 清除控制台並同步打印所有資訊
        console.clear();
        console.log(output);
      });
    });
  }, 1000);
}

// 初始化 CPU 快取信息（只執行一次）
initCpuCacheInfo();

// 初始化 CPU 暫存器信息（只執行一次）
initCpuRegisterInfo();

// 設置一個定時器，每隔一段時間調用一次 getCpuUsage 函數
setInterval(getCpuUsage, 2000);