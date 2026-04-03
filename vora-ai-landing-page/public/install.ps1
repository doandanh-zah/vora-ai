# Vora Installer for Windows (PowerShell)
# Usage: iwr -useb https://heyvora.fun/install.ps1 | iex
# Or: & ([scriptblock]::Create((iwr -useb https://heyvora.fun/install.ps1))) -NoOnboard

param(
    [string]$InstallMethod = "npm",
    [string]$Tag = "latest",
    [string]$GitDir = "$env:USERPROFILE\vora",
    [switch]$NoOnboard,
    [switch]$NoGitUpdate,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

# Colors
$ACCENT = "`e[38;2;0;153;255m"    # coral-bright
$SUCCESS = "`e[38;2;0;229;204m"    # cyan-bright
$WARN = "`e[38;2;255;176;32m"     # amber
$ERROR_COLOR = "`e[38;2;230;57;70m"     # coral-mid
$MUTED = "`e[38;2;90;100;128m"    # text-muted
$NC = "`e[0m"                     # No Color

function Write-ColorHost {
    param([string]$Message, [string]$Level = "info")
    $msg = switch ($Level) {
        "success" { "$SUCCESS✓$NC $Message" }
        "warn" { "$WARN!$NC $Message" }
        "error" { "$ERROR_COLOR✗$NC $Message" }
        default { "$MUTED·$NC $Message" }
    }
    Microsoft.PowerShell.Utility\Write-Host $msg
}

function Write-Banner {
    Write-ColorHost ""
    Write-ColorHost "${ACCENT}  🌊 Vora Installer$NC" -Level info
    Write-ColorHost "${MUTED}  `"Hey Vora`" - The voice-first AI agent powered by Agora.$NC" -Level info
    Write-ColorHost ""
}

function Get-ExecutionPolicyStatus {
    $policy = Get-ExecutionPolicy
    if ($policy -eq "Restricted" -or $policy -eq "AllSigned") {
        return @{ Blocked = $true; Policy = $policy }
    }
    return @{ Blocked = $false; Policy = $policy }
}

function Test-Admin {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Ensure-ExecutionPolicy {
    $status = Get-ExecutionPolicyStatus
    if ($status.Blocked) {
        Write-ColorHost "PowerShell execution policy is set to: $($status.Policy)" -Level warn
        Write-ColorHost "This prevents scripts like npm.ps1 from running." -Level warn
        Write-ColorHost ""
        
        # Try to set execution policy for current process
        try {
            Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process -ErrorAction Stop
            Write-ColorHost "Set execution policy to RemoteSigned for current process" -Level success
            return $true
        } catch {
            Write-ColorHost "Could not automatically set execution policy" -Level error
            Write-ColorHost ""
            Write-ColorHost "To fix this, run:" -Level info
            Write-ColorHost "  Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process" -Level info
            Write-ColorHost ""
            Write-ColorHost "Or run PowerShell as Administrator and execute:" -Level info
            Write-ColorHost "  Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope LocalMachine" -Level info
            return $false
        }
    }
    return $true
}

function Get-NodeVersion {
    try {
        $version = node --version 2>$null
        if ($version) {
            return $version -replace '^v', ''
        }
    } catch { }
    return $null
}

function Get-NpmVersion {
    try {
        $version = npm --version 2>$null
        if ($version) {
            return $version
        }
    } catch { }
    return $null
}

function Install-Node {
    Write-ColorHost "Node.js not found" -Level info
    Write-ColorHost "Installing Node.js..." -Level info
    
    # Try winget first
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-ColorHost "  Using winget..." -Level info
        try {
            winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements 2>&1 | Out-Null
            # Refresh PATH
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
            Write-ColorHost "  Node.js installed via winget" -Level success
            return $true
        } catch {
            Write-ColorHost "  Winget install failed: $_" -Level warn
        }
    }
    
    # Try chocolatey
    if (Get-Command choco -ErrorAction SilentlyContinue) {
        Write-ColorHost "  Using chocolatey..." -Level info
        try {
            choco install nodejs-lts -y 2>&1 | Out-Null
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
            Write-ColorHost "  Node.js installed via chocolatey" -Level success
            return $true
        } catch {
            Write-ColorHost "  Chocolatey install failed: $_" -Level warn
        }
    }
    
    # Try scoop
    if (Get-Command scoop -ErrorAction SilentlyContinue) {
        Write-ColorHost "  Using scoop..." -Level info
        try {
            scoop install nodejs-lts 2>&1 | Out-Null
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
            Write-ColorHost "  Node.js installed via scoop" -Level success
            return $true
        } catch {
            Write-ColorHost "  Scoop install failed: $_" -Level warn
        }
    }
    
    Write-ColorHost "Could not install Node.js automatically" -Level error
    Write-ColorHost "Please install Node.js 22+ manually from: https://nodejs.org" -Level info
    return $false
}

function Ensure-Node {
    $nodeVersion = Get-NodeVersion
    if ($nodeVersion) {
        $major = [int]($nodeVersion -split '\.')[0]
        if ($major -ge 22) {
            Write-ColorHost "Node.js v$nodeVersion found" -Level success
            return $true
        }
        Write-ColorHost "Node.js v$nodeVersion found, but need v22+" -Level warn
    }
    return Install-Node
}

function Get-GitVersion {
    try {
        $version = git --version 2>$null
        if ($version) {
            return $version
        }
    } catch { }
    return $null
}

function Install-Git {
    Write-ColorHost "Git not found" -Level info
    
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-ColorHost "  Installing Git via winget..." -Level info
        try {
            winget install Git.Git --accept-package-agreements --accept-source-agreements 2>&1 | Out-Null
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
            Write-ColorHost "  Git installed" -Level success
            return $true
        } catch {
            Write-ColorHost "  Winget install failed" -Level warn
        }
    }
    
    Write-ColorHost "Please install Git for Windows from: https://git-scm.com" -Level error
    return $false
}

function Ensure-Git {
    $gitVersion = Get-GitVersion
    if ($gitVersion) {
        Write-ColorHost "$gitVersion found" -Level success
        return $true
    }
    return Install-Git
}

function Install-VoraNpm {
    param([string]$Target = "latest")

    $installSpec = Resolve-PackageInstallSpec -Target $Target
    
    Write-ColorHost "Installing Vora ($installSpec)..." -Level info
    
    try {
        # Use -ExecutionPolicy Bypass to handle restricted execution policy
        npm install -g $installSpec --no-fund --no-audit 2>&1
        Write-ColorHost "Vora installed" -Level success
        return $true
    } catch {
        Write-ColorHost "npm install failed: $_" -Level error
        return $false
    }
}

function Install-VoraGit {
    param([string]$RepoDir, [switch]$Update)
    
    Write-ColorHost "Installing Vora from git..." -Level info
    
    if (!(Test-Path $RepoDir)) {
        Write-ColorHost "  Cloning repository..." -Level info
        git clone https://github.com/vora/vora.git $RepoDir 2>&1
    } elseif ($Update) {
        Write-ColorHost "  Updating repository..." -Level info
        git -C $RepoDir pull --rebase 2>&1
    }
    
    # Install pnpm if not present
    if (!(Get-Command pnpm -ErrorAction SilentlyContinue)) {
        Write-ColorHost "  Installing pnpm..." -Level info
        npm install -g pnpm 2>&1
    }
    
    # Install dependencies
    Write-ColorHost "  Installing dependencies..." -Level info
    pnpm install --dir $RepoDir 2>&1
    
    # Build
    Write-ColorHost "  Building..." -Level info
    pnpm --dir $RepoDir build 2>&1
    
    # Create wrapper
    $wrapperDir = "$env:USERPROFILE\.local\bin"
    if (!(Test-Path $wrapperDir)) {
        New-Item -ItemType Directory -Path $wrapperDir -Force | Out-Null
    }
    
    @"
@echo off
node "%~dp0..\vora\dist\entry.js" %*
"@ | Out-File -FilePath "$wrapperDir\vora.cmd" -Encoding ASCII -Force
    
    Write-ColorHost "Vora installed" -Level success
    return $true
}

function Test-ExplicitPackageInstallSpec {
    param([string]$Target)

    if ([string]::IsNullOrWhiteSpace($Target)) {
        return $false
    }

    return $Target.Contains("://") -or
        $Target.Contains("#") -or
        $Target -match '^(file|github|git\+ssh|git\+https|git\+http|git\+file|npm):'
}

function Resolve-PackageInstallSpec {
    param([string]$Target = "latest")

    $trimmed = $Target.Trim()
    if ([string]::IsNullOrWhiteSpace($trimmed)) {
        return "vora-ai@latest"
    }
    if ($trimmed.ToLowerInvariant() -eq "main") {
        return "github:vora-ai/vora-core#main"
    }
    if (Test-ExplicitPackageInstallSpec -Target $trimmed) {
        return $trimmed
    }
    return "vora-ai@$trimmed"
}

function Add-ToPath {
    param([string]$Path)
    
    $currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($currentPath -notlike "*$Path*") {
        [Environment]::SetEnvironmentVariable("Path", "$currentPath;$Path", "User")
        Write-ColorHost "Added $Path to user PATH" -Level info
    }
}

# Main
function Main {
    Write-Banner
    
    Write-ColorHost "Windows detected" -Level success
    
    # Check and handle execution policy FIRST, before any npm calls
    if (!(Ensure-ExecutionPolicy)) {
        Write-ColorHost ""
        Write-ColorHost "Installation cannot continue due to execution policy restrictions" -Level error
        exit 1
    }
    
    if (!(Ensure-Node)) {
        exit 1
    }
    
    if ($InstallMethod -eq "git") {
        if (!(Ensure-Git)) {
            exit 1
        }
        
        if ($DryRun) {
            Write-ColorHost "[DRY RUN] Would install Vora from git to $GitDir" -Level info
        } else {
            Install-VoraGit -RepoDir $GitDir -Update:(-not $NoGitUpdate)
        }
    } else {
        # npm method
        if (!(Ensure-Git)) {
            Write-ColorHost "Git is required for npm installs. Please install Git and try again." -Level warn
        }
        
        if ($DryRun) {
            Write-ColorHost "[DRY RUN] Would install Vora via npm ($((Resolve-PackageInstallSpec -Target $Tag)))" -Level info
        } else {
            if (!(Install-VoraNpm -Target $Tag)) {
                exit 1
            }
        }
    }
    
    # Try to add npm global bin to PATH
    try {
        $npmPrefix = npm config get prefix 2>$null
        if ($npmPrefix) {
            Add-ToPath -Path "$npmPrefix"
        }
    } catch { }
    
    if (!$NoOnboard -and !$DryRun) {
        Write-ColorHost ""
        Write-ColorHost "Starting onboarding process..." -Level info
        
        try {
            & vora onboard
        } catch {
            Write-ColorHost "Failed to start onboard automatically. Run 'vora onboard' to complete setup" -Level error
        }
    }
    
    Write-ColorHost ""
    Write-ColorHost "🌊 Vora installed successfully!" -Level success
}

Main
