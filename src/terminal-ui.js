const ESC = '\u001b[';
    const ANSI_PATTERN = /\u001b\[[0-9;]*m/g; 
    const ansi = { 
        reset: `${ESC}0m`, bold: `${ESC}1m`, dim: `${ESC}2m`, cyan: `${ESC}38;5;80m`, 
        green: `${ESC}38;5;114m`, yellow: `${ESC}38;5;221m`, red: `${ESC}38;5;203m`, 
        muted: `${ESC}38;5;245m`, white: `${ESC}38;5;252m`, blue: `${ESC}38;5;75m`,  
    }; 
    function fit(value, width) { 
        const text = String(value ?? '').replace(/[\r\n\t]/g, ' '); 
        const visibleLength = text.replace(ANSI_PATTERN, '').length;
        if (visibleLength <= width) return `${text}${' '.repeat(width - visibleLength)}`; 
        let visible = 0; 
        let result = ''; 
        for (const token of text.match(/\u001b\[[0-9;]*m|./gu) || []) {  
            if (token.startsWith(ESC)) result += token; 
            else if (visible < width - 1) { result += token; visible += 1; } 
            else break; 
        } 
        return `${result}…${ansi.reset}`; 
    }
    function bar(value, width = 18) {
        const fill = Math.max(0, Math.min(width, Math.round(value / 100 * width)));
        const tint = value >= 85 ? ansi.red : value >= 60 ? ansi.yellow : ansi.green;  
        return `${tint}${' '.repeat(fill)}${ansi.muted}${' '.repeat(width - fill)}${ansi.reset}`; 
    }
    function box(title, rows, width) { 
        const inner = width - 2; 
        const top = ` ${title} ${' '.repeat(Math.max(0, inner - title.length - 3))} `; 
        return [top, ...rows.slice(0, 100).map((row) => ` ${fit(row, inner)} `), ` ${' '.repeat(inner)} `]; 
    } 
    function formatBytes(value) { 
        const units = ['B', 'KB', 'MB', 'GB', 'TB']; 
        let size = value;
        let unit = 0;
        while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1; } 
        return `${size.toFixed(unit ? 1 : 0)} ${units[unit]}`; 
    } 
    function formatDuration(seconds) { 
        const days = Math.floor(seconds / 86400); 
        const hours = Math.floor(seconds % 86400 / 3600); 
        const minutes = Math.floor(seconds % 3600 / 60); 
        return days ? `${days}d ${hours}h ${minutes}m` : `${hours}h ${minutes}m`; 
    }
    function center(text, width) { 
        const left = Math.max(0, Math.floor((width - text.replace(ANSI_PATTERN, '').length) / 2));
        return `${' '.repeat(left)}${text}`;
    }
        export class TerminalUI { 
            constructor(input, output) { 
                this.input = input; 
                this.output = output;    
                this.onKey = null;    
                this.onResize = null; 
                this.keyListener = (_str, key) => this.onKey?.(key);   
                this.resizeListener = () => this.onResize?.(); 
            } 
            start() { 
                this.output.write(`${ESC}?1049h${ESC}?25l${ESC}2J${ESC}H`); 
                this.input.setRawMode?.(true); 
                this.input.resume(); 
                this.input.on('keypress', this.keyListener); 
                this.output.on('resize', this.resizeListener); 
            } 
            stop() { 
                this.input.off('keypress', this.keyListener); 
                this.output.off('resize', this.resizeListener); 
                if (this.input.isTTY) this.input.setRawMode(false);  
                this.output.write(`${ESC}?25h${ESC}?1049l`);  
            }
            draw(lines) {
                const height = this.output.rows || 24;
                const visible = lines.slice(0, Math.max(1, height - 1)); 
                this.output.write(`${ESC}H${ESC}2J${visible.join('\n')}${ESC}J`);  
            } 
            drawAuth(state) { 
                const width = Math.min(this.output.columns || 80, 92);  
                const title = state.mode === 'signup' ? 'Create your account' : 'Welcome back';   
                const rows = [ 
                    '',  
                    `${ansi.bold}${ansi.cyan}SYSTEM TASKS VIEWER${ansi.reset}`, 
                    `${ansi.muted}A focused view of what your machine is doing.${ansi.reset}`,       
                    '',  
                    `${state.mode === 'signup' ? 'SIGN UP' : 'SIGN IN'}  ${ansi.muted}·  Firebase Authentication${ansi.reset}`, 
                    '',      
                    ...(state.mode === 'signup' ? [`${state.focus === 0 ? ansi.cyan + '›' : ' '} Name     ${fit(state.name || 'Enter your name', 34)}`] : []),    
                    `${state.focus === (state.mode === 'signup' ? 1 : 0) ? ansi.cyan + '›' : ' '} Email    ${fit(state.email || 'you@example.com', 34)}`, 
                    `${state.focus === (state.mode === 'signup' ? 2 : 1) ? ansi.cyan + '›' : ' '} Password ${fit(state.password ? '•'.repeat(state.password.length) : 'At least 6 characters', 34)}`,'',       
                    `${ansi.yellow}${state.notice || ''}${ansi.reset}`, 
                    '', 
                    `${ansi.green}[Enter] ${title}${ansi.reset}   ${ansi.muted}[Tab] move  [F2] ${state.mode === 'signup' ? 'sign in' : 'create account'}  [Ctrl+C] quit${ansi.reset}`, 
                    '', 
                    `${ansi.dim}Configuration: .env → FIREBASE_API_KEY + FIREBASE_PROJECT_ID${ansi.reset}`,     
                ]; 
                const panel = box('AUTHENTICATION', rows, Math.max(44, width - 8));  
                const content = [center(`${ansi.bold}${ansi.cyan}SYSTEM TASKS VIEWER${ansi.reset}`, width), '', ...panel.map((line) => centerLine(width, line)), '']; 
                if (this.output.rows < 20) content.splice(1, 0, `${ansi.yellow}Expand the terminal for the sign-in form.${ansi.reset}`);  
                this.draw(content); 
            } 
            drawDashboard(data, state) { 
                const width = Math.max(50, this.output.columns || 80); 
                const compact = width < 104; 
                const singleColumn = width < 72;  
                const usable = Math.max(46, width - 2); 
                const now = data.sampledAt.toLocaleTimeString('en-GB', { hour12: false });    
                const cpuPct = data.cpu.length ? data.cpu.reduce((a, b) => a + b, 0) / data.cpu.length : 0; 
                const memPct = data.memory.total ? data.memory.used / data.memory.total * 100 : 0; 
                const header = ` ${ansi.bold}${ansi.cyan}SYS / TASKS${ansi.reset}  ${ansi.muted}${fit(data.hostname, 22).trim()}  ${fit(data.platform, 26).trim()}${ansi.reset}  ${ansi.green}         LIVE${ansi.reset}  ${now}`; 
                const cpuRows = [ 
                    `${ansi.muted}Processor${ansi.reset} ${fit(data.cpuModel, compact ? 32 : 64).trim()}`, 
                    `${ansi.muted}Load avg${ansi.reset}  ${data.load.map((n) => n.toFixed(2)).join('  ')}  ${ansi.muted}· ${data.cpuCores} logical cores${ansi.reset}`,   
                    `${bar(cpuPct)}  ${ansi.bold}${cpuPct.toFixed(0)}%${ansi.reset}`,
                    ...data.cpu.slice(0, compact ? 2 : 8).map((value, index) => `${ansi.muted}CPU ${String(index + 1).padStart(2, '0')}${ansi.reset}  ${bar(value, compact ? 12 : 21)}          ${String(value).padStart(3)}%`), 
                ]; 
                const sensorRows = data.sensors.length    
                ? data.sensors.slice(0, 4).map((sensor) => `${ansi.green} ${ansi.reset} ${fit(sensor.name, 19).trim()}  ${sensor.celsius !== undefined ? `${sensor.celsius.toFixed(1)} °C` :         `${sensor.usagePercent}%`}`)   
                : [`${ansi.yellow} ${ansi.reset} No sensor feed detected`, 
                `${ansi.muted}See README for host setup.${ansi.reset}`]; 
                const memoryRows = [  
                    `${ansi.muted}In use${ansi.reset}  ${formatBytes(data.memory.used)} / ${formatBytes(data.memory.total)}`, 
                    `${bar(memPct, compact ? 15 : 23)}  ${memPct.toFixed(0)}%`, 
                    `${ansi.muted}Free${ansi.reset}   ${formatBytes(data.memory.free)}`,    
                    `${ansi.muted}Uptime${ansi.reset} ${formatDuration(data.uptime)}`, 
                ]; 
                const disksRows = data.disks.length 
                ? data.disks.slice(0, 4).map((disk) => `${fit(disk.name, 17).trim()} ${bar(disk.percent, compact ? 11 : 16)} ${disk.percent}%`) 
                : [`${ansi.muted}Disk usage is unavailable.${ansi.reset}`];  
                const processWidth = usable; 
                const nameWidth = Math.max(12, processWidth - (compact ? 35 : 57)); 
                const columns = compact 
                ? `${fit('PID', 7)} ${fit('CPU', 6)} ${fit('MEM', 6)} ${fit('S', 2)} ${fit('COMMAND', nameWidth)}`  
                : `${fit('PID', 8)} ${fit('PPID', 8)} ${fit('CPU%', 7)} ${fit('MEM%', 7)} ${fit('S', 2)} ${fit('TIME', 10)} ${fit('COMMAND', nameWidth)}`; 
                const taskRows = [ 
                    `${ansi.dim}${columns}${ansi.reset}`, 
                    ...state.visibleProcesses.map((proc, index) => { 
                        const selected = index === state.selectedProcess;
                        const parts = compact 
                        ? `${fit(proc.pid, 7)} ${fit(proc.cpu.toFixed(1), 6)} ${fit(proc.memory.toFixed(1), 6)} ${fit(proc.state, 2)} ${fit(proc.name, nameWidth)}` 
                        : `${fit(proc.pid, 8)} ${fit(proc.ppid, 8)} ${fit(proc.cpu.toFixed(1), 7)} ${fit(proc.memory.toFixed(1), 7)} ${fit(proc.state, 2)} ${fit(proc.elapsed, 10)} ${fit(proc.name,         nameWidth)}`;
                        return selected ? `${ESC}48;5;236m${ansi.white}${parts}${ansi.reset}` : `${ansi.white}${parts}${ansi.reset}`; 
                    }),  
                ];    
                const taskTitle = `PROCESSES  ${ansi.muted}${state.visibleProcesses.length} shown · sorted by ${state.sort}${state.filter ? ` · filter: ${state.filter}` : ''}${ansi.reset}`; 
                const topBoxes = singleColumn  
                ? [box('SYSTEM SUMMARY', [ 
                    `CPU ${cpuPct.toFixed(0)}%  ${bar(cpuPct, 8)}`,  
                    `Memory ${formatBytes(data.memory.used)} / ${formatBytes(data.memory.total)}  ${memPct.toFixed(0)}%`, 
                    `Sensor ${data.sensors[0] ? `${data.sensors[0].name} ${data.sensors[0].celsius !== undefined ? `${data.sensors[0].celsius.toFixed(1)} °C` : `${data.sensors[0].usagePercent}%`}` :         'unavailable'}`,  
                    `Disk ${data.disks[0] ? `${data.disks[0].name} ${data.disks[0].percent}%` : 'unavailable'}`, 
                ], usable)]
                : [sideBySide(box(`CPU · ${cpuPct.toFixed(0)}%`, cpuRows, Math.floor((usable - 1) * .58)), box('MEMORY', memoryRows, Math.floor((usable - 1) * .42))), sideBySide(box('SENSORS', sensorRows, Math.floor((usable - 1) * .58)), box('DISKS', disksRows, Math.floor((usable - 1) * .42)))]; 
                const lines = [header, '']; 
                for (const group of topBoxes) lines.push(...group); 
                lines.push('', ` ${ansi.bold}${taskTitle}${ansi.reset}`, 
                ...box('TASK LIST', taskRows, usable)); 
                lines.push(` ${ansi.muted}↑/↓ select  Tab sort  / filter  R refresh  Q quit  ·  ${state.user?.displayName || state.user?.email || 'signed in'}${ansi.reset}`);  
                this.draw(lines);   
            }  
        } 
        function centerLine(width, value) { 
            return `${' '.repeat(Math.max(0, Math.floor((width - value.replace(ANSI_PATTERN, '').length) / 2)))}${value}`;  
        } 
        function sideBySide(left, right) {  
            const rows = Math.max(left.length, right.length);   
            const leftWidth = (left[0] || '').replace(ANSI_PATTERN, '').length;   
            return Array.from({ length: rows }, (_, index) => {     
                const leftRow = left[index] || '';   
                const gap = index < left.length ? ' ' : '';    
                return `${leftRow}${' '.repeat(Math.max(0, leftWidth - leftRow.replace(ANSI_PATTERN, '').length))}${gap}${right[index] || ''}`; 
            }); 
        }