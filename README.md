 
 # System Tasks Viewer 
 A small Node.js terminal dashboard for watching CPU activity, memory use, temperatures exposed by the host OS, mounted disk usage, and the process list. It uses the terminal directly, so there is no browser or web server.
 
 ## Requirements
 - Node.js 18 or newer
 - A terminal that supports ANSI escape sequences
 - A Firebase project with Email/Password sign-in enabled 
 
 ## Configure Firebase
 
  Copy `.env.example` to `.env` and fill in the web API key and project ID from Firebase Project settings. Enable **Authentication → Sign-in method → Email/Password** in the Firebase console. The app calls Firebase Identity Toolkit over HTTPS; passwords and session tokens are kept in memory and are not written to disk. 
  
  ```sh 
  cp .env.example .env 
  ``` 
  
  ## Run 
  
  ```sh 
  npm start 
  ``` 
  
  The first screen creates an account by default. Use **F2** to switch between sign-up and sign-in. The dashboard appears after Firebase accepts the credentials. 
  
  ## Keyboard controls 
  
  | Key | Action | 
  | --- | --- | 
  | `↑` / `↓` | Select a process | 
  | `Tab` | Toggle process sorting between CPU and memory | 
  | `/` | Filter process names or PIDs; press `Enter` to finish | 
  | `Esc` | Clear a filter, or quit when no filter is active | 
  | `R` | Refresh system information | 
  | `Q` / `Ctrl+C` | Quit | 
  | `F2` | Switch sign-in and sign-up screens | 
  
  Resize the terminal to reflow the dashboard. CPU utilization, memory, uptime, and load averages use Node's built-in OS APIs. On macOS and Linux, process and disk summaries come from `ps` and `df`; on Windows, the app reads process and drive data through PowerShell/CIM. Linux thermal zones and GPU utilization are read from sysfs when the driver exposes them. On macOS, install the optional `osx-cpu-temp` command to display CPU temperature; the dashboard reports when a host does not expose sensor data. 
  
  ## Notes 
  The process list is read-only: the app does not terminate processes or change system settings. Sensor availability varies by OS and hardware. The Firebase project is supplied by the developer; no credentials or project configuration are bundled.