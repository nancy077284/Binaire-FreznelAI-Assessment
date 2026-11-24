import os from 'node:os'; 
import fs from 'node:fs/promises'; 
import { execFile } from 'node:child_process'; 
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile); 
function cpuSnapshot() { 
    return os.cpus().map(({ times }) => ({ ...times }));  
} 
function cpuUsage(previous, current) { 
    return current.map((cpu, index) => { 
        const before = previous[index]; 
        if (!before) return 0; 
        const idle = cpu.idle - before.idle; 
        const total = Object.keys(cpu).reduce((sum, key) => sum + cpu[key] - before[key], 0); 
        return total > 0 ? Math.round((1 - idle / total) * 100) : 0; 
    });  
} 
export class SystemMonitor { 
    constructor() { 
        this.previousCpu = cpuSnapshot(); 
        this.sampledAt = Date.now(); 
        this.previousWindowsCpu = new Map(); 
        this.windowsSampledAt = Date.now(); 
    } 
    async snapshot() { 
        const currentCpu = cpuSnapshot();  
        const elapsed = Date.now() - this.sampledAt; 
        const cpu = elapsed >= 500 ? cpuUsage(this.previousCpu, currentCpu) : [];    
        if (cpu.length) { 
            this.previousCpu = currentCpu; 
            this.sampledAt = Date.now(); 
        } 
        const [processes, disks, sensors] = await Promise.all([
        this.readProcesses(), this.readDisks(), this.readSensors(), 
        ]); 
    const totalMemory = os.totalmem();  
    const freeMemory = os.freemem(); 
    let uptime = 0; 
    try { 
        uptime = os.uptime(); 
    } catch { /* Some restricted runtimes deny uptime access. */ }    
    return { 
         hostname: os.hostname(), 
         platform: `${os.type()} ${os.release()}`,      
         uptime,       
         cpuModel: os.cpus()[0]?.model?.trim() || 'CPU information unavailable',
         cpuCores: os.cpus().length, 
         cpu,    
         load: os.loadavg(),     
         memory: { total: totalMemory, used: totalMemory - freeMemory, free: freeMemory },       
         processes, 
         disks, 
         sensors, 
         sampledAt: new Date(),  
        }; 
    } 
    async readProcesses() { 
        if (process.platform === 'win32') 
            return this.readWindowsProcesses();  
        try { 
            const { stdout } = await execFileAsync('ps', ['-axo', 'pid=,ppid=,%cpu=,%mem=,state=,etime=,comm='], { timeout: 2500, maxBuffer: 2 * 1024 * 1024 }); 
            return stdout.split('\n').filter(Boolean).map((line) => { 
            const match = line.trim().match(/^(\d+)\s+(\d+)\s+([\d.]+)\s+([\d.]+)\s+(\S+)\s+(\S+)\s+(.+)$/);
            if (!match) return null; 
            const [, pid, ppid, cpu, memory, state, elapsed, name] = match; 
            return { 
                pid: Number(pid), ppid: Number(ppid), cpu: Number(cpu), memory: Number(memory), state, elapsed, name: name.trim() 
            };      
        }).filter(Boolean); 
    } catch {  
        return []; 
    } 
} 
async readWindowsProcesses() { 
    const script = [ 
        '$parents = @{}', 
        'Get-CimInstance Win32_Process | ForEach-Object { $parents[[int]$_.ProcessId] = [int]$_.ParentProcessId }',      
        '$now = Get-Date', 
        'Get-Process | ForEach-Object {',   
        '  $cpu = 0; $started = $null', 
        '  try { $cpu = [double]$_.CPU } catch {}',
        '  try { $started = $_.StartTime.ToString("o") } catch {}',   
        '  [pscustomobject]@{ pid = $_.Id; ppid = $parents[[int]$_.Id]; cpuSeconds = $cpu; memoryBytes = $_.WorkingSet64; name = $_.ProcessName; startTime = $started }', 
        '} | ConvertTo-Json -Compress', 
    ].join('; '); 
    try { 
        const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 3500, maxBuffer: 3 * 1024 * 1024 });      
        const entries = JSON.parse(stdout); 
        const rows = Array.isArray(entries) ? entries : entries ? [entries] : []; 
        const now = Date.now();       
        const elapsed = Math.max(0.1, (now - this.windowsSampledAt) / 1000); 
        const totalMemory = os.totalmem(); 
        const processes = rows.map((entry) => { 
            const pid = Number(entry.pid); 
            const cpuSeconds = Number(entry.cpuSeconds) || 0; 
            const previous = this.previousWindowsCpu.get(pid) ?? cpuSeconds;      
            const cpu = Math.min(100, Math.max(0, (cpuSeconds - previous) / elapsed / os.cpus().length * 100));        
            const start = entry.startTime ? Date.parse(entry.startTime) : NaN;     
            return {          
                pid,  
                ppid: Number(entry.ppid) || 0,        
                cpu, 
                memory: totalMemory ? Number(entry.memoryBytes) / totalMemory * 100 : 0, 
                state: 'R',
                elapsed: Number.isFinite(start) ? formatElapsed(Date.now() - start) : '', 
                name: String(entry.name || 'Unknown'), 
            };       
        }); 
        this.previousWindowsCpu = new Map(rows.map((entry) => [Number(entry.pid), Number(entry.cpuSeconds) || 0])); 
        this.windowsSampledAt = now; 
        return processes; 
    } catch { 
        return [];
    } 
} 
async readDisks() {     
    try { 
        if (process.platform === 'win32') { 
            const script = "Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | Select-Object DeviceID,Size,FreeSpace | ConvertTo-Json -Compress"; 
            const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 2500, maxBuffer: 1024 * 1024 }); 
            const drives = JSON.parse(stdout); 
            return (Array.isArray(drives) ? drives : drives ? [drives] : []).map((drive) => {  
                const total = Number(drive.Size) || 0; 
                const free = Number(drive.FreeSpace) || 0; 
                const used = total - free;         
                return { name: drive.DeviceID, total, used, percent: total ? Math.round(used / total * 100) : 0 };       
            });  
        } 
        const { stdout } = await execFileAsync('df', ['-kP'], { timeout: 2000, maxBuffer: 1024 * 1024 });      
        return stdout.split('\n').slice(1).filter(Boolean).map((line) => {     
            const columns = line.trim().split(/\s+/);         
            const total = Number(columns[1]) * 1024;         
            const used = Number(columns[2]) * 1024;        
            return { name: columns.at(-1), total, used, percent: total ? Math.round(used / total * 100) : 0 };     
        }).filter((disk) => disk.total      
        && disk.name !== '/dev' 
        && (!disk.name.startsWith('/System/Volumes/') || disk.name === '/System/Volumes/Data')).slice(0, 4); 
    } catch {       
        return [];    
    }   
} 
async readSensors() {    
    if (process.platform === 'linux') { 
        try {
            const roots = await fs.readdir('/sys/class/thermal'); 
            const values = await Promise.all(roots.filter((name) => name.startsWith('thermal_zone')).map(async (name) => { 
                const [raw, label] = await Promise.all([ 
                    fs.readFile(`/sys/class/thermal/${name}/temp`, 'utf8'),       
                    fs.readFile(`/sys/class/thermal/${name}/type`, 'utf8').catch(() => name),    
                ]); 
                const value = Number(raw.trim());
                return Number.isFinite(value) ? { name: label.trim(), celsius: value > 1000 ? value / 1000 : value } : null; 
            })); 
            const graphics = await fs.readdir('/sys/class/drm').catch(() => []);       
            const gpuUsage = await Promise.all(graphics.filter((name) => /^card\d+$/.test(name)).map(async (name) => {  
                const raw = await fs.readFile(`/sys/class/drm/${name}/device/gpu_busy_percent`, 'utf8').catch(() => '');   
                const value = raw.trim();
                if (!value) return null;
                const usagePercent = Number(value);
                return Number.isFinite(usagePercent) ? { name: `${name.toUpperCase()} utilization`, usagePercent } : null;       
            }));        
            return [...values.filter(Boolean), ...gpuUsage.filter(Boolean)];      
        } catch {
            return [];  
        } 
    } if (process.platform === 'darwin') { 
        try {
            const { stdout } = await execFileAsync('osx-cpu-temp', [], { timeout: 1200 }); 
            const celsius = Number(stdout.match(/[\d.]+/)?.[0]); 
            return Number.isFinite(celsius) ? [{ name: 'CPU', celsius }] : []; 
        } catch { return []; 

        } 
    } 
    return [];  
} 
} function formatElapsed(milliseconds) { 
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const days = Math.floor(totalSeconds / 86400); 
    const hours = Math.floor(totalSeconds % 86400 / 3600); 
    const minutes = Math.floor(totalSeconds % 3600 / 60);  
    return days ? `${days}-${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}` : `${hours}:${String(minutes).padStart(2, '0')}`;
}