# escape=`
# Windows container required — AD PowerShell module only runs on Windows.
# Docker Desktop must be switched to Windows containers mode.
FROM mcr.microsoft.com/windows/servercore:ltsc2022

SHELL ["powershell", "-Command", "$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue';"]

# Install Node.js 20 LTS
RUN Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi' `
        -OutFile 'C:\node.msi'; `
    Start-Process msiexec.exe -Wait -ArgumentList '/i C:\node.msi /quiet /norestart'; `
    Remove-Item -Force 'C:\node.msi'

# Install RSAT Active Directory PowerShell module (required for AD cmdlets)
RUN Install-WindowsFeature -Name RSAT-AD-PowerShell

WORKDIR C:\app

COPY package*.json ./

# Install all deps — devDeps (vite, etc.) are needed for the build step
RUN npm ci

# Vite bakes these into the JS bundle at build time.
# Pass via: docker build --build-arg VITE_DEFAULT_DC=10.0.0.10 ...
# Or set them in docker-compose.yml build.args (reads from your shell/.env).
ARG VITE_DEFAULT_DC
ARG VITE_DEFAULT_OU
ENV VITE_DEFAULT_DC=${VITE_DEFAULT_DC}
ENV VITE_DEFAULT_OU=${VITE_DEFAULT_OU}

COPY . .

# Build the React frontend, then strip devDependencies
RUN npm run build; npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "server/index.js"]
