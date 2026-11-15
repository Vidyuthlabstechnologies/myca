param(
  [string]$Domain = "unvisited-thirstily-chemist.ngrok-free.dev",
  [string]$Branch = "develop",
  [string]$DatabaseUrl = "",
  [int]$Port = 8080,
  [switch]$AllowOutside
)
$ErrorActionPreference = "Stop"
function Check($what) { if ($LASTEXITCODE -ne 0) { throw "$what failed (exit $LASTEXITCODE)" } }
function Need($tool, $hint) { if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "$tool is not installed. $hint" } }

Need git "Install Git for Windows."
Need node "Install Node.js 22 from nodejs.org."
Need ngrok "Install ngrok and run: ngrok config add-authtoken <your token>."

$work = Join-Path $env:USERPROFILE "myca-sandbox"
if (-not (Test-Path $work)) { git clone https://github.com/Vidyuthlabstechnologies/myca.git $work; Check "git clone" }
Push-Location $work
try {
  git fetch origin $Branch; Check "git fetch"
  git checkout -B $Branch "origin/$Branch"; Check "git checkout"
  Push-Location cloud
  npm ci --ignore-scripts; Check "npm ci"
  Pop-Location

  if (-not $DatabaseUrl) {
    Need docker "Install Docker Desktop, or pass -DatabaseUrl postgres://user@127.0.0.1:5432/myca_sandbox for a Postgres you already run."
    $running = docker ps -a --filter "name=^myca-sandbox-db$" --format "{{.Status}}"
    if (-not $running) {
      docker run -d --name myca-sandbox-db -e POSTGRES_USER=myca -e POSTGRES_HOST_AUTH_METHOD=trust -p 127.0.0.1:5439:5432 -v myca-sandbox-db:/var/lib/postgresql/data postgres:16 | Out-Null; Check "docker run postgres"
    } elseif ($running -notlike "Up*") {
      docker start myca-sandbox-db | Out-Null; Check "docker start"
    }
    for ($i = 0; $i -lt 30; $i++) { docker exec myca-sandbox-db pg_isready -U myca 2>$null | Out-Null; if ($LASTEXITCODE -eq 0) { break }; Start-Sleep -Seconds 1 }
    $DatabaseUrl = "postgres://myca@127.0.0.1:5439/myca_sandbox"
  }

  Start-Process ngrok -ArgumentList @("http", "--url=$Domain", "$Port") | Out-Null
  $env:MYCA_DATABASE_URL = $DatabaseUrl
  $extra = @()
  if ($AllowOutside) { $extra += "--allow-outside" }
  node scripts/sandbox-server.mjs "--public-url=https://$Domain" "--port=$Port" @extra
} finally {
  Pop-Location
}
