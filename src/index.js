import fs from 'node:fs'; 
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
import { FirebaseAuth } from './firebase-auth.js'; 
import { SystemMonitor } from './system-monitor.js'; 
import { TerminalUI } from './terminal-ui.js'; 
const directory = path.dirname(fileURLToPath(import.meta.url)); 
loadEnv(path.resolve(directory, '../.env')); 
function loadEnv(filePath) { 
    if (!fs.existsSync(filePath)) return; 
    for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) { 
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); 
        if (match && !process.env[match[1]]) 
            process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, ''); 
        } 
    } 
class SystemTasksApp {   
    constructor() {     
        this.auth = new FirebaseAuth({ apiKey: process.env.FIREBASE_API_KEY, projectId: process.env.FIREBASE_PROJECT_ID }); 
        this.monitor = new SystemMonitor();
        this.ui = new TerminalUI(process.stdin, process.stdout); 
        this.mode = 'auth'; 
        this.authForm = { 
            mode: 'signup', 
            name: '', email: '', 
            password: '', 
            focus: 0, 
            notice: '' 
        }; 
            
        this.user = null; 28    
        this.snapshot = null; 
        this.sort = 'CPU'; 
        this.filter = ''; 
        this.selectedProcess = 0;     
        this.refreshing = false; 
        this.timer = null; 
        this.ui.onKey = (key) => this.handleKey(key); 
        this.ui.onResize = () => this.render();   
    } 
    async start() {     
        readline.emitKeypressEvents(process.stdin); 
        this.ui.start();     
        process.on('SIGINT', () => this.stop()); 
        process.on('uncaughtException', (error) => this.fail(error));
        this.render(); 
        this.timer = setInterval(() => this.refresh(), 1200); 
        await this.refresh(); 
    } 
    stop() { 
        clearInterval(this.timer);  
        this.ui.stop(); 
        process.exit(0); 
    } 
    fail(error) { 
        clearInterval(this.timer); 
        this.ui.stop();  
        process.stderr.write(`System Tasks Viewer stopped: ${error.message}\n`);   
        process.exitCode = 1; } 
        async refresh() { 
            if (this.refreshing) return; 
            this.refreshing = true;  
            try { 
                this.snapshot = await this.monitor.snapshot(); 
                if (this.mode === 'dashboard') this.render();
            } 
            finally { 
                this.refreshing = false; 
            }  
        } 
        visibleProcesses() { 
            const processes = (this.snapshot?.processes || []).filter((proc) => !this.filter || proc.name.toLowerCase().includes(this.filter.toLowerCase()) ||         String(proc.pid).includes(this.filter)); 
            processes.sort((a, b) => this.sort === 'MEM' ? b.memory - a.memory : b.cpu - a.cpu); 
            return processes.slice(0, Math.max(1, Math.min(18, (process.stdout.rows || 24) - 22)));   
        } 
        render() {     
            if (this.mode === 'auth') { 
                this.ui.drawAuth(this.authForm);

                return; 
            } 
            const visibleProcesses = this.visibleProcesses(); 
            this.selectedProcess = Math.max(0, Math.min(visibleProcesses.length - 1, this.selectedProcess)); 
            this.ui.drawDashboard(this.snapshot || { 
            hostname: 'Collecting system data', platform: '', sampledAt: new Date(), cpuModel: 'Warming up', 
            cpuCores: 0, cpu: [], load: [0, 0, 0], memory: { total: 0, used: 0, free: 0 }, 
            uptime: 0, sensors: [], disks: [], 
        }, 
        { 
            visibleProcesses, selectedProcess: this.selectedProcess, sort: this.sort, filter: this.filter, user: this.user });   
        }  
        handleKey(key) { 
            if (key.ctrl && key.name === 'c') return this.stop();     
            if (this.mode === 'auth') return this.handleAuthKey(key);
            if (this.filtering) { 
            if (key.name === 'escape') { 
            this.filtering = false; this.filter = ''; } 
            else if (key.name === 'return') 
                this.filtering = false; 
            else if (key.name === 'backspace') 
                this.filter = this.filter.slice(0, -1); 
            else if (key.sequence && key.sequence.length === 1 && !key.ctrl) 
                this.filter += key.sequence; 
            this.render(); 
            return; 
        } 
    if (key.name === 'q' || key.name === 'escape') { 
        if (this.filter) { 
            this.filter = ''; 
            this.render(); 
        } 
        else this.stop(); 
    } 
    else if (key.name === 'up') { 
        this.selectedProcess = Math.max(0, this.selectedProcess - 1); 
        this.render(); 
    } 
    else if (key.name === 'down') { 
        this.selectedProcess = Math.min(this.visibleProcesses().length - 1, 
        this.selectedProcess + 1); 
        this.render(); 
    }
    else if (key.name === 'tab') { 
        this.sort = this.sort === 'CPU' ? 'MEM' : 'CPU'; 
        this.selectedProcess = 0; 
        this.render();
    }
    else if (key.name === 'r') 
        this.refresh(); 
    else if (key.name === '/') { 
        this.filtering = true; 
        this.filter = ''; 
        this.render(); 
    } 
}  
handleAuthKey(key) { 
    const fields = this.authForm.mode === 'signup' ? ['name', 'email', 'password'] : ['email', 'password']; 
    const index = this.authForm.focus;
    if (key.name === 'f2') { 
        this.authForm.mode = this.authForm.mode === 'signup' ? 'signin' : 'signup';   
        this.authForm.focus = 0; 
        this.authForm.notice = ''; 
    } 
    else if (key.name === 'tab' || key.name === 'down' || key.name === 'up') { 
        const direction = key.name === 'up' ? -1 : 1; 
        this.authForm.focus = (this.authForm.focus + direction + fields.length) % fields.length; 
    } 
    else if (key.name === 'return') { 
        if (index === fields.length - 1) 
            return this.submitAuth(); 
        this.authForm.focus = Math.min(fields.length - 1, index + 1);   
    } 
    else if (key.name === 'backspace') { 
        const field = fields[index]; 
        this.authForm[field] = this.authForm[field].slice(0, -1);    
    } 
    else if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) { 
        const field = fields[index]; 
        this.authForm[field] += key.sequence;
    } 
    this.render(); 
} 
async submitAuth() {  
    this.authForm.notice = 'Connecting to Firebase…'; 
    this.render(); 139    
    try { 
        this.user = await this.auth.authenticate({ 
            email: this.authForm.email.trim(), 
            password: this.authForm.password, 
            displayName: this.authForm.name.trim(), 
            createAccount: this.authForm.mode === 'signup', 
        }); 
        this.mode = 'dashboard';   
        this.refresh(); 
    } catch (error) { 
        this.authForm.notice = error.message; 
        this.render(); 
    } 
} 
} 
const app = new SystemTasksApp(); 
app.start().catch((error) => app.fail(error));
